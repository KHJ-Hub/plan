import { env } from 'cloudflare:workers';

export function getDatabase(): D1Database {
  if (!env.DB) throw new Error('데이터베이스 연결이 설정되지 않았습니다.');
  return env.DB;
}

export function getRuntimeEnv() {
  return env as Cloudflare.Env;
}
