import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAuthRateLimit, clearAuthIdentityFailure, createAuthRateLimitKeys, recordAuthFailure } from '../lib/auth-rate-limit.mjs';

class MemoryStatement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new MemoryStatement(this.db, this.sql, args); }
  async first() { return this.db.rows.get(this.args[0]) || null; }
  async run() {
    if (this.sql.startsWith('DELETE FROM auth_rate_limits WHERE updated_at')) {
      for (const [key, row] of this.db.rows) if (row.updated_at < this.args[0]) this.db.rows.delete(key);
    } else if (this.sql.startsWith('DELETE FROM auth_rate_limits WHERE key_hash')) {
      this.db.rows.delete(this.args[0]);
    } else if (this.sql.startsWith('INSERT INTO auth_rate_limits')) {
      const [hash, scope, currentTime, windowStart, , limit, blockedUntil] = this.args;
      const previous = this.db.rows.get(hash);
      const failureCount = !previous || previous.updated_at < windowStart ? 1 : previous.failure_count + 1;
      this.db.rows.set(hash, {
        scope,
        failure_count: failureCount,
        blocked_until: previous && previous.updated_at >= windowStart && previous.failure_count + 1 >= limit ? blockedUntil : 0,
        updated_at: currentTime,
      });
    }
    return { success: true };
  }
}

class MemoryDb {
  rows = new Map();
  prepare(sql) { return new MemoryStatement(this, sql); }
  async batch(statements) { for (const statement of statements) await statement.run(); }
}

test('student login attempts are hashed and blocked after repeated failures', async () => {
  const db = new MemoryDb();
  const request = new Request('https://school.example/api/auth', { headers: { 'cf-connecting-ip': '203.0.113.7' } });
  const keys = await createAuthRateLimitKeys(request, 'student', '2026:1:2:학생이름');
  assert.equal(keys.some((key) => key.hash.includes('학생이름') || key.hash.includes('203.0.113.7')), false);
  for (let attempt = 0; attempt < 8; attempt += 1) await recordAuthFailure(db, keys, 1_000 + attempt);
  const state = await checkAuthRateLimit(db, keys, 2_000);
  assert.equal(state.limited, true);
  assert.ok(state.retryAfterSeconds > 0);
});

test('successful login clears only the identity failure record', async () => {
  const db = new MemoryDb();
  const request = new Request('https://school.example/api/auth', { headers: { 'cf-connecting-ip': '203.0.113.8' } });
  const keys = await createAuthRateLimitKeys(request, 'admin', 'teacher');
  await recordAuthFailure(db, keys, 1_000);
  await clearAuthIdentityFailure(db, keys);
  assert.equal([...db.rows.values()].some((row) => row.scope === 'admin:identity'), false);
  assert.equal([...db.rows.values()].some((row) => row.scope === 'admin:ip'), true);
});
