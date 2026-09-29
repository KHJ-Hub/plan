import { isSelectedMark, normalizeCourseName } from './domain.mjs';

const text = (value) => String(value ?? '').trim();
const headerKind = (value) => text(value).replace(/\s/g, '').toLowerCase();

// 학교 시스템의 열 이름이 조금 바뀌어도 이 한곳에서 대응한다. 자동 판별 결과는
// 미리보기에 함께 반환하므로 향후 관리자 수동 매핑 UI에서도 같은 구조를 재사용할 수 있다.
export const officialColumnMappings = Object.freeze({
  sequence: ['순번', '연번', '번호순서'],
  currentClass: ['반', '학급', '현재반'],
  currentNumber: ['번호', '번', '출석번호'],
  name: ['이름', '성명', '학생명'],
  externalId: ['학번', '학생고유번호', '고유번호', '학생id'],
  ignored: ['합계', '총계', '비고', '메모', '선택수', '신청수'],
});

function mappedIndex(header, role) {
  const aliases = officialColumnMappings[role].map(headerKind);
  return header.findIndex((value) => aliases.includes(headerKind(value)));
}

function findHeaderIndex(rows) {
  return rows.findIndex((row) => {
    const header = row.map(text);
    return mappedIndex(header, 'currentClass') >= 0 && mappedIndex(header, 'currentNumber') >= 0 && mappedIndex(header, 'name') >= 0;
  });
}

export function inferTarget(fileName, sheetName = '') {
  const source = `${fileName} ${sheetName}`;
  const grade = source.match(/([23])\s*학년/)?.[1];
  const semester = source.match(/([12])\s*학기/)?.[1];
  return { targetGrade: grade ? Number(grade) : 0, targetSemester: semester ? Number(semester) : 0 };
}

export function parseOfficialRows(rows, fileName, sheetName = '') {
  const warnings = [];
  const errors = [];
  const excludedRows = [];
  const target = inferTarget(fileName, sheetName);
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) {
    return {
      fileName, currentClass: 0, ...target, students: [], courseCount: 0, courseNames: [], warnings,
      errors: ['반·번호·이름 열을 찾지 못했습니다.'], excludedRows, ambiguousCourseNames: [], headerRow: 0,
      columnMapping: {}, error: '반·번호·이름 열을 찾지 못했습니다.',
    };
  }

  const header = rows[headerIndex].map(text);
  const classIndex = mappedIndex(header, 'currentClass');
  const numberIndex = mappedIndex(header, 'currentNumber');
  const nameIndex = mappedIndex(header, 'name');
  const externalIdIndex = mappedIndex(header, 'externalId');
  const sequenceIndex = mappedIndex(header, 'sequence');
  const metadataIndexes = new Set([classIndex, numberIndex, nameIndex, externalIdIndex, sequenceIndex].filter((index) => index >= 0));
  const ignoredHeaders = new Set(officialColumnMappings.ignored.map(headerKind));
  const subjectColumns = header
    .map((name, index) => ({ name: normalizeCourseName(name), index }))
    .filter(({ name, index }) => index > nameIndex && name && !metadataIndexes.has(index) && !ignoredHeaders.has(headerKind(name)));
  const duplicateCourses = [...new Set(subjectColumns.map(({ name }) => name).filter((name, index, names) => names.indexOf(name) !== index))];
  if (duplicateCourses.length) errors.push(`같은 과목 열이 중복되어 있습니다: ${duplicateCourses.join(', ')}`);
  if (!subjectColumns.length) errors.push('이름 열 뒤에서 과목 열을 찾지 못했습니다.');

  const students = [];
  const identityRows = new Map();
  const unsupportedMarks = new Set();
  for (let offset = headerIndex + 1; offset < rows.length; offset += 1) {
    const row = rows[offset] || [];
    const rowNumber = offset + 1;
    const currentClassText = text(row[classIndex]);
    const currentNumberText = text(row[numberIndex]);
    const name = text(row[nameIndex]);
    const hasAnyValue = row.some((value) => text(value));
    if (!hasAnyValue) {
      excludedRows.push({ rowNumber, reason: '빈 행' });
      continue;
    }
    if (!currentClassText && !currentNumberText && !name) {
      excludedRows.push({ rowNumber, reason: '학생 식별값이 없는 집계·안내 행' });
      continue;
    }
    const currentClass = Number(currentClassText);
    const currentNumber = Number(currentNumberText);
    if (!Number.isInteger(currentClass) || currentClass < 1 || !Number.isInteger(currentNumber) || currentNumber < 1 || !name) {
      errors.push(`${rowNumber}번째 행의 반·번호·이름을 확인해주세요.`);
      continue;
    }
    const identity = `${currentClass}:${currentNumber}:${name}`;
    if (identityRows.has(identity)) {
      errors.push(`${rowNumber}번째 행의 학생이 ${identityRows.get(identity)}번째 행과 중복되어 있습니다.`);
      continue;
    }
    identityRows.set(identity, rowNumber);
    const courses = subjectColumns.filter(({ index }) => isSelectedMark(row[index])).map(({ name: courseName }) => courseName);
    for (const { index } of subjectColumns) {
      const mark = text(row[index]);
      if (mark && !isSelectedMark(mark)) unsupportedMarks.add(mark);
    }
    if (!courses.length) warnings.push(`${rowNumber}번째 행에서 신청 표시된 과목을 찾지 못했습니다.`);
    students.push({
      currentClass,
      currentNumber,
      name,
      externalId: externalIdIndex >= 0 ? text(row[externalIdIndex]) || undefined : undefined,
      courses,
    });
  }

  const classes = [...new Set(students.map((student) => student.currentClass))];
  if (classes.length > 1) warnings.push(`한 파일에서 여러 반(${classes.join(', ')}반)이 발견되어 반별로 안전하게 분리합니다.`);
  if (!target.targetGrade || !target.targetSemester) warnings.push('파일명이나 시트명에서 대상 학년·학기를 확인하지 못했습니다. 관리자가 직접 지정해주세요.');
  if (!students.length) errors.push('유효한 학생 행을 찾지 못했습니다.');
  if (unsupportedMarks.size) warnings.push(`신청 표시(O/○/◯)가 아닌 값이 있습니다: ${[...unsupportedMarks].slice(0, 8).join(', ')}`);
  const ambiguousCourseNames = subjectColumns.map(({ name }) => name).filter((name) => /\s[/·]\s|\//.test(name));
  if (ambiguousCourseNames.length) warnings.push(`개별 과목을 확정할 수 없는 선택군 ${ambiguousCourseNames.length}개는 원문 그대로 저장하고 확인 필요로 표시합니다.`);

  return {
    fileName,
    currentClass: classes.length === 1 ? classes[0] : 0,
    ...target,
    students,
    courseCount: subjectColumns.length,
    courseNames: subjectColumns.map(({ name }) => name),
    warnings,
    errors,
    excludedRows,
    ambiguousCourseNames,
    headerRow: headerIndex + 1,
    columnMapping: {
      currentClass: { index: classIndex, header: header[classIndex] },
      currentNumber: { index: numberIndex, header: header[numberIndex] },
      name: { index: nameIndex, header: header[nameIndex] },
      externalId: externalIdIndex >= 0 ? { index: externalIdIndex, header: header[externalIdIndex] } : null,
    },
    error: errors[0],
  };
}
