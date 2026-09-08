export function inferTarget(fileName: string, sheetName?: string): { targetGrade: number; targetSemester: number };
export function parseOfficialRows(rows: unknown[][], fileName: string, sheetName?: string): Omit<import('./excel').ParsedOfficialFile, 'checksum'>;
