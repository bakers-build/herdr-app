// core/fuzzy: fuzzy matching for search fields. The query's letters must appear in the text in
// order, ignoring case and spaces; consecutive letters and letters at word starts score higher,
// and an exact prefix beats every other match.

/**
 * @param {string} query @param {string} text
 * @returns {number | null} the score, or null when the text does not match; 0 for an empty query
 */
export function fuzzyScore(query, text) {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 1000 - t.length;
  let score = 0;
  let from = 0;
  let prev = -2;
  for (const ch of q) {
    const i = t.indexOf(ch, from);
    if (i < 0) return null;
    const wordStart = i === 0 || !/[a-z0-9]/.test(t[i - 1]);
    score += 1 + (i === prev + 1 ? 5 : 0) + (wordStart ? 3 : 0);
    prev = i;
    from = i + 1;
  }
  return score;
}
