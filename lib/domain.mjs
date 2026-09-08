export function normalizeCourseName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
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
  return [file.entranceYear, file.roundNumber, file.currentClass, file.targetGrade, file.targetSemester].join(':');
}
