'use client';

import * as XLSX from 'xlsx';
import { parseOfficialRows } from './excel-logic.mjs';

export type ParsedStudent = {
  currentClass: number;
  currentNumber: number;
  name: string;
  externalId?: string;
  courses: string[];
};

export type ParsedOfficialFile = {
  fileName: string;
  checksum: string;
  currentClass: number;
  targetGrade: number;
  targetSemester: number;
  students: ParsedStudent[];
  courseCount: number;
  courseNames: string[];
  warnings: string[];
  errors: string[];
  excludedRows: Array<{ rowNumber: number; reason: string }>;
  ambiguousCourseNames: string[];
  headerRow: number;
  columnMapping: Partial<Record<'currentClass' | 'currentNumber' | 'name' | 'externalId', { index: number; header: string } | null>>;
  error?: string;
};

async function digest(file: File) {
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export async function parseOfficialWorkbook(file: File): Promise<ParsedOfficialFile> {
  if (!/\.xlsx?$/i.test(file.name)) throw new Error('지원하지 않는 파일 형식입니다. .xls 또는 .xlsx 파일을 선택해주세요.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Excel 파일은 10MB 이하만 분석할 수 있습니다. 학교 시스템에서 학기별 파일을 다시 내려받아주세요.');
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel 파일에서 시트를 찾지 못했습니다.');
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  if (rows.length > 5000 || Math.max(0, ...rows.map((row) => row.length)) > 300) throw new Error('Excel 행 또는 열 수가 허용 범위를 초과했습니다. 학기별 수강신청 결과 파일인지 확인해주세요.');
  return { ...parseOfficialRows(rows, file.name, sheetName), checksum: await digest(file) };
}

// 통합 파일도 반별 공식 결과 범위로 안전하게 분리해 기존 교체·보존 규칙을 재사용합니다.
export function splitIntegratedOfficialFile(file: ParsedOfficialFile): ParsedOfficialFile[] {
  const byClass = new Map<number, ParsedStudent[]>();
  for (const student of file.students) byClass.set(student.currentClass, [...(byClass.get(student.currentClass) || []), student]);
  if (byClass.size <= 1) return [file];
  return [...byClass.entries()].sort(([a], [b]) => a - b).map(([currentClass, students]) => ({ ...file, fileName: `${file.fileName} · ${currentClass}반`, currentClass, students, warnings: [...file.warnings, `전교생 통합 파일에서 ${currentClass}반 ${students.length}명을 자동 분리했습니다.`] }));
}
