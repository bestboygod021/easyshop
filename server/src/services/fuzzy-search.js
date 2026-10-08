/**
 * Fuzzy Search and Persian Spell Fixer using Damerau-Levenshtein distance.
 */

export function levenshteinDistance(a, b) {
  const s1 = String(a || '').trim().toLowerCase();
  const s2 = String(b || '').trim().toLowerCase();

  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,       // deletion
        dp[i][j - 1] + 1,       // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

export function suggestFuzzyCorrection(query, dictionary = []) {
  const clean = String(query || '').trim();
  if (clean.length < 3 || dictionary.length === 0) return null;

  let bestMatch = null;
  let minDistance = Infinity;

  for (const word of dictionary) {
    const dist = levenshteinDistance(clean, word);
    // Allow up to 2 character mistakes for typical typos
    if (dist <= 2 && dist < minDistance && dist > 0) {
      minDistance = dist;
      bestMatch = word;
    }
  }

  return bestMatch;
}
