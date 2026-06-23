export interface Scorecard {
  options: string[];
  categories: string[];
  scores: number[][]; // scores[optionIndex][categoryIndex]
}

/**
 * Parse a markdown scorecard table from the verdict text.
 *
 * Detection is LANGUAGE-AGNOSTIC: instead of matching English header words
 * (which fail when the judge writes the table in Turkish, German, etc.), we
 * detect the table structurally — a markdown separator row (| --- | --- |),
 * a header line above it, and ≥2 data rows whose non-label cells are numeric.
 * This is what a scorecard looks like in any language.
 *
 * Expected shape (header words may be localized):
 * | Option | Evidence | Relevance | Practicality | Overall |
 * | --- | --- | --- | --- | --- |
 * | Option A | 8 | 7 | 9 | 8 |
 * | Option B | 6 | 8 | 5 | 6 |
 */
export function parseScorecard(verdictText: string): Scorecard | null {
  const lines = verdictText.split('\n');

  const splitRow = (line: string): string[] =>
    line
      .trim()
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);

  // A markdown separator row: every cell is dashes, optionally with alignment colons.
  const isSeparator = (line: string): boolean => {
    const t = line.trim();
    if (!t.startsWith('|')) return false;
    const cells = splitRow(t);
    return cells.length >= 2 && cells.every((c) => /^:?-{2,}:?$/.test(c));
  };

  // Scan for the first table that looks like a scorecard (header + separator +
  // numeric data rows). The verdict normally contains exactly one such table.
  for (let sep = 1; sep < lines.length; sep++) {
    if (!isSeparator(lines[sep])) continue;

    const headerLine = lines[sep - 1];
    if (!headerLine.trim().startsWith('|')) continue;

    const headerCells = splitRow(headerLine);
    if (headerCells.length < 3) continue;

    // First column labels the option; the rest are score categories.
    const categories = headerCells.slice(1);

    const options: string[] = [];
    const scores: number[][] = [];

    for (let i = sep + 1; i < lines.length; i++) {
      if (!lines[i].trim().startsWith('|')) break;
      if (isSeparator(lines[i])) continue;

      const cells = splitRow(lines[i]);
      if (cells.length < 2) break;

      const rowScores = cells.slice(1).map((c) => {
        const num = parseFloat(c.replace(/[^\d.]/g, ''));
        return isNaN(num) ? NaN : Math.min(10, Math.max(0, num));
      });

      // A genuine score row has at least one numeric cell after the label;
      // this skips prose tables that happen to appear in the verdict.
      if (rowScores.every((n) => isNaN(n))) continue;

      const cleaned = rowScores.map((n) => (isNaN(n) ? 0 : n));
      while (cleaned.length < categories.length) cleaned.push(0);

      options.push(cells[0].replace(/\*\*/g, '').trim());
      scores.push(cleaned);
    }

    if (options.length >= 2 && categories.length >= 2) {
      return { options, categories, scores };
    }
    // Not a scorecard — keep scanning for another table.
  }

  return null;
}
