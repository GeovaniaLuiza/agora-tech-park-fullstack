import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_HEADERS, MAX_IMPORT_BYTES, MAX_IMPORT_REVIEW_BYTES, RESIDENT_HEADERS, XLSX_MIME } from '../src/domain/indicatorImportCatalog.js';

const mocks = vi.hoisted(() => ({
  findCenter: vi.fn(), findPrevious: vi.fn(), createBatch: vi.fn(),
  findBatch: vi.fn(), latestDraft: vi.fn(), saveDraft: vi.fn(),
  authenticate: vi.fn(),
}));
vi.mock('../src/middlewares/auth.js', () => ({
  authenticate: mocks.authenticate,
  authorize: (...roles) => (req, res, next) => roles.includes(req.user?.role) ? next() : res.sendStatus(403),
}));
vi.mock('../src/repositories/indicatorImportRepository.js', async (importOriginal) => ({
  ...await importOriginal(), ...mocks,
}));
vi.mock('../src/repositories/auditRepository.js', () => ({ record: vi.fn() }));
import app from '../src/app.js';

let stored;
beforeEach(() => {
  vi.clearAllMocks();
  stored = undefined;
  mocks.authenticate.mockImplementation((req, _res, next) => {
    expect(req.body).toBeUndefined();
    req.user = { sub: 'admin-1', role: 'ADMIN' }; next();
  });
  mocks.findCenter.mockResolvedValue({ id: 'center-1', name: 'Centro' });
  mocks.findPrevious.mockResolvedValue(null);
  mocks.createBatch.mockImplementation(async (data) => {
    stored = { id: 'batch-1', import_type: data.importType, file_name: data.fileName,
      file_size: data.fileSize, sheet_name: data.sheetName, year: data.year,
      status: data.status, draft: data.draft, summary: data.summary, warnings: data.warnings };
    return stored;
  });
  mocks.findBatch.mockImplementation(async () => stored);
  mocks.latestDraft.mockImplementation(async () => stored);
  mocks.saveDraft.mockImplementation(async (_id, data) => {
    stored = { ...stored, ...data };
    return stored;
  });
});

describe('escopo e autenticação do parser de revisão', () => {
  it('mantém os limites de JSON e XLSX como constantes independentes', () => {
    expect(MAX_IMPORT_BYTES).toBe(209_715_200);
    expect(MAX_IMPORT_REVIEW_BYTES).toBe(209_715_200);
  });

  it.each([
    ['POST', '/api/auth/login'],
    ['PUT', '/api/indicator-management/records/example'],
    ['POST', '/api/indicator-imports/batches/batch-1/review'],
    ['PUT', '/api/indicator-imports/batches/batch-1/group-events'],
    ['POST', '/api/indicator-imports/export'],
    ['POST', '/api/indicator-imports/EVENTS/preview'],
    ['POST', '/api/indicator-imports/RESIDENTS/preview'],
  ])('preserva 102400 bytes para %s %s', async (method, path) => {
    const response = await request(app)[method.toLowerCase()](path).send({ text: 'x'.repeat(102_400) });
    expect(response.status).toBe(413);
    expect(response.body.message).not.toMatch(/planilha|imagem/);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it.each([401, 403])('rejeita revisão com HTTP %i antes de interpretar o JSON', async (status) => {
    mocks.authenticate.mockImplementation((req, res, next) => {
      expect(req.body).toBeUndefined();
      if (status === 401) return res.sendStatus(401);
      req.user = { sub: 'resident-1', role: 'RESIDENT' }; next();
    });
    const response = await request(app).put('/api/indicator-imports/batches/batch-1/review')
      .set('Content-Type', 'application/json').send('{invalid json');
    expect(response.status).toBe(status);
    expect(mocks.findBatch).not.toHaveBeenCalled();
  });
});

async function smallWorkbook(type) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(type === 'EVENTS' ? 'Eventos' : 'Clientes');
  if (type === 'RESIDENTS') sheet.addRow([]);
  sheet.addRow(type === 'EVENTS' ? EVENT_HEADERS : RESIDENT_HEADERS);
  for (let index = 0; index < 235; index += 1) {
    // Repeated text compresses well in XLSX but expands in the review JSON.
    sheet.addRow(type === 'EVENTS'
      ? [`Evento ${index < 43 ? 'duplicado' : index}`, '15/03/2026 09:00:00', 'Auditório', 'Tema '.repeat(100), 'Presencial', 'Workshop', 20, 3]
      : ['Locada', 'Locador', 'HUB', `HUB ${index}`, 50, 'Empresa', '04.252.011/0001-10', '01/01/2026', '', 'Tecnologia '.repeat(50), 'Brasileira']);
  }
  const zipped = Buffer.from(await workbook.xlsx.writeBuffer());
  expect(zipped.length).toBeLessThanOrEqual(15_759);
  // ZIP readers accept trailing padding; retain the exact reported 15.4 KB size.
  return Buffer.concat([zipped, Buffer.alloc(15_759 - zipped.length)]);
}

describe.each(['EVENTS', 'RESIDENTS'])('revisão HTTP de XLSX pequeno em %s', (type) => {
  it('processa 15759 bytes, salva JSON maior que 100 KB e recarrega sem erro antigo', async () => {
    stored = { import_type: type, status: 'VALIDATED', draft: {
      items: [], error: 'A planilha excede o limite de 200 MB.',
      importError: 'A planilha excede o limite de 200 MB.', validationError: 'A planilha excede o limite de 200 MB.',
    } };
    const oldDraft = await request(app).get(`/api/indicator-imports/${type}/draft?centerId=center-1`);
    expect(oldDraft.body.draft.error).toContain('200 MB');
    const response = await request(app).post(`/api/indicator-imports/${type}/preview`)
      .query({ fileName: type === 'EVENTS' ? 'Eventos.xlsx' : 'Clientes.xlsx', centerId: 'center-1' })
      .set('Content-Type', XLSX_MIME).send(await smallWorkbook(type));
    expect(response.status).toBe(201);
    expect(response.body.fileSize).toBe(15_759);
    expect(response.body.summary.rowsRead).toBe(235);
    if (type === 'EVENTS') expect(response.body.summary).toMatchObject({ records: 235, valid: 192, warnings: 43, needsReview: 0 });
    const items = response.body.draft.items.map((item) => ({ ...item, included: true }));
    expect(Buffer.byteLength(JSON.stringify({ items }))).toBeGreaterThan(102_400);
    const saved = await request(app).put('/api/indicator-imports/batches/batch-1/review').send({ items });
    expect(saved.status).toBe(200);
    expect(mocks.saveDraft).toHaveBeenCalledOnce();
    const reloaded = await request(app).get(`/api/indicator-imports/${type}/draft?centerId=center-1`);
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.draft.items).toEqual(saved.body.draft.items);
    expect(JSON.stringify(reloaded.body)).not.toContain('A planilha excede');
    expect(stored.draft).not.toHaveProperty('error');
    expect(stored.draft).not.toHaveProperty('importError');
    expect(stored.draft).not.toHaveProperty('validationError');
  });

  it('mantém 100 KB nas outras operações e não apresenta erro de tamanho do arquivo', async () => {
    const response = await request(app).post('/api/indicator-imports/batches/batch-1/confirm')
      .send({ unexpected: 'x'.repeat(102_400) });
    expect(response.status).toBe(413);
    expect(response.body.code).toBe('IMPORT_REQUEST_TOO_LARGE');
    expect(response.body.message).not.toContain('A planilha excede');
    expect(mocks.findBatch).not.toHaveBeenCalled();
  });
});
