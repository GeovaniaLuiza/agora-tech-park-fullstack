import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_IMPORT_BYTES, XLSX_MIME } from '../src/domain/indicatorImportCatalog.js';

const mocks = vi.hoisted(() => ({
  findCenter: vi.fn(), findPrevious: vi.fn(), createBatch: vi.fn(),
  parseEvents: vi.fn(), parseResidents: vi.fn(),
}));
vi.mock('../src/middlewares/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { sub: 'admin-1', role: 'ADMIN' }; next(); },
  authorize: () => (_req, _res, next) => next(),
}));
vi.mock('../src/repositories/indicatorImportRepository.js', () => ({
  findCenter: mocks.findCenter, findPrevious: mocks.findPrevious, createBatch: mocks.createBatch,
}));
vi.mock('../src/repositories/auditRepository.js', () => ({ record: vi.fn() }));
vi.mock('../src/services/indicatorCalculationService.js', () => ({ recompute: vi.fn() }));
vi.mock('../src/services/eventImportParser.js', () => ({ parseEventWorkbook: mocks.parseEvents }));
vi.mock('../src/services/residentImportParser.js', () => ({ parseResidentWorkbook: mocks.parseResidents }));

import router from '../src/routes/indicatorImportRoutes.js';
import { errorHandler } from '../src/middlewares/errorHandler.js';
import { preview } from '../src/services/indicatorImportService.js';

const app = express();
// Preserve the global JSON limit to verify that XLSX bodies use the route's raw parser.
app.use(express.json({ limit: '100kb' }));
app.use('/api/indicator-imports', router);
app.use(errorHandler);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findCenter.mockResolvedValue({ id: 'center-1', name: 'Centro' });
  mocks.findPrevious.mockResolvedValue(null);
  const parsed = { errors: [], warnings: [], items: [], summary: { records: 0 }, year: 2026 };
  mocks.parseEvents.mockResolvedValue({ ...parsed, sheetName: 'Eventos' });
  mocks.parseResidents.mockResolvedValue({ ...parsed, sheetName: 'Clientes' });
  mocks.createBatch.mockImplementation(async (data) => ({
    id: 'batch-1', import_type: data.importType, file_size: data.fileSize,
    sheet_name: data.sheetName, summary: data.summary, draft: data.draft,
  }));
});

describe.each(['EVENTS', 'RESIDENTS'])('limite de upload de %s', (type) => {
  it.each([15_759, MAX_IMPORT_BYTES - 1, MAX_IMPORT_BYTES])('aceita %i bytes via middleware e serviço', async (size) => {
    expect(MAX_IMPORT_BYTES).toBe(50 * 1024 * 1024);
    const buffer = Buffer.alloc(size);
    buffer.set([0x50, 0x4b, 0x03, 0x04]);
    const response = await request(app).post(`/api/indicator-imports/${type}/preview`)
      .query({ fileName: 'planilha.xlsx', centerId: 'center-1' }).set('Content-Type', XLSX_MIME).send(buffer);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ importType: type, fileSize: size });
    expect(type === 'EVENTS' ? mocks.parseEvents : mocks.parseResidents).toHaveBeenCalledOnce();
  }, 15000);

  it('rejeita 50 MB + 1 byte no middleware com a mensagem correta', async () => {
    const response = await request(app).post(`/api/indicator-imports/${type}/preview`)
      .set('Content-Type', XLSX_MIME).send(Buffer.alloc(MAX_IMPORT_BYTES + 1));
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ code: 'PAYLOAD_TOO_LARGE', message: 'A planilha excede o limite de 50 MB.' });
    expect(mocks.findCenter).not.toHaveBeenCalled();
    expect(mocks.parseEvents).not.toHaveBeenCalled();
    expect(mocks.parseResidents).not.toHaveBeenCalled();
  }, 15000);

  it('também rejeita 50 MB + 1 byte na validação direta do serviço', async () => {
    await expect(preview({ type, fileName: 'planilha.xlsx', mimeType: XLSX_MIME,
      buffer: Buffer.alloc(MAX_IMPORT_BYTES + 1) }, { sub: 'admin-1', role: 'ADMIN' }))
      .rejects.toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'A planilha excede o limite de 50 MB.' });
  });
});

it('publica o mesmo limite de 50 MB nas opções para o frontend', async () => {
  const response = await request(app).get('/api/indicator-imports/options');
  expect(response.status).toBe(200);
  expect(response.body.maxBytes).toBe(50 * 1024 * 1024);
});
