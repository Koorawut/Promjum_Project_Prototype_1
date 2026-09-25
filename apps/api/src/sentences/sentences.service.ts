import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SentencesService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(userId: string | undefined) {
    const categories = await this.prisma.category.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { sentences: true } } },
    });

    if (!userId) {
      return categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        sentenceCount: c._count.sentences,
        hasHistory: false,
      }));
    }

    const completedByCategory = await this.prisma.userSentenceProgress.findMany({
      where: { userId, status: 'completed' },
      select: { sentence: { select: { categoryId: true } } },
    });
    const categoriesWithHistory = new Set(completedByCategory.map((p) => p.sentence.categoryId));

    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      sentenceCount: c._count.sentences,
      hasHistory: categoriesWithHistory.has(c.id),
    }));
  }
}
