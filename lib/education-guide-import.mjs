import { courseComparisonKey } from './domain.mjs';

const text = (row, key) => String(row?.[key] ?? '').trim();
const limited = (row, key, max = 20_000) => text(row, key).slice(0, max);

export function isEducationGuidePublishable(row) {
  return Boolean(text(row, 'courseName') && text(row, 'subjectGroup') && text(row, 'hierarchy') && text(row, 'relatedCareers') && text(row, 'relatedDepartments'));
}

export function normalizeEducationGuideRows(incoming = []) {
  const rows = []; const invalidRows = [];
  for (const [index, row] of incoming.entries()) {
    const rowNumber = index + 1;
    const courseName = text(row, 'courseName');
    const sourcePage = Number(row?.sourcePage);
    if (!courseName) { invalidRows.push({ rowNumber, reason: '과목명이 비어 있습니다.' }); continue; }
    if (courseName.length > 100) { invalidRows.push({ rowNumber, reason: '과목명은 100자 이하여야 합니다.' }); continue; }
    if (!Number.isInteger(sourcePage) || sourcePage < 1) { invalidRows.push({ rowNumber, reason: '원본 PDF 페이지 번호를 확인해주세요.' }); continue; }
    const normalized = {
      ...row,
      courseName, subjectGroup: limited(row, 'subjectGroup', 100), selectionType: limited(row, 'selectionType', 30), credits: limited(row, 'credits', 30),
      gradingMethod: limited(row, 'gradingMethod', 200), csatRelation: limited(row, 'csatRelation', 100), courseNature: limited(row, 'courseNature'), coreIdeas: limited(row, 'coreIdeas'),
      contentStructure: limited(row, 'contentStructure'), knowledgeUnderstanding: limited(row, 'knowledgeUnderstanding'), processSkills: limited(row, 'processSkills'), valuesAttitudes: limited(row, 'valuesAttitudes'),
      hierarchy: limited(row, 'hierarchy'), relatedCareers: limited(row, 'relatedCareers'), relatedDepartments: limited(row, 'relatedDepartments'), rawText: limited(row, 'rawText', 100_000),
      sourcePage, pageCount: Number(row?.pageCount) || 0, excludedPages: Number(row?.excludedPages) || 0,
    };
    normalized.extractionStatus = text(row, 'extractionStatus') === 'ok' && isEducationGuidePublishable(normalized) ? 'ok' : 'needs_confirmation';
    rows.push(normalized);
  }
  const counts = new Map();
  for (const row of rows) { const key = courseComparisonKey(row.courseName); counts.set(key, (counts.get(key) || 0) + 1); }
  const duplicateCourseNames = [...new Set(rows.filter((row) => (counts.get(courseComparisonKey(row.courseName)) || 0) > 1).map((row) => row.courseName))];
  return { rows, invalidRows, duplicateCourseNames };
}
