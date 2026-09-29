export function normalizeCourseName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function isAmbiguousCourseName(value) {
  return /\//.test(normalizeCourseName(value));
}

// 과목 표시명은 보존하고 비교에만 쓰는 키를 별도로 만든다. NFKC는 전각 문자와
// 유니코드 로마 숫자 같은 명확한 표기 차이만 정리하며 괄호 내용은 제거하지 않는다.
export function courseMatchKey(value) {
  const name = normalizeCourseName(value).normalize('NFKC');
  if (!name || isAmbiguousCourseName(name)) return '';
  return name.replace(/[･·]/g, '·').replace(/\s+/g, '').toLocaleLowerCase('ko');
}

export function courseComparisonKey(value) {
  const normalized = normalizeCourseName(value);
  const key = courseMatchKey(normalized);
  return key ? `normalized:${key}` : normalized ? `exact:${normalized}` : '';
}

export function classifyCourseNameMatch(left, right) {
  const leftName = normalizeCourseName(left);
  const rightName = normalizeCourseName(right);
  if (!leftName || !rightName) return 'unmatched';
  if (leftName === rightName) return 'exact';
  if (isAmbiguousCourseName(leftName) || isAmbiguousCourseName(rightName)) return 'needs_confirmation';
  return courseMatchKey(leftName) === courseMatchKey(rightName) ? 'normalized' : 'unmatched';
}

export function isSelectedMark(value) {
  const mark = String(value ?? '').trim();
  return mark === '○' || mark === '◯' || mark.toLowerCase() === 'o';
}

export function compareCourseSets(before = [], after = []) {
  const left = new Set(before.map(normalizeCourseName).filter(Boolean));
  const right = new Set(after.map(normalizeCourseName).filter(Boolean));
  const added = [...right].filter((name) => !left.has(name)).sort((a, b) => a.localeCompare(b, 'ko'));
  const removed = [...left].filter((name) => !right.has(name)).sort((a, b) => a.localeCompare(b, 'ko'));
  let status = '변경 없음';
  if (added.length && removed.length) status = '과목 변경';
  else if (added.length) status = '과목 추가';
  else if (removed.length) status = '과목 삭제';
  return { added, removed, unchanged: [...left].filter((name) => right.has(name)), status, changed: added.length + removed.length > 0 };
}

export function makeStudentMatchKey(student, entranceYear) {
  const externalId = String(student.externalId ?? '').trim();
  if (externalId) return `external:${entranceYear}:${externalId}`;
  return `fallback:${entranceYear}:${Number(student.currentClass)}:${Number(student.currentNumber)}:${String(student.name ?? '').trim()}`;
}

export function makeScopeKey(file) {
  return [file.entranceYear, file.currentClass, file.targetGrade, file.targetSemester].join(':');
}
