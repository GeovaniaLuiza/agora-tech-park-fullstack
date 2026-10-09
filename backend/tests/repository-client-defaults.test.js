import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ pool: { query: vi.fn() }, query: vi.fn() }));
vi.mock('../src/db/pool.js', () => database);

import { markImported } from '../src/repositories/indicatorImportRepository.js';
import * as management from '../src/repositories/indicatorManagementRepository.js';
import { summary } from '../src/repositories/indicatorRepository.js';

const cases = [
  ['markImported', (client) => markImported('batch-1', {
    imported: 2, ignored: 1, summary: { records: 3 }, userId: 'admin-1',
  }, client)],
  ['summary', (client) => summary({ year: 2026, centerId: 'center-1' }, client)],
  ['findCenter', (client) => management.findCenter('center-1', client)],
  ['listDefinitions', (client) => management.listDefinitions('center-1', client)],
  ['recordsForCalculation', (client) => management.recordsForCalculation('center-1', 2026, client)],
  ['manualValuesForCalculation', (client) => management.manualValuesForCalculation('center-1', 2026, client)],
  ['allDefinitions', (client) => management.allDefinitions(client)],
];

beforeEach(() => {
  vi.resetAllMocks();
  database.pool.query.mockResolvedValue({ rows: [{ id: 'result-1' }] });
});

describe.each(cases)('%s query client', (_name, invoke) => {
  it('uses the pool when the client is undefined', async () => {
    await invoke(undefined);
    expect(database.pool.query).toHaveBeenCalledOnce();
    expect(database.pool.query.mock.contexts[0]).toBe(database.pool);
  });

  it('preserves the supplied transaction and its query receiver', async () => {
    const client = {
      rows: [{ id: 'transaction-result' }],
      query: vi.fn(function () { return Promise.resolve({ rows: this.rows }); }),
    };
    await invoke(client);
    expect(client.query).toHaveBeenCalledOnce();
    expect(client.query.mock.contexts[0]).toBe(client);
    expect(database.pool.query).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
  });
});

it('uses the pool when the client is omitted', async () => {
  expect(await management.allDefinitions()).toEqual([{ id: 'result-1' }]);
  expect(database.pool.query).toHaveBeenCalledOnce();
});

it('propagates a transaction query failure without retrying through the pool', async () => {
  const error = new Error('transaction failed');
  const client = { query: vi.fn().mockRejectedValue(error) };
  await expect(management.allDefinitions(client)).rejects.toBe(error);
  expect(database.pool.query).not.toHaveBeenCalled();
});

it('does not replace an invalid supplied client with the pool', async () => {
  await expect(management.allDefinitions({})).rejects.toBeInstanceOf(TypeError);
  await expect(management.allDefinitions(null)).rejects.toBeInstanceOf(TypeError);
  expect(database.pool.query).not.toHaveBeenCalled();
});
