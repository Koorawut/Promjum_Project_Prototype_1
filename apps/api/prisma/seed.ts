import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// TEMP PLACEHOLDER — replace with real narrated audio + real illustration images before production.
const AUDIO_URLS = [
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
];

function imageUrl(seed: string, w = 600, h = 400): string {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

type QuizOption = { key: string; text: string };

interface SentenceSeed {
  text: string;
  quiz?: {
    question: string;
    options: QuizOption[];
    correctOptionKey: string;
  };
}

interface CategorySeed {
  name: string;
  slug: string;
  sentences: SentenceSeed[];
}

const CATEGORIES: CategorySeed[] = [
  {
    name: 'Daily Life',
    slug: 'daily-life',
    sentences: [
      {
        text: 'I wake up at seven o\'clock every morning.',
        quiz: {
          question: 'What time does the speaker wake up?',
          options: [
            { key: 'a', text: '6:00' },
            { key: 'b', text: '7:00' },
            { key: 'c', text: '8:00' },
          ],
          correctOptionKey: 'b',
        },
      },
      {
        text: 'Could you please pass me the salt?',
        quiz: {
          question: 'What is the speaker asking for?',
          options: [
            { key: 'a', text: 'Salt' },
            { key: 'b', text: 'Sugar' },
            { key: 'c', text: 'Pepper' },
          ],
          correctOptionKey: 'a',
        },
      },
      {
        text: 'I usually clean my room on the weekend.',
      },
      {
        text: 'My favorite hobby is reading books before bed.',
        quiz: {
          question: 'When does the speaker read?',
          options: [
            { key: 'a', text: 'Before bed' },
            { key: 'b', text: 'After lunch' },
            { key: 'c', text: 'In the morning' },
          ],
          correctOptionKey: 'a',
        },
      },
      {
        text: 'Let\'s go for a walk after dinner.',
      },
    ],
  },
  {
    name: 'Travel',
    slug: 'travel',
    sentences: [
      {
        text: 'Excuse me, where is the nearest train station?',
        quiz: {
          question: 'What is the speaker looking for?',
          options: [
            { key: 'a', text: 'A train station' },
            { key: 'b', text: 'A bus stop' },
            { key: 'c', text: 'An airport' },
          ],
          correctOptionKey: 'a',
        },
      },
      {
        text: 'I would like to book a room for two nights.',
        quiz: {
          question: 'How many nights does the speaker want to stay?',
          options: [
            { key: 'a', text: 'One night' },
            { key: 'b', text: 'Two nights' },
            { key: 'c', text: 'Three nights' },
          ],
          correctOptionKey: 'b',
        },
      },
      {
        text: 'Our flight leaves at nine in the evening.',
      },
      {
        text: 'Can you recommend a good restaurant nearby?',
      },
    ],
  },
  {
    name: 'Food & Dining',
    slug: 'food-dining',
    sentences: [
      {
        text: 'I would like to order a bowl of noodle soup.',
        quiz: {
          question: 'What does the speaker want to order?',
          options: [
            { key: 'a', text: 'Fried rice' },
            { key: 'b', text: 'Noodle soup' },
            { key: 'c', text: 'Grilled chicken' },
          ],
          correctOptionKey: 'b',
        },
      },
      {
        text: 'Could we have the menu, please?',
      },
      {
        text: 'This dish is a little too spicy for me.',
        quiz: {
          question: 'How does the speaker feel about the dish?',
          options: [
            { key: 'a', text: 'Too sweet' },
            { key: 'b', text: 'Too spicy' },
            { key: 'c', text: 'Too salty' },
          ],
          correctOptionKey: 'b',
        },
      },
      {
        text: 'Can I get the bill, please?',
      },
      {
        text: 'This restaurant serves the best mango sticky rice in town.',
        quiz: {
          question: 'What dessert is mentioned?',
          options: [
            { key: 'a', text: 'Mango sticky rice' },
            { key: 'b', text: 'Ice cream' },
            { key: 'c', text: 'Coconut pudding' },
          ],
          correctOptionKey: 'a',
        },
      },
    ],
  },
];

interface ImageSetSeed {
  name: string;
  images: { label: string; isCorrect: boolean }[];
}

const IMAGE_SETS: ImageSetSeed[] = [
  {
    name: 'animals-1',
    images: [
      { label: 'A dog running in a park', isCorrect: true },
      { label: 'A cat sleeping on a sofa', isCorrect: false },
      { label: 'A bird flying over the sea', isCorrect: false },
      { label: 'A horse standing in a field', isCorrect: false },
    ],
  },
  {
    name: 'places-1',
    images: [
      { label: 'A busy city street at night', isCorrect: false },
      { label: 'A quiet beach at sunset', isCorrect: true },
      { label: 'A tall mountain covered in snow', isCorrect: false },
      { label: 'A small village with old houses', isCorrect: false },
      { label: 'A crowded market in the morning', isCorrect: false },
    ],
  },
  {
    name: 'food-1',
    images: [
      { label: 'A plate of spaghetti', isCorrect: false },
      { label: 'A bowl of fried rice', isCorrect: false },
      { label: 'A slice of chocolate cake', isCorrect: true },
      { label: 'A cup of hot coffee', isCorrect: false },
    ],
  },
];

async function main() {
  // Validate the critical invariant before touching the DB: the realtime
  // gateway non-null-asserts finding exactly one correct image per set.
  for (const set of IMAGE_SETS) {
    const correctCount = set.images.filter((i) => i.isCorrect).length;
    if (correctCount !== 1) {
      throw new Error(
        `ImageSet "${set.name}" has ${correctCount} correct images (must be exactly 1)`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    // Clear in dependency order (dev-only seed, safe to wipe & recreate).
    await tx.matchRound.deleteMany();
    await tx.matchParticipant.deleteMany();
    await tx.matchSession.deleteMany();
    await tx.gameImage.deleteMany();
    await tx.imageSet.deleteMany();
    await tx.userSentenceProgress.deleteMany();
    await tx.quiz.deleteMany();
    await tx.sentence.deleteMany();
    await tx.category.deleteMany();

    let audioIndex = 0;
    for (const cat of CATEGORIES) {
      const category = await tx.category.create({
        data: { name: cat.name, slug: cat.slug },
      });

      for (let i = 0; i < cat.sentences.length; i++) {
        const s = cat.sentences[i];
        const audioUrl = AUDIO_URLS[audioIndex % AUDIO_URLS.length];
        audioIndex++;

        const sentence = await tx.sentence.create({
          data: {
            categoryId: category.id,
            text: s.text,
            audioUrl,
            imageUrl: imageUrl(`${cat.slug}-${i}`),
          },
        });

        if (s.quiz) {
          await tx.quiz.create({
            data: {
              sentenceId: sentence.id,
              question: s.quiz.question,
              options: s.quiz.options,
              correctOptionKey: s.quiz.correctOptionKey,
            },
          });
        }
      }
    }

    for (const set of IMAGE_SETS) {
      const imageSet = await tx.imageSet.create({ data: { name: set.name } });
      for (let i = 0; i < set.images.length; i++) {
        const img = set.images[i];
        await tx.gameImage.create({
          data: {
            imageSetId: imageSet.id,
            imageUrl: imageUrl(`${set.name}-${i}`),
            label: img.label,
            isCorrect: img.isCorrect,
          },
        });
      }
    }
  });

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
