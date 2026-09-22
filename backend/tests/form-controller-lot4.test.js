import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => Object.fromEntries([
  'listForms', 'listEligibleRecipients', 'listIndicatorDefinitions', 'getForm', 'createForm', 'saveAudience',
  'updateForm', 'publishForm', 'listRespondents', 'resendInvitation', 'closeForm', 'archiveForm',
  'duplicateForm', 'listTargets', 'getProgress', 'listQuestions', 'createQuestion', 'editQuestion',
  'deleteQuestion', 'listQuestionOptions', 'createQuestionOption',
].map((name) => [name, vi.fn()])));

vi.mock('../src/services/formService.js', () => service);

import * as controller from '../src/controllers/formController.js';

const user = { sub: 'manager-1', role: 'GESTOR' };
const baseRequest = { user, query: { organizationId: 'org-1', category: 'FINANCE' }, params: { id: 'form-1', userId: 'resident-1', questionId: 'question-1' }, body: { title: 'Pesquisa' } };

function response() {
  const res = { json: vi.fn(), status: vi.fn(), sendStatus: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const cases = [
  ['list', 'listForms', (req) => [req.user]],
  ['eligibleRecipients', 'listEligibleRecipients', (req) => [req.query]],
  ['indicatorDefinitions', 'listIndicatorDefinitions', (req) => [req.query.category]],
  ['get', 'getForm', (req) => [req.params.id, req.user]],
  ['create', 'createForm', (req) => [req.body, req.user], 201],
  ['saveAudience', 'saveAudience', (req) => [req.params.id, req.body, req.user]],
  ['update', 'updateForm', (req) => [req.params.id, req.body, req.user]],
  ['publish', 'publishForm', (req) => [req.params.id, req.body, req.user]],
  ['respondents', 'listRespondents', (req) => [req.params.id, req.user]],
  ['resend', 'resendInvitation', (req) => [req.params.id, req.params.userId, req.user]],
  ['close', 'closeForm', (req) => [req.params.id, req.user]],
  ['archive', 'archiveForm', (req) => [req.params.id, req.user]],
  ['duplicate', 'duplicateForm', (req) => [req.params.id, req.user], 201],
  ['targets', 'listTargets', (req) => [req.params.id, req.user]],
  ['progress', 'getProgress', (req) => [req.params.id]],
  ['questions', 'listQuestions', (req) => [req.params.id, req.user]],
  ['addQuestion', 'createQuestion', (req) => [req.params.id, req.body, req.user], 201],
  ['updateQuestion', 'editQuestion', (req) => [req.params.id, req.params.questionId, req.body, req.user]],
  ['questionOptions', 'listQuestionOptions', (req) => [req.params.id, req.params.questionId, req.user]],
  ['addQuestionOption', 'createQuestionOption', (req) => [req.params.id, req.params.questionId, req.body, req.user], 201],
];

beforeEach(() => vi.clearAllMocks());

describe('formController (RF-005)', () => {
  it.each(cases)('%s encaminha entrada e devolve resposta do service', async (handler, method, args, status) => {
    const result = { method };
    service[method].mockResolvedValue(result);
    const req = structuredClone(baseRequest); const res = response(); const next = vi.fn();

    await controller[handler](req, res, next);

    expect(service[method]).toHaveBeenCalledWith(...args(req));
    if (status) expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith(result);
    expect(next).not.toHaveBeenCalled();
  });

  it('remove pergunta e retorna 204 quando o service conclui', async () => {
    service.deleteQuestion.mockResolvedValue();
    const req = structuredClone(baseRequest); const res = response();

    await controller.removeQuestion(req, res, vi.fn());

    expect(service.deleteQuestion).toHaveBeenCalledWith('form-1', 'question-1', user);
    expect(res.sendStatus).toHaveBeenCalledWith(204);
  });

  it('encaminha erro do service ao middleware', async () => {
    const error = new Error('indisponivel'); service.listForms.mockRejectedValueOnce(error);
    const next = vi.fn();

    await controller.list(structuredClone(baseRequest), response(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
