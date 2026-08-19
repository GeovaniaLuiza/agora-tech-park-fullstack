import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  databaseHealthCheck: vi.fn(),
  verifyConnection: vi.fn(),
}));

vi.mock('../src/db/pool.js', () => ({ databaseHealthCheck: dependencies.databaseHealthCheck }));
vi.mock('../src/services/emailService.js', () => ({ verifyConnection: dependencies.verifyConnection }));

import { getHealth, resetHealthCacheForTests } from '../src/services/healthService.js';

describe('health service', () => {
  beforeEach(() => {
    resetHealthCacheForTests();
    dependencies.databaseHealthCheck.mockReset();
    dependencies.verifyConnection.mockReset();
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'smtp.test';
  });

  it('retorna ok quando banco e SMTP estão disponíveis', async () => {
    dependencies.databaseHealthCheck.mockResolvedValue('up');
    dependencies.verifyConnection.mockResolvedValue(true);
    expect(await getHealth({ fresh: true })).toEqual({
      status: 'ok',
      services: { api: 'up', database: 'up', email: 'up' },
    });
  });

  it('retorna degraded quando apenas SMTP está indisponível', async () => {
    dependencies.databaseHealthCheck.mockResolvedValue('up');
    dependencies.verifyConnection.mockRejectedValue(new Error('smtp down'));
    expect((await getHealth({ fresh: true })).status).toBe('degraded');
  });

  it('retorna unavailable quando o banco está indisponível', async () => {
    dependencies.databaseHealthCheck.mockResolvedValue('down');
    dependencies.verifyConnection.mockResolvedValue(true);
    const health = await getHealth({ fresh: true });
    expect(health.status).toBe('unavailable');
    expect(health.services.database).toBe('down');
  });
});
