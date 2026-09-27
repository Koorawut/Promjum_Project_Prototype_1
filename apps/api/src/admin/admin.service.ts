import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  OPTION_KEYS,
  optionsAsTexts,
  toKeyedOptionsJson,
} from '../shared/quiz-options.util';

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
      // Old rows may be keyed objects (seed) or plain strings (earlier
      // admin builds); the edit form always wants plain strings.
      options: s.quiz ? optionsAsTexts(s.quiz.options) : null,
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
            // Store in the keyed seed format so the practice flow (which
            // reads o.key / o.text) renders these options correctly.
            options: toKeyedOptionsJson(input.options),
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
        options: input.options ?? optionsAsTexts(sentence.quiz?.options),
        correctIndex:
          input.correctIndex ??
          (sentence.quiz
            ? OPTION_KEYS.indexOf(
                sentence.quiz.correctOptionKey as (typeof OPTION_KEYS)[number],
              )
            : 0),
      });
    }

    // One quiz upsert covers all question/options/correctIndex edits —
    // only built when any quiz field was sent. Options are rewritten in
    // the keyed seed format (plain-string rows get normalized on the way
    // through so re-saving an old broken row also heals it).
    const quizInput =
      input.question !== undefined ||
      input.options !== undefined ||
      input.correctIndex !== undefined
        ? {
            upsert: {
              create: {
                question: input.question ?? '',
                options: toKeyedOptionsJson(input.options ?? []),
                correctOptionKey: OPTION_KEYS[input.correctIndex ?? 0],
              },
              update: {
                ...(input.question !== undefined && {
                  question: input.question,
                }),
                ...(input.options !== undefined && {
                  options: toKeyedOptionsJson(input.options),
                }),
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

  // ---------- Minigame answer sets ----------
  // Reuses the ImageSet/GameImage tables the game already draws from, so
  // seeded sets keep working and new admin-created sets join the same
  // random pool immediately (matches in progress snapshot their rounds'
  // image data at round start — deletes only affect new matches).

  async listMinigameSets() {
    const sets = await this.prisma.imageSet.findMany({
      orderBy: { createdAt: 'asc' },
      include: { images: { orderBy: { position: 'asc' } } },
    });
    return sets.map((set) => {
      const correct = set.images.find((i) => i.isCorrect);
      return {
        id: set.id,
        name: set.name,
        // Always report 4 slots (A–D) for the admin form; sets with a
        // different image count (e.g. seeded 5-image set) keep their real
        // count so the form can show what's actually stored.
        images: set.images.map((i) => i.imageUrl),
        correctIndex: correct ? set.images.indexOf(correct) : 0,
        imageCount: set.images.length,
        createdAt: set.createdAt,
      };
    });
  }

  async createMinigameSet(input: {
    images: string[]; // absolute/stored URLs, ordered A–D
    correctIndex: number;
  }) {
    this.validateMinigameSet(input.images, input.correctIndex);
    return this.prisma.imageSet.create({
      data: {
        name: `set-${Date.now()}`,
        images: {
          create: input.images.map((url, i) => ({
            imageUrl: url,
            label: `Image ${i + 1}`,
            isCorrect: i === input.correctIndex,
            position: i,
          })),
        },
      },
      include: { images: { orderBy: { position: 'asc' } } },
    });
  }

  async updateMinigameSet(
    id: string,
    input: {
      images?: string[]; // full A–D order; slot k unchanged = same URL
      correctIndex?: number;
    },
  ) {
    const set = await this.prisma.imageSet.findUnique({
      where: { id },
      include: { images: { orderBy: { position: 'asc' } } },
    });
    if (!set) {
      throw new NotFoundException('ไม่พบชุดคำตอบนี้');
    }

    const nextImages = input.images ?? set.images.map((i) => i.imageUrl);
    const nextCorrect =
      input.correctIndex ?? set.images.findIndex((i) => i.isCorrect);
    this.validateMinigameSet(nextImages, nextCorrect);

    // Rewrite the set's images in a transaction: delete + recreate keeps
    // the positional mapping simple regardless of which slots changed.
    // GameImage has no other relations, so recreation is safe.
    return this.prisma.$transaction(async (tx) => {
      await tx.gameImage.deleteMany({ where: { imageSetId: id } });
      return tx.imageSet.update({
        where: { id },
        data: {
          images: {
            create: nextImages.map((url, i) => ({
              imageUrl: url,
              label: `Image ${i + 1}`,
              isCorrect: i === nextCorrect,
              position: i,
            })),
          },
        },
        include: { images: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async deleteMinigameSet(id: string) {
    const set = await this.prisma.imageSet.findUnique({ where: { id } });
    if (!set) {
      throw new NotFoundException('ไม่พบชุดคำตอบนี้');
    }
    await this.prisma.imageSet.delete({ where: { id } });
  }

  private validateMinigameSet(images: string[], correctIndex: number) {
    if (images.length !== 4 || images.some((u) => !u.trim())) {
      throw new BadRequestException('ชุดคำตอบต้องมีรูปภาพครบทั้ง 4 รูป (A–D)');
    }
    if (
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex > 3
    ) {
      throw new BadRequestException('ตำแหน่งภาพคำตอบต้องอยู่ระหว่าง A–D');
    }
  }

  private validateQuizFields(input: {
    textEn: string;
    textTh: string;
    question: string;
    options: string[];
    correctIndex: number;
  }) {
    if (
      !input.textEn.trim() ||
      !input.textTh.trim() ||
      !input.question.trim()
    ) {
      throw new BadRequestException(
        'กรอกประโยคอังกฤษ ประโยคไทย และคำถามให้ครบ',
      );
    }
    if (input.options.length < 2 || input.options.some((o) => !o.trim())) {
      throw new BadRequestException(
        'ตัวเลือกต้องมีอย่างน้อย 2 ข้อและไม่มีค่าว่าง',
      );
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
