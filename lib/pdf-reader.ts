import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export type PdfReadStage = 'binary' | 'open';
export class PdfReadError extends Error {
  constructor(public stage: PdfReadStage, message: string, public cause?: unknown) { super(message); }
}
export type PdfPage = { pageNumber: number; items: unknown[] };
export type PdfPageFailure = { pageNumber: number; stage: 'page' | 'text'; message: string };

/**
 * 브라우저에서 PDF를 여는 공통 계층이다. 자료별 의미 해석은 호출하는 전용 parser가 맡는다.
 * 페이지 하나의 오류는 전체 분석을 멈추지 않고 failures로 돌려준다.
 */
export async function readPdfPages(file: File, onProgress: (current: number, total: number) => void) {
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.arrayBuffer()); }
  catch (error) { throw new PdfReadError('binary', '파일 binary를 읽지 못했습니다.', error); }

  let document: any;
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();
    document = await pdfjsLib.getDocument({ data: bytes }).promise;
  } catch (error) { throw new PdfReadError('open', 'PDF 문서를 열지 못했습니다.', error); }

  const pages: PdfPage[] = [];
  const failures: PdfPageFailure[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    onProgress(pageNumber, document.numPages);
    try {
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        pages.push({ pageNumber, items: content.items as unknown[] });
      } catch (error) { failures.push({ pageNumber, stage: 'text', message: error instanceof Error ? error.message : '텍스트를 추출하지 못했습니다.' }); }
    } catch (error) { failures.push({ pageNumber, stage: 'page', message: error instanceof Error ? error.message : '페이지를 열지 못했습니다.' }); }
    if (pageNumber % 6 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { pageCount: document.numPages, pages, failures };
}
