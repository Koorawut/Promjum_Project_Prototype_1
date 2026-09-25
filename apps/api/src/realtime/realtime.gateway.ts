import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { MatchmakingQueueService, QueuedPlayer } from './matchmaking-queue.service';
import { MatchRuntimeService, RoundState, RuntimeGameImage } from './match-runtime.service';
import { authenticateSocket } from '../common/guards/ws-auth.guard';
import { computeRoundScore, ROUND_TIME_LIMIT_SEC } from '../game/scoring.util';

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly queue: MatchmakingQueueService,
    private readonly runtime: MatchRuntimeService,
  ) {}

  handleConnection(socket: Socket) {
    const identity = authenticateSocket(this.jwtService, socket);
    if (!identity) {
      socket.disconnect(true);
      return;
    }
    socket.data.userId = identity.userId;
    socket.data.username = identity.username;
  }

  handleDisconnect(socket: Socket) {
    this.queue.removeBySocketId(socket.id);

    const state = this.runtime.getBySocketId(socket.id);
    if (state) {
      const opponent = this.runtime.getOpponent(state, socket.data.userId);
      this.server.to(opponent.socketId).emit('match_end', {
        matchId: state.matchSessionId,
        reason: 'opponent_disconnected',
        totalScores: state.totalScores,
      });
      void this.finalizeMatch(state.matchSessionId, state.totalScores);
      this.runtime.remove(state.matchSessionId);
    }
  }

  @SubscribeMessage('join_queue')
  async handleJoinQueue(socket: Socket) {
    const player: QueuedPlayer = {
      userId: socket.data.userId,
      username: socket.data.username,
      socketId: socket.id,
    };
    this.queue.enqueue(player);

    const pair = this.queue.tryDequeuePair();
    if (pair) {
      await this.startMatch(pair);
    }
  }

  @SubscribeMessage('leave_queue')
  handleLeaveQueue(socket: Socket) {
    this.queue.removeByUserId(socket.data.userId);
  }

  @SubscribeMessage('submit_answer')
  async handleSubmitAnswer(socket: Socket, payload: { chosenImageId: string }) {
    const state = this.runtime.getBySocketId(socket.id);
    if (!state || !state.currentRound || state.currentRound.resolved) {
      return;
    }
    const round = state.currentRound;
    if (round.guesserUserId !== socket.data.userId) {
      return; // only the guesser may submit
    }
    await this.resolveRound(state, round, payload.chosenImageId);
  }

  @SubscribeMessage('webrtc_signal')
  handleWebrtcSignal(socket: Socket, payload: { signal: unknown }) {
    const state = this.runtime.getBySocketId(socket.id);
    if (!state) {
      return;
    }
    const opponent = this.runtime.getOpponent(state, socket.data.userId);
    this.server.to(opponent.socketId).emit('webrtc_signal', { signal: payload.signal });
  }

  private async startMatch(pair: [QueuedPlayer, QueuedPlayer]) {
    const [a, b] = pair;

    const matchSession = await this.prisma.matchSession.create({
      data: {
        status: 'in_progress',
        participants: {
          create: [{ userId: a.userId }, { userId: b.userId }],
        },
      },
    });

    this.runtime.create({
      matchSessionId: matchSession.id,
      participants: [
        { userId: a.userId, username: a.username, socketId: a.socketId },
        { userId: b.userId, username: b.username, socketId: b.socketId },
      ],
      currentRound: null,
      totalScores: { [a.userId]: 0, [b.userId]: 0 },
    });

    this.server.to(a.socketId).emit('matched', { matchId: matchSession.id, opponent: { username: b.username } });
    this.server.to(b.socketId).emit('matched', { matchId: matchSession.id, opponent: { username: a.username } });

    await this.startRound(matchSession.id, 1, a.userId, b.userId);
  }

  private async startRound(matchSessionId: string, roundNumber: number, describerUserId: string, guesserUserId: string) {
    const state = this.runtime.get(matchSessionId);
    if (!state) {
      return;
    }

    const imageSet = await this.prisma.imageSet.findFirst({
      skip: Math.floor(Math.random() * (await this.prisma.imageSet.count())),
      include: { images: true },
    });
    if (!imageSet || imageSet.images.length === 0) {
      return;
    }

    const images: RuntimeGameImage[] = shuffle(
      imageSet.images.map((img) => ({
        id: img.id,
        imageUrl: img.imageUrl,
        label: img.label,
        isCorrect: img.isCorrect,
      })),
    );
    const correctImage = images.find((img) => img.isCorrect) as RuntimeGameImage;

    const round: RoundState = {
      roundNumber,
      describerUserId,
      guesserUserId,
      imageSetId: imageSet.id,
      images,
      correctImageId: correctImage.id,
      startedAtMs: Date.now(),
      timeoutHandle: null,
      resolved: false,
    };
    state.currentRound = round;

    const describer = state.participants.find((p) => p.userId === describerUserId)!;
    const guesser = state.participants.find((p) => p.userId === guesserUserId)!;

    this.server.to(describer.socketId).emit('round_start', {
      roundNumber,
      role: 'describer',
      targetImage: { id: correctImage.id, imageUrl: correctImage.imageUrl, label: correctImage.label },
      timeLimitSec: ROUND_TIME_LIMIT_SEC,
    });

    this.server.to(guesser.socketId).emit('round_start', {
      roundNumber,
      role: 'guesser',
      images: images.map(({ id, imageUrl, label }) => ({ id, imageUrl, label })),
      timeLimitSec: ROUND_TIME_LIMIT_SEC,
    });

    round.timeoutHandle = setTimeout(() => {
      void this.resolveRound(state, round, null);
    }, ROUND_TIME_LIMIT_SEC * 1000);
  }

  private async resolveRound(state: ReturnType<MatchRuntimeService['get']>, round: RoundState, chosenImageId: string | null) {
    if (!state || round.resolved) {
      return;
    }
    round.resolved = true;
    if (round.timeoutHandle) {
      clearTimeout(round.timeoutHandle);
      round.timeoutHandle = null;
    }

    const elapsedMs = Date.now() - round.startedAtMs;
    const isCorrect = chosenImageId !== null && chosenImageId === round.correctImageId;
    const score = computeRoundScore(isCorrect, elapsedMs);

    state.totalScores[round.guesserUserId] = (state.totalScores[round.guesserUserId] ?? 0) + score;

    await this.prisma.matchRound.create({
      data: {
        matchSessionId: state.matchSessionId,
        roundNumber: round.roundNumber,
        describerId: round.describerUserId,
        guesserId: round.guesserUserId,
        imageSetId: round.imageSetId,
        correctImageId: round.correctImageId,
        chosenImageId: chosenImageId ?? undefined,
        isCorrect,
        score,
        elapsedMs,
      },
    });

    for (const p of state.participants) {
      this.server.to(p.socketId).emit('round_result', {
        roundNumber: round.roundNumber,
        correctImageId: round.correctImageId,
        chosenImageId,
        isCorrect,
        score,
        totalScores: state.totalScores,
      });
    }

    if (round.roundNumber >= this.runtime.totalRounds) {
      await this.finalizeMatch(state.matchSessionId, state.totalScores);
      for (const p of state.participants) {
        this.server.to(p.socketId).emit('match_end', {
          matchId: state.matchSessionId,
          reason: 'completed',
          totalScores: state.totalScores,
        });
      }
      this.runtime.remove(state.matchSessionId);
      return;
    }

    // Swap roles for the next round.
    await this.startRound(state.matchSessionId, round.roundNumber + 1, round.guesserUserId, round.describerUserId);
  }

  private async finalizeMatch(matchSessionId: string, totalScores: Record<string, number>) {
    await this.prisma.matchSession.update({
      where: { id: matchSessionId },
      data: { status: 'completed', endedAt: new Date() },
    });
    await Promise.all(
      Object.entries(totalScores).map(([userId, score]) =>
        this.prisma.matchParticipant.update({
          where: { matchSessionId_userId: { matchSessionId, userId } },
          data: { totalScore: score },
        }),
      ),
    );
  }
}
