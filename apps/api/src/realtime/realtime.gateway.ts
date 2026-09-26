import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { MatchmakingQueueService, QueuedPlayer } from './matchmaking-queue.service';
import { MatchRuntimeService, MatchRuntimeState, RoundState, RuntimeGameImage } from './match-runtime.service';
import { authenticateSocket } from '../common/guards/ws-auth.guard';
import { computeRoundScore, ROUND_TIME_LIMIT_SEC } from '../game/scoring.util';
import { PresenceService } from './presence.service';

// Max time to wait for both peers' voice to connect before starting round 1
// anyway (first-ever TURN allocation can be slow; don't block forever).
const VOICE_READY_TIMEOUT_MS = 12_000;

// After a match completes naturally, voice stays connected through the
// summary page until either player clicks "finish" or this expires.
const POST_MATCH_CALL_TIMEOUT_MS = 30_000;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly queue: MatchmakingQueueService,
    private readonly runtime: MatchRuntimeService,
    private readonly presence: PresenceService,
  ) {}

  afterInit(server: Server) {
    this.presence.setServer(server);
  }

  handleConnection(socket: Socket) {
    const identity = authenticateSocket(this.jwtService, socket);
    if (!identity) {
      socket.disconnect(true);
      return;
    }
    socket.data.userId = identity.userId;
    socket.data.username = identity.username;
    this.presence.addSocket(identity.userId, socket.id);
  }

  handleDisconnect(socket: Socket) {
    this.presence.removeSocket(socket.data.userId, socket.id);
    this.queue.removeBySocketId(socket.id);

    const state = this.runtime.getBySocketId(socket.id);
    if (!state) {
      return;
    }
    const opponent = this.runtime.getOpponent(state, socket.data.userId);
    if (state.matchCompleted) {
      // Gameplay already finished; this was just the post-match voice call
      // and one side hung up — end it for the other side too.
      this.server.to(opponent.socketId).emit('call_end');
      this.runtime.remove(state.matchSessionId);
      return;
    }
    this.server.to(opponent.socketId).emit('match_end', {
      matchId: state.matchSessionId,
      reason: 'opponent_disconnected',
      totalScores: state.totalScores,
    });
    void this.finalizeMatch(state.matchSessionId, state.totalScores);
    this.runtime.remove(state.matchSessionId);
  }

  // Explicit voluntary exit (the in-game "X" button), as opposed to a raw
  // socket disconnect: notify the opponent with a distinct reason so the
  // client can show "your friend left" before redirecting home, then tear
  // the match down the same way a disconnect would.
  @SubscribeMessage('leave_match')
  handleLeaveMatch(socket: Socket) {
    const state = this.runtime.getBySocketId(socket.id);
    if (!state) {
      return;
    }
    const opponent = this.runtime.getOpponent(state, socket.data.userId);
    if (state.matchCompleted) {
      this.server.to(opponent.socketId).emit('call_end');
      this.runtime.remove(state.matchSessionId);
      return;
    }
    this.server.to(opponent.socketId).emit('match_end', {
      matchId: state.matchSessionId,
      reason: 'opponent_left',
      totalScores: state.totalScores,
    });
    void this.finalizeMatch(state.matchSessionId, state.totalScores);
    this.runtime.remove(state.matchSessionId);
  }

  // Sent from the summary page's "เสร็จสิ้น" button: either player can end
  // the still-connected post-match voice call for both sides at once.
  @SubscribeMessage('finish_match')
  handleFinishMatch(socket: Socket) {
    const state = this.runtime.getBySocketId(socket.id);
    if (!state || !state.matchCompleted) {
      return;
    }
    for (const p of state.participants) {
      this.server.to(p.socketId).emit('call_end');
    }
    this.runtime.remove(state.matchSessionId);
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

  // Client reports its RTCPeerConnection reached "connected" (both peers
  // send this independently). Round 1 waits for both, so the game never
  // starts while voice is still negotiating — this is what fixes rounds
  // starting before audio is ready, especially on a slow first TURN
  // allocation. A fallback timeout still starts the round if voice never
  // connects, so a broken connection can't block the match forever.
  @SubscribeMessage('voice_ready')
  handleVoiceReady(socket: Socket) {
    const state = this.runtime.getBySocketId(socket.id);
    if (!state || state.firstRoundStarted) {
      return;
    }
    state.voiceReady.add(socket.data.userId);
    const [a, b] = state.participants;
    if (state.voiceReady.has(a.userId) && state.voiceReady.has(b.userId)) {
      this.beginFirstRound(state);
    }
  }

  private beginFirstRound(state: NonNullable<ReturnType<MatchRuntimeService['get']>>) {
    if (state.firstRoundStarted) {
      return;
    }
    state.firstRoundStarted = true;
    if (state.voiceReadyTimeout) {
      clearTimeout(state.voiceReadyTimeout);
      state.voiceReadyTimeout = null;
    }
    const [a, b] = state.participants;
    void this.startRound(state.matchSessionId, 1, a.userId, b.userId);
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

    const state: MatchRuntimeState = {
      matchSessionId: matchSession.id,
      participants: [
        { userId: a.userId, username: a.username, socketId: a.socketId },
        { userId: b.userId, username: b.username, socketId: b.socketId },
      ],
      currentRound: null,
      totalScores: { [a.userId]: 0, [b.userId]: 0 },
      voiceReady: new Set(),
      firstRoundStarted: false,
      voiceReadyTimeout: null,
      matchCompleted: false,
      postMatchTimeout: null,
    };
    this.runtime.create(state);

    // Deterministic tiebreak so both clients agree on who sends the WebRTC
    // offer, independent of round role (voice must connect before round 1
    // even starts, so it can't wait for a describer/guesser assignment).
    const aIsInitiator = a.userId < b.userId;
    this.server.to(a.socketId).emit('matched', {
      matchId: matchSession.id,
      opponent: { username: b.username },
      isInitiator: aIsInitiator,
    });
    this.server.to(b.socketId).emit('matched', {
      matchId: matchSession.id,
      opponent: { username: a.username },
      isInitiator: !aIsInitiator,
    });

    // Give voice up to VOICE_READY_TIMEOUT_MS to connect (first-ever TURN
    // allocation on a connection can be noticeably slower than later ones);
    // start anyway after that so a stuck connection never blocks the match.
    state.voiceReadyTimeout = setTimeout(() => {
      this.beginFirstRound(state);
    }, VOICE_READY_TIMEOUT_MS);
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
      // Gameplay is done, but keep the runtime state (and thus the voice
      // call) alive through the summary page until someone clicks "finish"
      // or this fallback timeout fires — whichever comes first.
      state.matchCompleted = true;
      state.postMatchTimeout = setTimeout(() => {
        for (const p of state.participants) {
          this.server.to(p.socketId).emit('call_end');
        }
        this.runtime.remove(state.matchSessionId);
      }, POST_MATCH_CALL_TIMEOUT_MS);
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
