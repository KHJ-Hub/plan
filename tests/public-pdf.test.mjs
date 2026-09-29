import test from 'node:test';
import assert from 'node:assert/strict';
import { isEducationGuidePublishable, normalizeEducationGuideRows } from '../lib/education-guide-import.mjs';
import { downloadPublicPdf, PublicPdfError, validatePublicPdfUrl } from '../lib/public-pdf.mjs';

const pdfBytes = new TextEncoder().encode('%PDF-1.7\nminimal test document');

async function rejectsWith(input, message) {
  await assert.rejects(input, (error) => error instanceof PublicPdfError && error.message.includes(message));
}

test('공개 PDF URL은 HTTPS 공개 호스트만 허용한다', () => {
  assert.equal(validatePublicPdfUrl('https://school.edu/guide.pdf#page=2').toString(), 'https://school.edu/guide.pdf');
  for (const url of [
    'http://school.edu/guide.pdf',
    'https://localhost/guide.pdf',
    'https://127.0.0.1/guide.pdf',
    'https://10.0.0.2/guide.pdf',
    'https://169.254.169.254/metadata',
    'https://192.168.1.2/guide.pdf',
    'https://[::1]/guide.pdf',
    'https://[::ffff:7f00:1]/guide.pdf',
    'https://[::7f00:1]/guide.pdf',
    'https://[ff02::1]/guide.pdf',
    'https://attacker.example/guide.pdf',
    'https://user:password@school.edu/guide.pdf',
    'https://school.edu:8443/guide.pdf',
  ]) assert.throws(() => validatePublicPdfUrl(url), PublicPdfError);
});

test('공개 PDF 다운로드는 redirect 대상도 다시 검증한다', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return new Response(null, { status: 302, headers: { location: 'https://192.168.0.10/private.pdf' } });
  };
  await rejectsWith(() => downloadPublicPdf('https://school.edu/guide.pdf', fetcher), '내부 네트워크');
  assert.equal(calls, 1);
});

test('공개 PDF 다운로드는 안전한 상대 redirect와 PDF 응답을 허용한다', async () => {
  const requested = [];
  const fetcher = async (url, init) => {
    requested.push({ url: url.toString(), init });
    if (requested.length === 1) return new Response(null, { status: 302, headers: { location: '/files/course-guide.pdf' } });
    return new Response(pdfBytes, { status: 200, headers: { 'content-type': 'application/pdf', 'content-length': String(pdfBytes.length) } });
  };
  const result = await downloadPublicPdf('https://school.edu/download?id=1', fetcher);
  assert.equal(result.finalUrl, 'https://school.edu/files/course-guide.pdf');
  assert.equal(result.fileName, 'course-guide.pdf');
  assert.deepEqual(result.bytes, pdfBytes);
  assert.equal(requested[0].init.redirect, 'manual');
  assert.equal(requested[0].init.headers.Accept, 'application/pdf');
});

test('공개 PDF 다운로드는 크기·Content-Type·signature를 검증한다', async () => {
  await rejectsWith(
    () => downloadPublicPdf('https://school.edu/large.pdf', async () => new Response(null, { status: 200, headers: { 'content-type': 'application/pdf', 'content-length': String(21 * 1024 * 1024) } })),
    '20MB',
  );
  await rejectsWith(
    () => downloadPublicPdf('https://school.edu/page', async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })),
    'PDF 파일을 반환하지 않았습니다',
  );
  await rejectsWith(
    () => downloadPublicPdf('https://school.edu/fake.pdf', async () => new Response('not a pdf', { status: 200, headers: { 'content-type': 'application/pdf' } })),
    '올바른 PDF 형식',
  );
});

test('Content-Length가 없어도 streaming 중 20MB를 넘으면 즉시 중단한다', async () => {
  let cancelled = false;
  const chunk = new Uint8Array(11 * 1024 * 1024);
  const body = new ReadableStream({
    start(controller) { controller.enqueue(chunk); controller.enqueue(chunk); },
    cancel() { cancelled = true; },
  });
  await rejectsWith(
    () => downloadPublicPdf('https://school.edu/stream.pdf', async () => new Response(body, { status: 200, headers: { 'content-type': 'application/pdf' } })),
    '20MB',
  );
  assert.equal(cancelled, true);
});

test('기본 교육기관 외 호스트는 명시적 allowlist가 있어야 한다', async () => {
  assert.throws(() => validatePublicPdfUrl('https://files.example.com/guide.pdf'), PublicPdfError);
  assert.equal(
    validatePublicPdfUrl('https://files.example.com/guide.pdf', { allowedHosts: ['files.example.com'] }).hostname,
    'files.example.com',
  );
  const result = await downloadPublicPdf(
    'https://files.example.com/guide.pdf',
    async () => new Response(pdfBytes, { status: 200, headers: { 'content-type': 'application/pdf' } }),
    { allowedHosts: ['files.example.com'] },
  );
  assert.equal(result.fileName, 'guide.pdf');
});

test('느린 PDF 응답은 deadline 후 중단한다', async () => {
  const fetcher = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
  await rejectsWith(
    () => downloadPublicPdf('https://school.edu/slow.pdf', fetcher, { timeoutMs: 1_000 }),
    '시간이 초과',
  );
});

test('교육청 추출 행은 누락·중복·학생 공개 조건을 서버와 같은 규칙으로 판정한다', () => {
  const complete = { courseName: '미적분Ⅰ', subjectGroup: '수학', hierarchy: '선수 과목', relatedCareers: '연구원', relatedDepartments: '수학과', sourcePage: 10, extractionStatus: 'ok' };
  assert.equal(isEducationGuidePublishable(complete), true);
  const normalized = normalizeEducationGuideRows([
    complete,
    { ...complete, courseName: '미적분 I', sourcePage: 11 },
    { ...complete, courseName: '이름만 있고 페이지가 잘못된 과목', sourcePage: 0 },
    { ...complete, courseName: '설명 누락 과목', hierarchy: '', sourcePage: 12 },
  ]);
  assert.equal(normalized.rows.length, 3);
  assert.equal(normalized.invalidRows.length, 1);
  assert.deepEqual(new Set(normalized.duplicateCourseNames), new Set(['미적분Ⅰ', '미적분 I']));
  assert.equal(normalized.rows[2].extractionStatus, 'needs_confirmation');
});
