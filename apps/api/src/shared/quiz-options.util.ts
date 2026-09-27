// Quiz options live in a Json column and have been written in two shapes:
// the seed's keyed format [{key:'a', text:'7:00'}] and the plain string
// arrays ["7:00","8:00"] that earlier admin panel builds stored. Everything
// downstream (practice flow, admin form) goes through these normalizers so
// both shapes read the same and new writes are always keyed.
export interface KeyedQuizOption {
  key: string;
  text: string;
}

export const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/** Plain strings (admin form) -> keyed options that match the seed format. */
export function toKeyedOptions(options: string[]): KeyedQuizOption[] {
  return options.map((text, i) => ({ key: OPTION_KEYS[i] ?? String(i), text }));
}

/**
 * JSON value for Prisma's Json column: Prisma's InputJsonValue wants an
 * index signature that our interface type doesn't carry, so go through
 * JSON.stringify/parse to land on a plain, assignable object shape.
 */
export function toKeyedOptionsJson(options: string[]): {
  key: string;
  text: string;
}[] {
  return JSON.parse(JSON.stringify(toKeyedOptions(options))) as {
    key: string;
    text: string;
  }[];
}

/** Whatever is stored -> keyed options for the practice flow. */
export function normalizeQuizOptions(raw: unknown): KeyedQuizOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o, i) => {
      if (typeof o === 'string')
        return { key: OPTION_KEYS[i] ?? String(i), text: o };
      const obj = o as { key?: unknown; text?: unknown };
      return {
        key:
          typeof obj.key === 'string' ? obj.key : (OPTION_KEYS[i] ?? String(i)),
        text: typeof obj.text === 'string' ? obj.text : '',
      };
    })
    .filter((o) => o.text.trim().length > 0);
}

/** Whatever is stored -> plain strings for the admin edit form. */
export function optionsAsTexts(raw: unknown): string[] {
  return normalizeQuizOptions(raw).map((o) => o.text);
}
