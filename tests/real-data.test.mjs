import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSXModule from 'xlsx';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import ts from 'typescript';
import { parseOfficialRows } from '../lib/excel-logic.mjs';

const XLSX = XLSXModule.default || XLSXModule;
const excelDirectory = path.resolve('test-data/2026');
const pdfDirectory = path.resolve('test-data/reference');
const excelFiles = fs.existsSync(excelDirectory) ? fs.readdirSync(excelDirectory).filter((name) => /\.xlsx?$/i.test(name)) : [];
const pdfFiles = fs.existsSync(pdfDirectory) ? fs.readdirSync(pdfDirectory).filter((name) => /\.pdf$/i.test(name)) : [];

function parseExcel(fileName) {
  const workbook = XLSX.readFile(path.join(excelDirectory, fileName), { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
  return { workbook, parsed: parseOfficialRows(rows, fileName, sheetName) };
}

async function loadEducationGuideParser() {
  const source = fs.readFileSync(path.resolve('lib/education-guide-pdf.ts'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

test('실제 2학년 1·2학기 Excel을 개인정보 출력 없이 검증한다', { skip: excelFiles.length !== 2 }, () => {
  const reports = excelFiles.map(parseExcel).map(({ workbook, parsed }) => ({ workbook, parsed }));
  assert.deepEqual(reports.map(({ workbook }) => workbook.SheetNames), [['Sheet1'], ['Sheet1']]);
  assert.deepEqual(reports.map(({ parsed }) => parsed.students.length), [106, 106]);
  assert.deepEqual(reports.map(({ parsed }) => parsed.courseCount).sort((a, b) => a - b), [14, 16]);
  assert.deepEqual(reports.map(({ parsed }) => parsed.excludedRows.length), [2, 2]);
  assert.ok(reports.every(({ parsed }) => parsed.errors.length === 0));
  assert.ok(reports.every(({ parsed }) => parsed.students.every((student) => student.courses.length === 10)));
  assert.ok(reports.every(({ parsed }) => new Set(parsed.students.map((student) => student.currentClass)).size === 6));
  assert.deepEqual(reports.map(({ parsed }) => parsed.targetSemester).sort(), [1, 2]);
  assert.ok(reports.every(({ parsed }) => parsed.targetGrade === 2));

  const identitySets = reports.map(({ parsed }) => new Set(parsed.students.map((student) => `${student.currentClass}:${student.currentNumber}:${student.name}`)));
  assert.equal([...identitySets[0]].filter((identity) => identitySets[1].has(identity)).length, 106);
  assert.ok(reports.every(({ parsed }) => parsed.students.filter((student) => student.externalId).length === 0));
});

test('실제 교육청 PDF를 브라우저와 같은 경로로 분석한다', { skip: pdfFiles.length === 0 }, async () => {
  const { parseEducationGuidePages } = await loadEducationGuideParser();
  const bytes = new Uint8Array(fs.readFileSync(path.join(pdfDirectory, pdfFiles[0])));
  const document = await pdfjs.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    let lastY;
    const text = content.items.map((item) => {
      const y = Math.round(Number(item.transform?.[5] || 0));
      const prefix = lastY !== undefined && Math.abs(y - lastY) > 2 ? '\n' : ' ';
      lastY = y;
      return `${prefix}${item.str || ''}`;
    }).join('');
    pages.push({ pageNumber, text });
  }
  const records = parseEducationGuidePages(pages);
  assert.equal(document.numPages, 243);
  assert.equal(records.length, 114);
  assert.equal(new Set(records.map((record) => record.courseName)).size, 114);
  assert.equal(records.filter((record) => record.extractionStatus === 'ok').length, 85);
  assert.equal(records.filter((record) => record.extractionStatus === 'needs_confirmation').length, 29);
  assert.equal(records.filter((record) => /공통 과목|과 목|^의 /.test(record.courseName)).length, 0);
});
