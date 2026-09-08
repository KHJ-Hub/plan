import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCourseSets, isSelectedMark, makeStudentMatchKey, normalizeCourseName } from '../lib/domain.mjs';
import { parseOfficialRows } from '../lib/excel-logic.mjs';

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
