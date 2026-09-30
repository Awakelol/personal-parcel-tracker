import { PH_PLACES } from './phPlaces';

interface Entry {
  label: string;
  words: string[];
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // ñ -> n, etc.
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ENTRIES: Entry[] = PH_PLACES.map((label) => ({ label, words: normalize(label).split(' ') }));
const KNOWN = new Set(PH_PLACES.map((label) => label.toLowerCase()));

export function isKnownPlace(value: string): boolean {
  return KNOWN.has(value.trim().toLowerCase());
}

// Optimal string alignment distance (Levenshtein plus swapped letters).
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}

/** 0 = a word starts with the token, 1 = close misspelling, null = no match. */
function matchToken(token: string, words: string[]): number | null {
  if (words.some((w) => w.startsWith(token))) return 0;
  if (token.length < 3) return null;
  const allowed = token.length <= 5 ? 1 : 2;
  const close = words.some(
    (w) =>
      editDistance(token, w.slice(0, token.length)) <= allowed ||
      editDistance(token, w.slice(0, token.length + 1)) <= allowed ||
      editDistance(token, w) <= allowed,
  );
  return close ? 1 : null;
}

/** Best-matching places for what the user typed, spelling mistakes included. */
export function searchPlaces(query: string, limit = 8): string[] {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  const scored: { label: string; score: number }[] = [];
  for (const entry of ENTRIES) {
    let score = 0;
    let matched = true;
    for (const token of tokens) {
      const result = matchToken(token, entry.words);
      if (result === null) {
        matched = false;
        break;
      }
      score += result * 10;
    }
    if (!matched) continue;
    // Prefer places whose own name (not province) starts with the first word,
    // and cities, which are where most parcels are headed.
    if (!entry.words[0]!.startsWith(tokens[0]!)) score += 3;
    if (entry.label.includes(' City')) score -= 1;
    scored.push({ label: entry.label, score: score + entry.label.length / 100 });
  }

  // Only fall back to misspelling matches when nothing matches as typed.
  const exact = scored.filter((s) => s.score < 10);
  return (exact.length > 0 ? exact : scored)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.label);
}
