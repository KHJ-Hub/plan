import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCourseNameMatch, compareCourseSets, courseComparisonKey, courseMatchKey, isSelectedMark, makeScopeKey, makeStudentMatchKey, normalizeCourseName } from '../lib/domain.mjs';
import { parseOfficialRows } from '../lib/excel-logic.mjs';
import { compositeHeaders, detectHeaderRange, expandMergedCells, mapHeaderColumns, matrixCourseColumns, matrixCoursesFromRow } from '../lib/reference-sheet.mjs';

test('과목명은 앞뒤와 연속 공백만 정리한다', () => {
  assert.equal(normalizeCourseName('  생명과학   I '), '생명과학 I');
  assert.notEqual(normalizeCourseName('물리학Ⅰ'), normalizeCourseName('물리학 I'));
});

test('신청 표시는 원형과 영문 O만 허용한다', () => {
  assert.equal(isSelectedMark('○'), true);
  assert.equal(isSelectedMark('O'), true);
  assert.equal(isSelectedMark('o'), true);
  assert.equal(isSelectedMark('0'), false);
});

test('과목 순서와 관계없이 추가와 삭제를 비교한다', () => {
  const result = compareCourseSets(['문학', '물리학Ⅰ', '생명과학Ⅰ'], ['사회문화', '문학', '물리학Ⅰ']);
  assert.deepEqual(result.added, ['사회문화']);
  assert.deepEqual(result.removed, ['생명과학Ⅰ']);
  assert.equal(result.status, '과목 변경');
});

test('학생 고유번호가 있으면 우선 사용한다', () => {
  assert.equal(makeStudentMatchKey({ externalId: 'A-101', currentClass: 1, currentNumber: 1, name: '김학생' }, 2026), 'external:2026:A-101');
  assert.equal(makeStudentMatchKey({ currentClass: 1, currentNumber: 1, name: '김학생' }, 2026), 'fallback:2026:1:1:김학생');
});

test('집계 행은 건너뛰고 학생별 원 표시 과목만 읽는다', () => {
  const rows = [
    ['순번', '반', '번호', '이름', '문학', '물리학Ⅰ', '사회문화'],
    ['', '', '', '', '106', '53', '61'],
    [1, 1, 1, '김학생', '○', '', 'O'],
    [2, 1, 2, '박학생', '', 'o', ''],
  ];
  const parsed = parseOfficialRows(rows, '2026년입학생_2학년_1반_1학기.xlsx');
  assert.equal(parsed.students.length, 2);
  assert.equal(parsed.currentClass, 1);
  assert.deepEqual(parsed.students[0].courses, ['문학', '사회문화']);
  assert.deepEqual(parsed.students[1].courses, ['물리학Ⅰ']);
  assert.equal(parsed.targetGrade, 2);
  assert.equal(parsed.targetSemester, 1);
});

test('병합된 다중 헤더에서 핵심·권장과목 열을 분리한다', () => {
  const aliases = { track:['계열'], region:['지역','권역'], university:['대학명'], department:['모집단위'], coreCourses:['핵심과목'], recommendedCourses:['권장과목'], note:['비고'] };
  const raw = [
    ['계열','지역','대학명','모집단위(계열, 단과대, 학과)','반영과목','','비고'],
    ['','','','','핵심과목','권장과목',''],
    ['자연','서울','가톨릭대','컴퓨터정보공학부','수학, 물리학','정보',''],
  ];
  const rows = expandMergedCells(raw, [{ s:{r:0,c:4}, e:{r:0,c:5} }]);
  const detected = detectHeaderRange(rows, aliases);
  const headers = compositeHeaders(rows, detected.start, detected.end);
  const mapped = mapHeaderColumns(headers, aliases);
  assert.equal(detected.start, 0);
  assert.equal(detected.end, 1);
  assert.equal(mapped.coreCourses, 4);
  assert.equal(mapped.recommendedCourses, 5);
  assert.equal(mapped.department, 3);
});

