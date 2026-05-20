type ExpectedExpenseCandidate = {
  id: string;
  vendor: string | null;
};

function normalizeVendor(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(value: string): Set<string> {
  const normalized = normalizeVendor(value);
  if (normalized.length < 2) return new Set([normalized]);
  const output = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    output.add(normalized.slice(index, index + 2));
  }
  return output;
}

function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );

  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

export function vendorSimilarity(a: string, b: string): number {
  const na = normalizeVendor(a);
  const nb = normalizeVendor(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.95;

  const ag = bigrams(na);
  const bg = bigrams(nb);
  let overlap = 0;
  for (const piece of ag) {
    if (bg.has(piece)) overlap += 1;
  }
  const denom = ag.size + bg.size;
  const dice = denom === 0 ? 0 : (2 * overlap) / denom;
  const maxLen = Math.max(na.length, nb.length);
  const levenshtein =
    maxLen === 0 ? 0 : 1 - levenshteinDistance(na, nb) / maxLen;
  return Math.max(dice, levenshtein);
}

export function findBestRecurringExpectedExpense(
  vendor: string | null | undefined,
  candidates: ExpectedExpenseCandidate[],
  threshold = 0.85,
): { expenseId: string; score: number } | null {
  if (!vendor) return null;

  let best: { expenseId: string; score: number } | null = null;
  for (const candidate of candidates) {
    if (!candidate.vendor) continue;
    const score = vendorSimilarity(vendor, candidate.vendor);
    if (score < threshold) continue;
    if (!best || score > best.score) {
      best = { expenseId: candidate.id, score };
    }
  }
  return best;
}
