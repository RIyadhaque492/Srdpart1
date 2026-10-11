/**
 * Search helpers shared by the member and loan pickers.
 * Works on the whole list in the browser, so results appear as you type and the
 * match is not limited to the first few rows the server happens to return.
 */
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Bangla digits (১২৩) to 123, so an ID typed on a Bangla keyboard still matches. */
export function asciiDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

const clean = (s: unknown) => asciiDigits(String(s ?? '')).toLowerCase().trim();
const squash = (s: string) => s.replace(/[\s\-+().,/]/g, '');

/** True when every word of the query appears in at least one of the fields. */
export function matches(fields: unknown[], query: string): boolean {
  const q = clean(query);
  if (!q) return true;
  const hay = fields.map(clean).filter(Boolean);
  const squashed = hay.map(squash);
  return q.split(/\s+/).every((tok) => {
    const t = squash(tok);
    return hay.some((h) => h.includes(tok)) || (t !== '' && squashed.some((h) => h.includes(t)));
  });
}
