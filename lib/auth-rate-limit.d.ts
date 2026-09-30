export type AuthRateLimitKey = { hash: string; scope: string; limit: number };
export function createAuthRateLimitKeys(request: Request, role: 'admin' | 'student', identity: string): Promise<AuthRateLimitKey[]>;
export function checkAuthRateLimit(db: D1Database, keys: AuthRateLimitKey[], currentTime?: number): Promise<{ limited: boolean; retryAfterSeconds: number }>;
export function recordAuthFailure(db: D1Database, keys: AuthRateLimitKey[], currentTime?: number): Promise<void>;
export function clearAuthIdentityFailure(db: D1Database, keys: AuthRateLimitKey[]): Promise<void>;
