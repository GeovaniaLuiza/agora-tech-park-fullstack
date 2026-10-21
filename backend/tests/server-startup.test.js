import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const dependencies = vi.hoisted(() => ({
  ready: vi.fn(), listen: vi.fn(), email: vi.fn(), shutdown: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), fatal: vi.fn() },
}));
vi.mock('dotenv/config', () => ({}));
vi.mock('../src/app.js', () => ({ default: { listen: dependencies.listen } }));
vi.mock('../src/config/sessionSchema.js', () => ({ assertSessionSchemaReady: dependencies.ready }));
vi.mock('../src/config/environment.js', () => ({ validateEnvironment: () => ({ PORT: 0, LISTEN_HOST: '127.0.0.1', EMAIL_PROVIDER: 'mock' }) }));
vi.mock('../src/services/emailService.js', () => ({ verifyConnection: dependencies.email }));
vi.mock('../src/db/pool.js', () => ({ shutdown: dependencies.shutdown }));
vi.mock('../src/observability/logger.js', () => ({ logger: dependencies.logger }));
let exitCode;
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  exitCode = process.exitCode;
  dependencies.email.mockResolvedValue(undefined);
  dependencies.shutdown.mockResolvedValue(undefined);
  dependencies.listen.mockReturnValue({ close: vi.fn() });
  const once = process.once.bind(process);
  vi.spyOn(process, 'once').mockImplementation((event, listener) =>
    ['SIGTERM', 'SIGINT'].includes(event) ? process : once(event, listener));
});
afterEach(() => { process.exitCode = exitCode; vi.restoreAllMocks(); });

describe('server startup requires migration 022', () => {
  it('does not verify SMTP or open HTTP until the schema check finishes', async () => {
    let ready;
    dependencies.ready.mockReturnValue(new Promise((resolve) => { ready = resolve; }));
    await import('../src/server.js');
    expect(dependencies.listen).not.toHaveBeenCalled();
    expect(dependencies.email).not.toHaveBeenCalled();
    ready();
    await vi.waitFor(() => expect(dependencies.listen).toHaveBeenCalledOnce());
    expect(dependencies.email).toHaveBeenCalledOnce();
    expect(dependencies.shutdown).not.toHaveBeenCalled();
  });
  it.each(['SESSION_SCHEMA_NOT_READY', 'ECONNREFUSED'])('exits without opening HTTP when startup fails with %s', async (code) => {
    const error = Object.assign(new Error('schema not available'), { code });
    dependencies.ready.mockRejectedValue(error);
    await import('../src/server.js');
    await vi.waitFor(() => expect(dependencies.shutdown).toHaveBeenCalledOnce());
    expect(dependencies.listen).not.toHaveBeenCalled();
    expect(dependencies.email).not.toHaveBeenCalled();
    expect(dependencies.logger.fatal).toHaveBeenCalledWith(expect.objectContaining({ event: 'api_start_failed', err: error }), expect.any(String));
    expect(process.exitCode).toBe(1);
  });
});
