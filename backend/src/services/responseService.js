import * as responses from '../repositories/responseRepository.js';
import { hasOrganization } from '../repositories/userRepository.js';
import { record } from '../repositories/auditRepository.js';
import { serviceError } from '../utils/validation.js';
import { responsesSubmitted } from '../observability/metrics.js';
import { processLinkedAnswers } from './indicatorValueService.js';

async function assertOrganizationAccess(user, organizationId) {
  if (!organizationId) throw serviceError(422, 'Organização obrigatória', 'ORGANIZATION_REQUIRED');
  if (user.role === 'RESIDENTE' && !await hasOrganization(user.sub, organizationId)) {
    throw serviceError(403, 'Permissão insuficiente', 'FORBIDDEN');
  }
}

async function validateCollection(formId, organizationId) {
  const form = await responses.submissionContext(formId, organizationId);
  if (!form) throw serviceError(404, 'Formulário não encontrado', 'FORM_NOT_FOUND');
  if (form.status !== 'ACTIVE') throw serviceError(409, 'Esta coleta não está aberta', 'FORM_NOT_ACTIVE');
  const now = new Date();
  if (form.start_date && now < new Date(form.start_date)) throw serviceError(409, 'O período de resposta ainda não começou', 'COLLECTION_NOT_STARTED');
  if (form.end_date && now > new Date(form.end_date)) throw serviceError(409, 'O prazo desta coleta terminou', 'COLLECTION_CLOSED');
  if (!form.targeted) throw serviceError(403, 'Este formulário não foi destinado à sua organização', 'ORGANIZATION_NOT_TARGETED');
  return form;
}

async function validateAnswers(formId, answers, requireComplete) {
  if (!Array.isArray(answers)) throw serviceError(422, 'Informe as respostas', 'ANSWERS_REQUIRED');
  const questions = await responses.formQuestions(formId);
  const byId = new Map(questions.map((question) => [question.id, question]));
  const normalized = [];
  const seen = new Set();
  for (const answer of answers) {
    const question = byId.get(answer?.questionId);
    if (!question || seen.has(question.id)) throw serviceError(422, 'Uma resposta não pertence a este formulário', 'INVALID_ANSWER');
    seen.add(question.id);
    const value = String(answer.value ?? '').trim();
    if (!value) continue;
    if (question.type === 'NUMBER' && !/^-?\d+$/.test(value)) throw serviceError(422, `Resposta inválida para "${question.label}"`, 'INVALID_ANSWER');
    if (question.type === 'DECIMAL' && !Number.isFinite(Number(value.replace(',', '.')))) throw serviceError(422, `Resposta inválida para "${question.label}"`, 'INVALID_ANSWER');
    if (question.type === 'OPTION' && !question.options.includes(value)) throw serviceError(422, `Opção inválida para "${question.label}"`, 'INVALID_OPTION');
    normalized.push({ questionId: question.id, value, indicator_id: question.indicator_id || null });
  }
  if (requireComplete) {
    const answered = new Set(normalized.map((answer) => answer.questionId));
    const missing = questions.filter((question) => question.required && !answered.has(question.id));
    if (missing.length) throw serviceError(422, 'Preencha todos os campos obrigatórios', 'REQUIRED_ANSWERS_MISSING', { fields: missing.map((question) => question.id) });
  }
  return normalized;
}

async function write(formId, body, user, submit) {
  if (user.role !== 'RESIDENTE') throw serviceError(403, 'Apenas residentes preenchem respostas', 'FORBIDDEN');
  await assertOrganizationAccess(user, body.organizationId);
  const form = await validateCollection(formId, body.organizationId);
  const answers = await validateAnswers(formId, body.answers, submit);
  const result = await (submit ? responses.submit : responses.saveDraft)({
    formId,
    organizationId: body.organizationId,
    userId: user.sub,
    answers,
    processSubmission: submit ? async (responseId, client) => {
      const indicatorsUpdated = form.indicator_year
        ? await processLinkedAnswers({ responseId, organizationId: body.organizationId,
          centerId: form.innovation_center_id, year: form.indicator_year,
          month: form.indicator_month, userId: user.sub, answers }, client)
        : 0;
      await record({ userId: user.sub, action: 'RESPONSE_SUBMITTED', entity: 'response', entityId: responseId,
        details: { formId, organizationId: body.organizationId, indicatorsUpdated } }, client);
      return indicatorsUpdated;
    } : null,
  });
  if (result.conflict) throw serviceError(409, 'A resposta já foi enviada e precisa ser reaberta antes de ser alterada', 'RESPONSE_ALREADY_SUBMITTED');
  if (submit) responsesSubmitted.inc();
  if (!submit) await record({ userId: user.sub, action: 'RESPONSE_DRAFT_SAVED', entity: 'response',
    entityId: result.id, details: { formId, organizationId: body.organizationId } });
  return result;
}

export const saveDraft = (formId, body, user) => write(formId, body, user, false);
export const submit = (formId, body, user) => write(formId, body, user, true);

export async function history(organizationId, user) {
  await assertOrganizationAccess(user, organizationId);
  return responses.history(organizationId);
}

export async function get(formId, organizationId, user) {
  await assertOrganizationAccess(user, organizationId);
  const response = await responses.findByFormAndOrganization(formId, organizationId);
  if (!response) throw serviceError(404, 'Resposta não encontrada', 'RESPONSE_NOT_FOUND');
  return { ...response, answers: await responses.getAnswers(response.id) };
}

export async function reopen(responseId, user) {
  const response = await responses.reopen(responseId, user.sub);
  if (!response) throw serviceError(409, 'A resposta não está enviada ou não existe', 'RESPONSE_NOT_SUBMITTED');
  await record({ userId: user.sub, action: 'RESPONSE_REOPENED', entity: 'response', entityId: responseId });
  return response;
}
