import { isSelectedMark, normalizeCourseName } from './domain.mjs';

const text = (value) => String(value ?? '').trim();
const headerKind = (value) => text(value).replace(/\s/g, '').toLowerCase();

export function inferTarget(fileName, sheetName = '') {
  const source = `${fileName} ${sheetName}`;
  const grade = source.match(/([23])\s*학년/)?.[1];
  const semester = source.match(/([12])\s*학기/)?.[1];
  return { targetGrade: grade ? Number(grade) : 0, targetSemester: semester ? Number(semester) : 0 };
}

export function parseOfficialRows(rows, fileName, sheetName = '') {
  const warnings = [];
  const target = inferTarget(fileName, sheetName);
  const headerIndex = rows.findIndex((row) => {
    const values = row.map(headerKind);
    return values.includes('반') && values.includes('번호') && values.includes('이름');
  });
  if (headerIndex < 0) return { fileName, currentClass: 0, ...target, students: [], courseCount: 0, warnings, error: '반·번호·이름 열을 찾지 못했습니다.' };
  const header = rows[headerIndex].map(text);
  const classIndex = header.findIndex((v) => headerKind(v) === '반');
  const numberIndex = header.findIndex((v) => headerKind(v) === '번호');
  const nameIndex = header.findIndex((v) => headerKind(v) === '이름');
  const externalIdIndex = header.findIndex((v) => ['학번', '학생고유번호', '고유번호', '학생id'].includes(headerKind(v)));
  const metadataIndexes = new Set([classIndex, numberIndex, nameIndex, externalIdIndex, header.findIndex((v) => headerKind(v) === '순번')]);
  const subjectColumns = header.map((name, index) => ({ name: normalizeCourseName(name), index })).filter(({ name, index }) => index > nameIndex && name && !metadataIndexes.has(index));
  const students = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const currentClass = Number(text(row[classIndex]));
    const currentNumber = Number(text(row[numberIndex]));
    const name = text(row[nameIndex]);
    if (!Number.isInteger(currentClass) || currentClass < 1 || !Number.isInteger(currentNumber) || currentNumber < 1 || !name) continue;
    students.push({ currentClass, currentNumber, name, externalId: externalIdIndex >= 0 ? text(row[externalIdIndex]) || undefined : undefined, courses: subjectColumns.filter(({ index }) => isSelectedMark(row[index])).map(({ name }) => name) });
  }
  const classes = [...new Set(students.map((student) => student.currentClass))];
  if (classes.length > 1) warnings.push(`한 파일에서 여러 반(${classes.join(', ')}반)이 발견되었습니다.`);
  if (!target.targetGrade || !target.targetSemester) warnings.push('파일명이나 시트명에서 대상 학년·학기를 확인하지 못했습니다. 미리보기에서 직접 지정해주세요.');
  if (!students.length) warnings.push('학생 행을 찾지 못했습니다.');
  return { fileName, currentClass: classes.length === 1 ? classes[0] : 0, ...target, students, courseCount: subjectColumns.length, warnings };
}
