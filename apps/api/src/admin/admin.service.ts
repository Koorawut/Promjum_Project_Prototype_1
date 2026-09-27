import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Quiz option keys follow the existing seed convention ('a' | 'b' | ...).
// The admin form sends options as a JSON array + correctIndex; the service
// converts to the keys the practice flow already consumes.
const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export interface AdminQuizRow {
  id: string;
  categoryId: string;
  textEn: string;
  textTh: string | null;
  question: string | null;
  options: string[] | null;
  correctIndex: number | null;
  imageUrl: string | null;
  audioUrl: string | null;
  isEnabled: boolean;
}

export interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  role: 'user' | 'admin';
  createdAt: Date;
}

function parseOptions(raw: unknown): string[] {
  // Accept a JSON-encoded array ("["A","B"]") or a comma-separated fallback.
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new BadRequestException('ตัวเลือกคำตอบไม่ถูกต้อง');
  }
  let options: unknown;
  try {
    options = JSON.parse(raw);
  } catch {
    options = raw.split('|');
  }
  if (!Array.isArray(options) || options.some((o) => typeof o !== 'string')) {
    throw new BadRequestException('ตัวเลือกคำตอบไม่ถูกต้อง');
  }
  return options as string[];
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Dashboard ----------

  async getStats() {
    const [quizTotal, usersTotal, usersVerified] = await Promise.all([
      this.prisma.quiz.count(),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { emailVerified: true } }),
    ]);
    return {
      quizzes: { total: quizTotal },
      users: {
        total: usersTotal,
        verified: usersVerified,
        unverified: usersTotal - usersVerified,
      },
    };
  }

  // ---------- Quiz management ----------

  async listQuizzes(categorySlug: string): Promise<AdminQuizRow[]> {
    const category = await this.prisma.category.findUnique({
      where: { slug: categorySlug },
    });
    if (!category) {
      throw new NotFoundException('ไม่พบหมวดนี้');
    }
    const sentences = await this.prisma.sentence.findMany({
      where: { categoryId: category.id },
      orderBy: { createdAt: 'asc' },
      include: { quiz: true },
    });
    return sentences.map((s) => ({
      id: s.id,
      categoryId: s.categoryId,
      textEn: s.text,
      textTh: s.textTh,
      question: s.quiz?.question ?? null,
      options: s.quiz ? (s.quiz.options as unknown as string[]) : null,
      correctIndex: s.quiz
        ? OPTION_KEYS.indexOf(
            s.quiz.correctOptionKey as (typeof OPTION_KEYS)[number],
          )
        : null,
      imageUrl: s.imageUrl,
      audioUrl: s.audioUrl,
      isEnabled: s.isEnabled,
    }));
  }

  async createQuiz(input: {
    categorySlug: string;
    textEn: string;
    textTh: string;
    question: string;
    options: string[];
    correctIndex: number;
    imageUrl?: string | null;
    audioUrl?: string | null;
  }) {
    const category = await this.prisma.category.findUnique({
      where: { slug: input.categorySlug },
    });
    if (!category) {
      throw new NotFoundException('ไม่พบหมวดนี้');
    }
    this.validateQuizFields(input);

    return this.prisma.sentence.create({
      data: {
        categoryId: category.id,
        text: input.textEn,
        textTh: input.textTh,
        imageUrl: input.imageUrl ?? null,
        audioUrl: input.audioUrl ?? null,
        isEnabled: true,
        quiz: {
          create: {
            question: input.question,
            options: input.options,
            correctOptionKey: OPTION_KEYS[input.correctIndex],
          },
        },
      },
    });
  }

  async updateQuiz(
    id: string,
    input: Partial<{
      textEn: string;
      textTh: string;
      question: string;
      options: string[];
      correctIndex: number;
      imageUrl: string | null;
      audioUrl: string | null;
      isEnabled: boolean;
    }>,
  ) {
    const sentence = await this.prisma.sentence.findUnique({
      where: { id },
      include: { quiz: true },
    });
    if (!sentence) {
      throw new NotFoundException('ไม่พบ Quiz นี้');
    }

    // Enable/Disable switch sends only { enabled } — everything else is
    // optional so a toggle never requires re-sending the whole form.
    if (
      input.isEnabled === undefined &&
      input.textEn === undefined &&
      input.textTh === undefined &&
      input.question === undefined &&
      input.options === undefined &&
      input.correctIndex === undefined &&
      input.imageUrl === undefined &&
      input.audioUrl === undefined
    ) {
      throw new BadRequestException('ไม่มีข้อมูลที่จะอัปเดต');
    }

    if (input.options !== undefined || input.correctIndex !== undefined) {
      this.validateQuizFields({
        textEn: input.textEn ?? sentence.text,
        textTh: input.textTh ?? sentence.textTh ?? '',
        question: input.question ?? sentence.quiz?.question ?? '',
        options: input.options ?? (sentence.quiz?.options as string[]) ?? [],
        correctIndex: input.correctIndex ??
          (sentence.quiz
            ? OPTION_KEYS.indexOf(
                sentence.quiz.correctOptionKey as (typeof OPTION_KEYS)[number],
              )
            : 0),
      });
    }

    // One quiz upsert covers all question/options/correctIndex edits —
    // only built when any quiz field was sent.
    const quizInput =
      input.question !== undefined ||
      input.options !== undefined ||
      input.correctIndex !== undefined
        ? {
            upsert: {
              create: {
                question: input.question ?? '',
                options: input.options ?? [],
                correctOptionKey: OPTION_KEYS[input.correctIndex ?? 0],
              },
              update: {
                ...(input.question !== undefined && {
                  question: input.question,
                }),
                ...(input.options !== undefined && { options: input.options }),
                ...(input.correctIndex !== undefined && {
                  correctOptionKey: OPTION_KEYS[input.correctIndex],
                }),
              },
            },
          }
        : undefined;

    return this.prisma.sentence.update({
      where: { id },
      data: {
        ...(input.textEn !== undefined && { text: input.textEn }),
        ...(input.textTh !== undefined && { textTh: input.textTh }),
        ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
        ...(input.audioUrl !== undefined && { audioUrl: input.audioUrl }),
        ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled }),
        ...(quizInput && { quiz: quizInput }),
      },
    });
  }

  async deleteQuiz(id: string) {
    const sentence = await this.prisma.sentence.findUnique({ where: { id } });
    if (!sentence) {
      throw new NotFoundException('ไม่พบ Quiz นี้');
    }
    // Quiz + UserSentenceProgress cascade via their FK onDelete rules.
    await this.prisma.sentence.delete({ where: { id } });
  }

  private validateQuizFields(input: {
    textEn: string;
    textTh: string;
    question: string;
    options: string[];
    correctIndex: number;
  }) {
    if (!input.textEn.trim() || !input.textTh.trim() || !input.question.trim()) {
      throw new BadRequestException(
        'กรอกประโยคอังกฤษ ประโยคไทย และคำถามให้ครบ',
      );
    }
    if (
      input.options.length < 2 ||
      input.options.some((o) => !o.trim())
    ) {
      throw new BadRequestException('ตัวเลือกต้องมีอย่างน้อย 2 ข้อและไม่มีค่าว่าง');
    }
    if (
      !Number.isInteger(input.correctIndex) ||
      input.correctIndex < 0 ||
      input.correctIndex >= input.options.length
    ) {
      throw new BadRequestException('เลือกข้อที่ถูกต้องของ Quiz');
    }
  }

  // ---------- User management ----------

  async listUsers(search?: string): Promise<AdminUserRow[]> {
    const users = await this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { username: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerified: true,
        role: true,
        createdAt: true,
      },
    });
    return users;
  }

  async verifyUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('ไม่พบบัญชีนี้');
    }
    await this.prisma.user.update({
      where: { id },
      data: { emailVerified: true },
    });
  }

  async deleteUser(id: string, actingAdminId: string) {
    if (id === actingAdminId) {
      throw new ForbiddenException('ไม่สามารถลบบัญชีของตัวเองได้');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('ไม่พบบัญชีนี้');
    }
    if (user.role === 'admin') {
      throw new ConflictException('ไม่สามารถลบบัญชีผู้ดูแลระบบได้');
    }
    // Sessions / progress / match participants cascade via FK rules.
    await this.prisma.user.delete({ where: { id } });
  }
}
