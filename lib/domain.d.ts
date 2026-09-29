export function normalizeCourseName(value: unknown): string;
export function isAmbiguousCourseName(value: unknown): boolean;
export function courseMatchKey(value: unknown): string;
export function courseComparisonKey(value: unknown): string;
export function classifyCourseNameMatch(left: unknown, right: unknown): 'exact' | 'normalized' | 'needs_confirmation' | 'unmatched';
export function isSelectedMark(value: unknown): boolean;
export function compareCourseSets(before?: string[], after?: string[]): { added: string[]; removed: string[]; unchanged: string[]; status: string; changed: boolean };
export function makeStudentMatchKey(student: { externalId?: string; currentClass: number; currentNumber: number; name: string }, entranceYear: number): string;
export function makeScopeKey(file: { entranceYear: number; currentClass: number; targetGrade: number; targetSemester: number }): string;
