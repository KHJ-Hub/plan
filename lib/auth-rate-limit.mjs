const encoder = new TextEncoder();
const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;

async function hashKey(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createAuthRateLimitKeys(request, role, identity) {
  const address = request.headers.get('cf-connecting-ip') || 'unknown';
  const identityLimit = role === 'admin' ? 5 : 8;
  const addressLimit = role === 'admin' ? 12 : 60;
  return [
    { hash: await hashKey(`auth:${role}:ip:${address}`), scope: `${role}:ip`, limit: addressLimit },
    { hash: await hashKey(`auth:${role}:identity:${identity}`), scope: `${role}:identity`, limit: identityLimit },
  ];
}

export async function checkAuthRateLimit(db, keys, currentTime = Date.now()) {
  let blockedUntil = 0;
  for (const key of keys) {
    const row = await db.prepare('SELECT blocked_until FROM auth_rate_limits WHERE key_hash=?').bind(key.hash).first();
    blockedUntil = Math.max(blockedUntil, Number(row?.blocked_until) || 0);
  }
  return blockedUntil > currentTime
    ? { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - currentTime) / 1000)) }
    : { limited: false, retryAfterSeconds: 0 };
}

export async function recordAuthFailure(db, keys, currentTime = Date.now()) {
  const windowStart = currentTime - WINDOW_MS;
  const blockedUntil = currentTime + BLOCK_MS;
  const statements = [db.prepare('DELETE FROM auth_rate_limits WHERE updated_at<?').bind(currentTime - RETENTION_MS)];
  for (const key of keys) {
    statements.push(db.prepare(`INSERT INTO auth_rate_limits(key_hash,scope,failure_count,blocked_until,updated_at)
      VALUES(?,?,1,0,?)
      ON CONFLICT(key_hash) DO UPDATE SET
        scope=excluded.scope,
        failure_count=CASE WHEN auth_rate_limits.updated_at<? THEN 1 ELSE auth_rate_limits.failure_count+1 END,
        blocked_until=CASE
          WHEN auth_rate_limits.updated_at>=? AND auth_rate_limits.failure_count+1>=? THEN ?
          ELSE 0
        END,
        updated_at=excluded.updated_at`).bind(key.hash, key.scope, currentTime, windowStart, windowStart, key.limit, blockedUntil));
  }
  await db.batch(statements);
}

export async function clearAuthIdentityFailure(db, keys) {
  const identity = keys.find((key) => key.scope.endsWith(':identity'));
  if (identity) await db.prepare('DELETE FROM auth_rate_limits WHERE key_hash=?').bind(identity.hash).run();
}
