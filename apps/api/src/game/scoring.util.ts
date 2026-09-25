export const ROUND_TIME_LIMIT_SEC = 30;

export function computeRoundScore(isCorrect: boolean, elapsedMs: number): number {
  if (!isCorrect) {
    return 0;
  }
  const elapsedSec = elapsedMs / 1000;
  if (elapsedSec >= ROUND_TIME_LIMIT_SEC) {
    return 0;
  }
  return Math.max(10, Math.round(100 * (1 - elapsedSec / ROUND_TIME_LIMIT_SEC)));
}
