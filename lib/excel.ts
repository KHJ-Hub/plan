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
  warnings: string[];
  error?: string;
};

async function digest(file: File) {
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export async function parseOfficialWorkbook(file: File): Promise<ParsedOfficialFile> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  return { ...parseOfficialRows(rows, file.name, sheetName), checksum: await digest(file) };
}

// 통합 파일도 반별 공식 결과 범위로 안전하게 분리해 기존 교체·보존 규칙을 재사용합니다.
export function splitIntegratedOfficialFile(file: ParsedOfficialFile): ParsedOfficialFile[] {
  const byClass = new Map<number, ParsedStudent[]>();
  for (const student of file.students) byClass.set(student.currentClass, [...(byClass.get(student.currentClass) || []), student]);
  if (byClass.size <= 1) return [file];
  return [...byClass.entries()].sort(([a], [b]) => a - b).map(([currentClass, students]) => ({ ...file, fileName: `${file.fileName} · ${currentClass}반`, currentClass, students, warnings: [...file.warnings, `전교생 통합 파일에서 ${currentClass}반 ${students.length}명을 자동 분리했습니다.`] }));
}
