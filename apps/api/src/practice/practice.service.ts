import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';

const SESSION_TOKEN_TTL = '2h';

interface SessionTokenClaims {
  userId: string;
  categoryId: string;
  sentenceIds: string[];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private signSessionToken(claims: SessionTokenClaims): string {
    return this.jwtService.sign(claims, {
      secret: process.env.SESSION_TOKEN_SECRET,
      expiresIn: SESSION_TOKEN_TTL,
    });
  }

  private verifySessionToken(token: string): SessionTokenClaims {
    try {
      return this.jwtService.verify<SessionTokenClaims>(token, {
        secret: process.env.SESSION_TOKEN_SECRET,
      });
    } catch {
      throw new NotFoundException('Session not found or expired');
    }
  }

  async createSession(userId: string, dto: CreateSessionDto) {
    const count = dto.count ?? 3;

    const allSentences = await this.prisma.sentence.findMany({
      where: { categoryId: dto.categoryId },
      select: { id: true },
    });
    if (allSentences.length === 0) {
      throw new BadRequestException('Category has no sentences');
    }
    const allIds = allSentences.map((s) => s.id);

    const completedProgress = await this.prisma.userSentenceProgress.findMany({
      where: { userId, status: 'completed', sentence: { categoryId: dto.categoryId } },
      select: { sentenceId: true },
    });
    const completedIds = completedProgress.map((p) => p.sentenceId);
    const newIds = allIds.filter((id) => !completedIds.includes(id));

    let chosenIds: string[];

    if (completedIds.length === 0) {
      // No history at all -> all new.
      chosenIds = shuffle(newIds).slice(0, Math.min(count, newIds.length));
    } else if (count === 3 && newIds.length >= 2 && completedIds.length >= 1) {
      chosenIds = [...shuffle(newIds).slice(0, 2), ...shuffle(completedIds).slice(0, 1)];
    } else if (count === 2 && newIds.length >= 1 && completedIds.length >= 1) {
      chosenIds = [...shuffle(newIds).slice(0, 1), ...shuffle(completedIds).slice(0, 1)];
    } else {
      // Not enough of one bucket to mix -> fall back to all-new (or all available if fewer than count).
      const pool = newIds.length >= count ? newIds : allIds;
      chosenIds = shuffle(pool).slice(0, Math.min(count, pool.length));
    }

    chosenIds = shuffle(chosenIds);

    const sessionId = this.signSessionToken({ userId, categoryId: dto.categoryId, sentenceIds: chosenIds });
    return { sessionId };
  }

  async getSession(userId: string, sessionId: string) {
    const claims = this.verifySessionToken(sessionId);
    if (claims.userId !== userId) {
      throw new ForbiddenException('Session does not belong to this user');
    }

    const sentences = await this.prisma.sentence.findMany({
      where: { id: { in: claims.sentenceIds } },
      include: { quiz: true },
    });
    const byId = new Map(sentences.map((s) => [s.id, s]));

    const orderedSentences = claims.sentenceIds
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((s) => ({
        id: s.id,
        text: s.text,
        audioUrl: s.audioUrl,
        imageUrl: s.imageUrl,
        quiz: s.quiz
          ? { question: s.quiz.question, options: s.quiz.options }
          : null,
      }));

    return { sessionId, categoryId: claims.categoryId, sentences: orderedSentences };
  }

  async completeSentence(userId: string, sessionId: string, sentenceId: string, selectedOptionKey: string) {
    const claims = this.verifySessionToken(sessionId);
    if (claims.userId !== userId) {
      throw new ForbiddenException('Session does not belong to this user');
    }
    if (!claims.sentenceIds.includes(sentenceId)) {
      throw new BadRequestException('Sentence is not part of this session');
    }

    const quiz = await this.prisma.quiz.findUnique({ where: { sentenceId } });
    const isCorrect = quiz ? quiz.correctOptionKey === selectedOptionKey : false;

    await this.prisma.userSentenceProgress.upsert({
      where: { userId_sentenceId: { userId, sentenceId } },
      create: { userId, sentenceId, status: 'completed' },
      update: { status: 'completed' },
    });

    return { isCorrect, correctOptionKey: quiz?.correctOptionKey ?? null };
  }
}
