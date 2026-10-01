// Flash appends the location to its messages as ",【Province】,【City】".
const BRACKETED_LOCATION = /,?\s*【([^】]+)】/g;

/** Splits "…arrived X,【Leyte】,【Tacloban City】" into the text and "Tacloban City, Leyte". */
export function splitBracketedLocation(text: string): { description: string; location: string | null } {
  const parts = [...text.matchAll(BRACKETED_LOCATION)].map((m) => m[1]!.trim());
  if (parts.length === 0) return { description: text, location: null };
  return { description: text.replace(BRACKETED_LOCATION, '').trim(), location: parts.reverse().join(', ') };
}
