declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ADMIN_PASSWORD?: string;
    SESSION_SECRET?: string;
    PUBLIC_PDF_ALLOWED_HOSTS?: string;
  }
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}
