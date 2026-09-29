export const MAX_PUBLIC_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PUBLIC_PDF_REDIRECTS = 3;
export const PUBLIC_PDF_TIMEOUT_MS = 15_000;

const DEFAULT_TRUSTED_SUFFIXES = ['.go.kr', '.edu.kr', '.ac.kr', '.school.kr', '.edu'];

export class PublicPdfError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'PublicPdfError';
    this.status = status;
  }
}

function privateIpv4(hostname) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  const [first, second] = parts.map(Number);
  return first === 0 || first === 10 || first === 127 || first >= 224
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19));
}

function trustedHostname(hostname, allowedHosts) {
  const configured = allowedHosts.map((host) => String(host || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '')).filter(Boolean);
  if (configured.some((host) => hostname === host || hostname.endsWith(`.${host}`))) return true;
  return DEFAULT_TRUSTED_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

export function validatePublicPdfUrl(input, options = {}) {
  const value = String(input || '').trim();
  if (!value || value.length > 2048) throw new PublicPdfError('공개 PDF 주소를 확인해주세요.');
  let url;
  try { url = new URL(value); }
  catch { throw new PublicPdfError('올바른 공개 PDF 주소를 입력해주세요.'); }
  if (url.protocol !== 'https:') throw new PublicPdfError('보안을 위해 HTTPS 공개 주소만 사용할 수 있습니다.');
  if (url.username || url.password) throw new PublicPdfError('로그인 정보가 포함된 주소는 사용할 수 없습니다.');
  if (url.port && url.port !== '443') throw new PublicPdfError('표준 HTTPS 포트의 공개 주소만 사용할 수 있습니다.');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  // IPv6 literal은 압축·mapped 표기의 우회 가능성을 없애기 위해 모두 거부한다. 일반 교육기관
  // 도메인은 아래 allowlist를 통과해야 하므로 DNS rebinding 공격면도 임의 도메인에 열지 않는다.
  if (!hostname || hostname.includes(':') || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.lan') || hostname === 'metadata.google.internal' || privateIpv4(hostname)) {
    throw new PublicPdfError('내부 네트워크 또는 지원하지 않는 주소는 사용할 수 없습니다.');
  }
  if (!trustedHostname(hostname, options.allowedHosts || [])) throw new PublicPdfError('허용된 교육기관의 공개 PDF 주소가 아닙니다. 관리자 allowlist를 확인해주세요.', 403);
  url.hash = '';
  return url;
}

function fileNameFromUrl(url) {
  let decoded = 'public-course-guide.pdf';
  try { decoded = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || decoded); }
  catch { /* 잘못 인코딩된 경로는 안전한 기본 파일명을 사용한다. */ }
  const safe = [...decoded].map((character) => character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? '_' : character).join('').slice(0, 120);
  return /\.pdf$/i.test(safe) ? safe : `${safe || 'public-course-guide'}.pdf`;
}

async function readLimitedBody(response) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_PUBLIC_PDF_BYTES) throw new PublicPdfError('PDF 파일은 20MB 이하만 가져올 수 있습니다.', 413);
    return bytes;
  }
  const reader = response.body.getReader();
  // chunk 배열과 완성본을 동시에 들고 있지 않도록 최대 크기 버퍼 하나에 바로 기록한다.
  const buffer = new Uint8Array(MAX_PUBLIC_PDF_BYTES); let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.byteLength > MAX_PUBLIC_PDF_BYTES) {
      await reader.cancel();
      throw new PublicPdfError('PDF 파일은 20MB 이하만 가져올 수 있습니다.', 413);
    }
    buffer.set(value, total); total += value.byteLength;
  }
  return buffer.subarray(0, total);
}

export async function downloadPublicPdf(input, fetcher = globalThis.fetch, options = {}) {
  const allowedHosts = options.allowedHosts || [];
  let url = validatePublicPdfUrl(input, { allowedHosts });
  const timeoutMs = Math.min(30_000, Math.max(1_000, Number(options.timeoutMs) || PUBLIC_PDF_TIMEOUT_MS));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let redirects = 0; redirects <= MAX_PUBLIC_PDF_REDIRECTS; redirects += 1) {
      const response = await fetcher(url, { redirect: 'manual', headers: { Accept: 'application/pdf' }, signal: controller.signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects === MAX_PUBLIC_PDF_REDIRECTS) throw new PublicPdfError('PDF 주소의 이동 횟수가 너무 많습니다.', 400);
        const location = response.headers.get('location');
        if (!location) throw new PublicPdfError('PDF 이동 주소를 확인할 수 없습니다.', 502);
        await response.body?.cancel();
        url = validatePublicPdfUrl(new URL(location, url).toString(), { allowedHosts });
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new PublicPdfError('공개 PDF를 내려받지 못했습니다. 주소와 공개 상태를 확인해주세요.', response.status === 404 ? 404 : 502);
      }
      const announcedSize = Number(response.headers.get('content-length') || 0);
      if (announcedSize > MAX_PUBLIC_PDF_BYTES) {
        await response.body?.cancel();
        throw new PublicPdfError('PDF 파일은 20MB 이하만 가져올 수 있습니다.', 413);
      }
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/pdf')) {
        await response.body?.cancel();
        throw new PublicPdfError('주소가 PDF 파일을 반환하지 않았습니다.', 415);
      }
      const bytes = await readLimitedBody(response);
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new PublicPdfError('다운로드한 파일이 올바른 PDF 형식이 아닙니다.', 415);
      return { bytes, finalUrl: url.toString(), fileName: fileNameFromUrl(url) };
    }
    throw new PublicPdfError('PDF 주소를 처리하지 못했습니다.', 502);
  } catch (error) {
    if (error instanceof PublicPdfError) throw error;
    if (controller.signal.aborted) throw new PublicPdfError('PDF 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.', 504);
    throw new PublicPdfError('공개 PDF 주소에 연결하지 못했습니다.', 502);
  } finally {
    clearTimeout(timeout);
  }
}
