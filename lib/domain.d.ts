export function normalizeCourseName(value: unknown): string;
export function isSelectedMark(value: unknown): boolean;
export function compareCourseSets(before?: string[], after?: string[]): { added: string[]; removed: string[]; unchanged: string[]; status: string; changed: boolean };
export function makeStudentMatchKey(student: { externalId?: string; currentClass: number; currentNumber: number; name: string }, entranceYear: number): string;
export function makeScopeKey(file: { entranceYear: number; roundNumber: number; currentClass: number; targetGrade: number; targetSemester: number }): string;
