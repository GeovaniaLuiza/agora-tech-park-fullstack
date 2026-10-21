import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticate, authorize } from '../src/middlewares/auth.js';

const profiles = vi.hoisted(() => ({ findAuthenticationProfile: vi.fn() }));
vi.mock('../src/repositories/userRepository.js', () => profiles);
const secret = 'session-test-secret-with-at-least-32-characters';
const profile = { id: 'user', role: 'ADMIN', status: 'ACTIVE', session_version: 2, email_verified_at: 'verified', organizations: [] };
const token = (claims = {}, options = {}) => jwt.sign({ sub: 'user', sv: 2, ...claims }, secret, { expiresIn: '1h', ...options });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => {
  process.env.JWT_SECRET = secret;
  vi.clearAllMocks();
  profiles.findAuthenticationProfile.mockResolvedValue(profile);
});

describe('JWT account generation and RBAC', () => {
  it.each([undefined, '', 'Basic abc', 'Bearer invalid'])('rejects missing/malformed authorization: %s', async (authorization) => {
    const res = response(); const next = vi.fn();
    await authenticate({ headers: { authorization } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(profiles.findAuthenticationProfile).not.toHaveBeenCalled();
  });
  it.each([0, 1, 3])('rejects a mismatched generation %s', async (sv) => {
    const res = response();
    await authenticate({ headers: { authorization: `Bearer ${token({ sv })}` } }, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_REVOKED' }));
  });
  it.each([-1, '2', 1.5, null])('rejects an invalid generation %s', async (sv) => {
    const res = response();
    await authenticate({ headers: { authorization: `Bearer ${token({ sv })}` } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(profiles.findAuthenticationProfile).not.toHaveBeenCalled();
  });
  it.each([{ expiresIn: '-1s' }, { algorithm: 'HS384' }])('rejects expiry or an unaccepted algorithm: %j', async (options) => {
    const res = response();
    await authenticate({ headers: { authorization: `Bearer ${token({}, options)}` } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(profiles.findAuthenticationProfile).not.toHaveBeenCalled();
  });
  it('accepts legacy tokens only before the first account revocation', async () => {
    const legacy = jwt.sign({ sub: 'user' }, secret, { expiresIn: '1h' });
    profiles.findAuthenticationProfile.mockResolvedValueOnce({ ...profile, session_version: 0 });
    const next = vi.fn();
    await authenticate({ headers: { authorization: `Bearer ${legacy}` } }, response(), next);
    expect(next).toHaveBeenCalledOnce();
    const res = response();
    await authenticate({ headers: { authorization: `Bearer ${legacy}` } }, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_REVOKED' }));
  });
  it.each([null, { ...profile, status: 'INACTIVE' }, { ...profile, email_verified_at: null },
    { ...profile, role: 'UNKNOWN' }, { ...profile, role: 'RESIDENTE' }])('rejects an unavailable account: %j', async (user) => {
    profiles.findAuthenticationProfile.mockResolvedValue(user);
    const res = response();
    await authenticate({ headers: { authorization: `Bearer ${token()}` } }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
  it('uses the current database role, never a role supplied in the JWT', async () => {
    profiles.findAuthenticationProfile.mockResolvedValue({ ...profile, role: 'GESTOR' });
    const req = { headers: { authorization: `Bearer ${token({ role: 'ADMIN' })}` } };
    const res = response(); const next = vi.fn();
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    authorize('ADMIN')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(req.sessionVersion).toBe(2);
  });
  it('fails closed when PostgreSQL is unavailable', async () => {
    const error = new Error('database unavailable');
    profiles.findAuthenticationProfile.mockRejectedValue(error);
    const next = vi.fn();
    await authenticate({ headers: { authorization: `Bearer ${token()}` } }, response(), next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
