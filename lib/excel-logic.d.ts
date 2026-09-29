export const officialColumnMappings: Readonly<Record<'sequence' | 'currentClass' | 'currentNumber' | 'name' | 'externalId' | 'ignored', readonly string[]>>;
export function inferTarget(fileName: string, sheetName?: string): { targetGrade: number; targetSemester: number };
export function parseOfficialRows(rows: unknown[][], fileName: string, sheetName?: string): Omit<import('./excel').ParsedOfficialFile, 'checksum'>;
