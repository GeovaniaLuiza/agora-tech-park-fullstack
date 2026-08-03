import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  query: vi.fn(),
  pool: { connect: vi.fn() },
}));

vi.mock('../src/db/pool.js', () => database);

import { issue } from '../src/repositories/emailVerificationRepository.js';

describe('email verification delivery recovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retires a stale pending delivery before issuing a replacement token', async () => {
    const client = { query: vi.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'user-id' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'stale-token-id', created_at: new Date(Date.now() - 31_000).toISOString() }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'fresh-token-id' }] });

    const issued = await issue('11111111-1111-1111-1111-111111111111', client);

    expect(issued).toMatchObject({ tokenId: 'fresh-token-id' });
    expect(client.query.mock.calls[3][0]).toContain("delivery_status='FAILED'");
    expect(client.query.mock.calls[4][0]).toContain('INSERT INTO email_verification_tokens');
    expect(issued.rawToken).toHaveLength(43);
  });
});
