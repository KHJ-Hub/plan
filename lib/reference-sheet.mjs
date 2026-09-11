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

function matchScore(header, aliases) {
  const value = normalizeHeader(header);
  const parts = String(header).split('/').map(normalizeHeader).filter(Boolean);
  return aliases.reduce((best, alias) => {
    const candidate = normalizeHeader(alias);
    if (!candidate) return best;
    if (value === candidate) return Math.max(best, 100);
    if (parts.at(-1) === candidate) return Math.max(best, 90);
    if (parts.includes(candidate)) return Math.max(best, 70);
    // 긴 실제 제목만 앞부분 일치를 허용한다. '교과목'을 단순히 '과목'으로
    // 오인하는 것처럼 짧은 별칭의 느슨한 일치는 막는다.
    if (candidate.length >= 3 && value.startsWith(candidate)) return Math.max(best, 40);
    return best;
  }, -1);
}

export function mapHeaderColumns(headers, aliases) {
  return Object.fromEntries(Object.entries(aliases).map(([key, values]) => {
    let bestIndex = -1; let bestScore = -1;
    headers.forEach((header, index) => {
      const score = matchScore(header, values);
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    return [key, bestIndex];
  }));
}

export function detectHeaderRange(rows, aliases, maxRows = 25, preferMultiRow = false) {
  let best = { start: 0, end: 0, score: -1, headers: [] };
  const limit = Math.min(rows.length, maxRows);
  for (let start = 0; start < limit; start += 1) for (let end = start; end < Math.min(limit, start + 3); end += 1) {
    const headers = compositeHeaders(rows, start, end);
    const mapped = mapHeaderColumns(headers, aliases);
    const score = Object.values(mapped).filter((index) => index >= 0).length;
    const span = end - start;
    const bestSpan = best.end - best.start;
    const betterTie = preferMultiRow
      ? (bestSpan === 0 ? span > 0 : span > 0 && span < bestSpan)
      : span < bestSpan;
    if (score > best.score || (score === best.score && betterTie)) best = { start, end, score, headers };
  }
  return best;
}

export function matrixCourseColumns(headers, mapping) {
  const mappedColumns = new Set(Object.values(mapping).filter((index) => Number.isInteger(index) && index >= 0));
  return headers.map((header, index) => ({ header, index })).filter(({ header, index }) => {
    const normalized = String(header || '').trim();
    return normalized && !normalized.startsWith('열 ') && !mappedColumns.has(index) && !/^(비고|참고|메모)$/u.test(normalized);
  });
}

export function matrixCoursesFromRow(headers, mapping, row, fallbackArea = '') {
  return matrixCourseColumns(headers, mapping).filter(({ index }) => {
    const value = String(row[index] ?? '').trim();
    return value && !/^[-–—]+$/.test(value);
  }).map(({ header, index }) => {
    const parts = header.split('/').map((part) => part.trim()).filter(Boolean);
    const areaParts = parts.slice(0, -1).filter((part) => !/^(교과목|과목)$/u.test(part));
    return { courseName: parts.at(-1) || header, subjectArea: areaParts.join(' > ') || fallbackArea, universities: String(row[index] ?? '').trim(), recommendationType: 'recommended' };
  });
}
