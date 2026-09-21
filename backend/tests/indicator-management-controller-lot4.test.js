import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => Object.fromEntries([
  'listCenters', 'saveCenter', 'metadata', 'listCatalogDefinitions', 'createCatalogDefinition',
  'updateCatalogDefinition', 'removeCatalogDefinition', 'values', 'history', 'saveManualValue',
  'removeManualValue', 'listRecords', 'saveRecord', 'removeRecord', 'setApplicability',
].map((name) => [name, vi.fn()])));

vi.mock('../src/services/indicatorManagementService.js', () => service);

import * as controller from '../src/controllers/indicatorManagementController.js';

const user = { sub: 'editor-1', role: 'GESTOR' };
const baseRequest = { user, query: { includeInactive: 'true', centerId: 'center-1', year: '2026' }, params: { id: 'record-1', type: 'EVENT', indicatorId: 'indicator-1' }, body: { name: 'Registro' } };

function response() {
  const res = { json: vi.fn(), status: vi.fn(), sendStatus: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const cases = [
  ['centers', 'listCenters', () => [true]],
  ['createCenter', 'saveCenter', (req) => [null, req.body, req.user], 201],
  ['updateCenter', 'saveCenter', (req) => [req.params.id, req.body, req.user]],
  ['metadata', 'metadata', (req) => [req.query.centerId]],
  ['definitions', 'listCatalogDefinitions', (req) => [true, req.user]],
  ['createDefinition', 'createCatalogDefinition', (req) => [req.body, req.user], 201],
  ['updateDefinition', 'updateCatalogDefinition', (req) => [req.params.id, req.body, req.user]],
  ['values', 'values', (req) => [req.query]],
  ['history', 'history', (req) => [req.query]],
  ['saveValue', 'saveManualValue', (req) => [req.body, req.user], 200],
  ['records', 'listRecords', (req) => [{ ...req.query, type: req.params.type }]],
  ['createRecord', 'saveRecord', (req) => [null, req.params.type, req.body, req.user], 201],
  ['updateRecord', 'saveRecord', (req) => [req.params.id, req.params.type, req.body, req.user]],
  ['applicability', 'setApplicability', (req) => [{ ...req.body, indicatorId: req.params.indicatorId }, req.user]],
];

beforeEach(() => vi.clearAllMocks());

describe('indicatorManagementController (RF-007)', () => {
  it.each(cases)('%s transforma request e devolve resposta do service', async (handler, method, args, status) => {
    const result = { method };
    service[method].mockResolvedValue(result);
    const req = structuredClone(baseRequest); const res = response(); const next = vi.fn();

    await controller[handler](req, res, next);

    expect(service[method]).toHaveBeenCalledWith(...args(req));
    if (status) expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith(result);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ['removeDefinition', 'removeCatalogDefinition', ['record-1', user]],
    ['removeValue', 'removeManualValue', ['record-1', user]],
    ['removeRecord', 'removeRecord', ['record-1', 'EVENT', user]],
  ])('%s conclui exclusao com 204', async (handler, method, args) => {
    service[method].mockResolvedValue(); const res = response();

    await controller[handler](structuredClone(baseRequest), res, vi.fn());

    expect(service[method]).toHaveBeenCalledWith(...args);
    expect(res.sendStatus).toHaveBeenCalledWith(204);
  });

  it('encaminha falha do service ao middleware de erro', async () => {
    const error = new Error('acesso negado'); service.listCenters.mockRejectedValueOnce(error);
    const next = vi.fn();

    await controller.centers(structuredClone(baseRequest), response(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
