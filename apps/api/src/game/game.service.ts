import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GameService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string, matchSessionId: string) {
    const match = await this.prisma.matchSession.findUnique({
      where: { id: matchSessionId },
      include: {
        participants: { include: { user: { select: { id: true, username: true } } } },
        rounds: { orderBy: { roundNumber: 'asc' } },
      },
    });
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    const me = match.participants.find((p) => p.userId === userId);
    if (!me) {
      throw new ForbiddenException('You were not part of this match');
    }
    const opponent = match.participants.find((p) => p.userId !== userId);

    return {
      matchId: match.id,
      status: match.status,
      you: { userId, username: me.user.username, totalScore: me.totalScore },
      opponent: opponent
        ? { userId: opponent.userId, username: opponent.user.username, totalScore: opponent.totalScore }
        : null,
      rounds: match.rounds.map((r) => ({
        roundNumber: r.roundNumber,
        describerId: r.describerId,
        guesserId: r.guesserId,
        isCorrect: r.isCorrect,
        score: r.score,
        elapsedMs: r.elapsedMs,
      })),
    };
  }
}
