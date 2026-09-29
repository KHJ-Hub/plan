export const MAX_PUBLIC_PDF_BYTES: number;
export const MAX_PUBLIC_PDF_REDIRECTS: number;
export const PUBLIC_PDF_TIMEOUT_MS: number;
export type PublicPdfOptions = { allowedHosts?: string[]; timeoutMs?: number };
export class PublicPdfError extends Error { status: number; constructor(message: string, status?: number); }
export function validatePublicPdfUrl(input: unknown, options?: PublicPdfOptions): URL;
export function downloadPublicPdf(input: unknown, fetcher?: typeof fetch, options?: PublicPdfOptions): Promise<{ bytes: Uint8Array; finalUrl: string; fileName: string }>;
