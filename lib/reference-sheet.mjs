export const normalizeHeader = (value) => String(value ?? '').replace(/[\s\n\r]+/g, '').trim();

export function expandMergedCells(rows, merges = []) {
  const copy = rows.map((row) => [...row]);
  for (const merge of merges) {
    const value = copy[merge.s.r]?.[merge.s.c] ?? '';
    if (value === '') continue;
    for (let r = merge.s.r; r <= merge.e.r; r += 1) for (let c = merge.s.c; c <= merge.e.c; c += 1) {
      if (copy[r] && (copy[r][c] === undefined || copy[r][c] === '')) copy[r][c] = value;
    }
  }
  return copy;
}

export function compositeHeaders(rows, start, end) {
  const width = Math.max(0, ...rows.slice(start, end + 1).map((row) => row.length));
  return Array.from({ length: width }, (_, column) => {
    const parts = rows.slice(start, end + 1).map((row) => String(row[column] ?? '').trim()).filter(Boolean);
    return [...new Set(parts)].join(' / ') || `열 ${column + 1}`;
  });
}

function matches(header, aliases) {
  const value = normalizeHeader(header);
  const parts = String(header).split('/').map(normalizeHeader).filter(Boolean);
  return aliases.some((alias) => {
    const candidate = normalizeHeader(alias);
    return value === candidate || parts.includes(candidate) || value.startsWith(candidate) || value.endsWith(candidate);
  });
}

export function mapHeaderColumns(headers, aliases) {
  return Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, headers.findIndex((header) => matches(header, values))]));
}

export function detectHeaderRange(rows, aliases, maxRows = 25) {
  let best = { start: 0, end: 0, score: -1, headers: [] };
  const limit = Math.min(rows.length, maxRows);
  for (let start = 0; start < limit; start += 1) for (let end = start; end < Math.min(limit, start + 3); end += 1) {
    const headers = compositeHeaders(rows, start, end);
    const mapped = mapHeaderColumns(headers, aliases);
    const score = Object.values(mapped).filter((index) => index >= 0).length;
    if (score > best.score || (score === best.score && end - start < best.end - best.start)) best = { start, end, score, headers };
  }
  return best;
}
