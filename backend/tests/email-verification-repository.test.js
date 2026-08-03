import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));

vi.mock('../src/db/pool.js', () => database);

import {
  issue,
  markDelivered,
  markDeliveryFailed,
  verify,
} from '../src/repositories/emailVerificationRepository.js';

beforeEach(() => {
  vi.clearAllMocks();
  database.query.mockImplementation(async (sql) => {
    if (sql.includes('INSERT INTO email_verification_tokens')) return { rows: [{ id: 'prepared-token-id' }] };
    return { rows: [], rowCount: 1 };
  });
});

describe('repositório de tokens de confirmação', () => {
  it('armazena somente hash SHA-256 e prepara o token sem invalidar o anterior', async () => {
    const issued = await issue('11111111-1111-1111-1111-111111111111');
    const insertion = database.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO email_verification_tokens'));
    const prematureInvalidation = database.query.mock.calls.find(([sql]) =>
      sql.includes("delivery_status='DELIVERED'") && sql.startsWith('UPDATE'));
    const storedHash = insertion[1][1];

    expect(issued).toMatchObject({ tokenId: 'prepared-token-id' });
    expect(issued.rawToken).toHaveLength(43);
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedHash).not.toBe(issued.rawToken);
    expect(insertion[0]).toContain("'PENDING'");
    expect(prematureInvalidation).toBeUndefined();
  });

  it('respeita o intervalo mínimo sem emitir outro token', async () => {
    const client = { query: vi.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-id' }] })
      .mockResolvedValueOnce({ rows: [{ created_at: new Date().toISOString() }] });

    const issued = await issue('11111111-1111-1111-1111-111111111111', client, { minimumMinutes: 5 });

    expect(issued.tooSoon).toBe(true);
    expect(issued.retryAfterSeconds).toBeGreaterThan(0);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('limita tentativas por usuário na janela de uma hora', async () => {
    const client = { query: vi.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-id' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: 5, oldest_created_at: new Date().toISOString() }] });

    const issued = await issue('11111111-1111-1111-1111-111111111111', client, { maxPerHour: 5 });

    expect(issued.rateLimited).toBe(true);
    expect(issued.retryAfterSeconds).toBeGreaterThan(0);
    expect(client.query).toHaveBeenCalledTimes(3);
  });

  it('ao confirmar entrega invalida o link anterior e ativa o novo na mesma transação', async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    database.pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{
        id: 'prepared-token-id',
        user_id: 'user-id',
        purpose: 'EMAIL_VERIFICATION',
        delivery_status: 'PENDING',
      }] })
      .mockResolvedValue({ rows: [] });

    expect(await markDelivered('prepared-token-id')).toBe(true);
    const sql = client.query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain("delivery_status='DELIVERED'");
    expect(sql).toContain('id<>$3');
    expect(sql).toContain('COMMIT');
  });

  it('falha de entrega invalida somente o token preparado', async () => {
    await markDeliveryFailed('prepared-token-id');
    const [sql, params] = database.query.mock.calls[0];

    expect(sql).toContain("delivery_status='FAILED'");
    expect(sql).toContain('WHERE id=$1');
    expect(params).toEqual(['prepared-token-id']);
  });

  it('consome somente token entregue e move EMAIL_PENDING para PENDING na mesma transação', async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    database.pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{
        id: 'token-id',
        user_id: 'user-id',
        purpose: 'EMAIL_VERIFICATION',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        used_at: null,
        name: 'Pessoa',
        email: 'pessoa@test.com',
        status: 'EMAIL_PENDING',
      }] })
      .mockResolvedValue({ rows: [] });

    const result = await verify('raw-token-with-more-than-thirty-two-characters', (transaction) => transaction.query('AUDIT'));

    expect(result.state).toBe('VERIFIED');
    expect(client.query.mock.calls[1][0]).toContain("delivery_status='DELIVERED'");
    expect(client.query.mock.calls.some(([sql]) => sql.includes("status='PENDING'"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
  });
});