test('계열별 매트릭스는 빈 셀과 대시를 건너뛰고 영역과 과목을 분리한다', () => {
  const headers = ['계열', '모집단위', '수학 / 대수', '수학 / 미적분', '과학 / 물리학'];
  const courses = matrixCoursesFromRow(headers, { track: 0, department: 1 }, ['공학', '컴퓨터공학', '가톨릭대', '-', '']);
  assert.deepEqual(courses, [{ courseName: '대수', subjectArea: '수학', universities: '가톨릭대', recommendationType: 'recommended' }]);
});

test('계열별 매트릭스는 두 줄 헤더에서 계열·학과와 과목 열을 분리한다', () => {
  const aliases = { track:['계열'], department:['학과','모집단위'] };
  const rows = [
    ['모집단위', '모집단위', '교과목', '교과목'],
    ['계열', '학과', '수학', '과학'],
    ['공학', '컴퓨터공학', '가톨릭대, 국민대(확률과통계, 미적분Ⅰ)', ''],
  ];
  const detected = detectHeaderRange(rows, aliases, 10, true);
  const headers = compositeHeaders(rows, detected.start, detected.end);
  const mapping = mapHeaderColumns(headers, aliases);
  assert.deepEqual([detected.start, detected.end], [0, 1]);
  assert.deepEqual(mapping, { track:0, department:1 });
  assert.equal(matrixCourseColumns(headers, mapping).length, 2);
  assert.deepEqual(matrixCoursesFromRow(headers, mapping, rows[2]), [{ courseName:'수학', subjectArea:'', universities:'가톨릭대, 국민대(확률과통계, 미적분Ⅰ)', recommendationType:'recommended' }]);
});

test('과목 매칭 키는 명확한 표기 차이만 통합하고 선택군은 보수적으로 처리한다', () => {
  assert.equal(courseMatchKey('미적분Ⅰ'), courseMatchKey('미적분 I'));
  assert.equal(classifyCourseNameMatch('미적분Ⅰ', '미적분 I'), 'normalized');
  assert.equal(classifyCourseNameMatch('경제', '경제 수학'), 'unmatched');
  assert.equal(classifyCourseNameMatch('정보 / 일본어', '정보'), 'needs_confirmation');
  assert.notEqual(courseComparisonKey('정보 / 일본어'), courseComparisonKey('정보'));
});

test('최신 공식 결과 범위는 차수가 아니라 입학년도·반·학년·학기로 정한다', () => {
  const first = makeScopeKey({ entranceYear: 2026, roundNumber: 1, currentClass: 2, targetGrade: 2, targetSemester: 1 });
  const changed = makeScopeKey({ entranceYear: 2026, roundNumber: 2, currentClass: 2, targetGrade: 2, targetSemester: 1 });
  assert.equal(first, changed);
  assert.equal(first, '2026:2:2:1');
});

test('공식 결과 파서는 중앙 열 별칭과 오류·제외 행을 구분한다', () => {
  const rows = [
    ['연번', '학급', '출석번호', '성명', '미적분Ⅰ', '정보 / 일본어'],
    [1, 1, 1, '김학생', 'O', ''],
    ['', '', '', '', '1', '1개 중 1개 선택'],
    [2, 1, '', '박학생', '', 'O'],
  ];
  const parsed = parseOfficialRows(rows, '학교다운로드.xls');
  assert.equal(parsed.headerRow, 1);
  assert.equal(parsed.students.length, 1);
  assert.equal(parsed.excludedRows.length, 1);
  assert.equal(parsed.ambiguousCourseNames[0], '정보 / 일본어');
  assert.match(parsed.error, /3번째|4번째/);
  assert.equal(parsed.targetGrade, 0);
  assert.equal(parsed.targetSemester, 0);
});

test('공식 결과 파서는 같은 학생과 같은 과목 열의 중복을 차단한다', () => {
  const rows = [
    ['반', '번호', '이름', '문학', '문학'],
    [1, 1, '김학생', 'O', ''],
    [1, 1, '김학생', '', 'O'],
  ];
  const parsed = parseOfficialRows(rows, '2학년 1학기.xls');
  assert.ok(parsed.errors.some((error) => error.includes('같은 과목 열')));
  assert.ok(parsed.errors.some((error) => error.includes('중복')));
});
