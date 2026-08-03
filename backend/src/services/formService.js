import * as repository from '../repositories/formRepository.js';
import * as organizations from '../repositories/organizationRepository.js';
import { record } from '../repositories/auditRepository.js';
import { serviceError } from '../utils/validation.js';

async function requireForm(id, user) {
  const form = await repository.findById(id, user);
  if (!form) throw serviceError(404, 'Formulário não encontrado', 'FORM_NOT_FOUND');
  return form;
}

async function requireDraft(id) {
  const form = await repository.findState(id);
  if (!form) throw serviceError(404, 'Formulário não encontrado', 'FORM_NOT_FOUND');
  if (form.status !== 'DRAFT') throw serviceError(409, 'Somente formulários em rascunho podem ser alterados', 'FORM_NOT_DRAFT');
  return form;
}

export const listForms = (user) => repository.findAll(user);
export const getForm = (id, user) => requireForm(id, user);

export async function createForm(data, user) {
  const form = await repository.create({ ...data, createdBy: user.sub });
  await record({ userId: user.sub, action: 'FORM_CREATED', entity: 'form', entityId: form.id });
  return form;
}

export async function updateForm(id, data, user) {
  await requireDraft(id);
  const form = await repository.update(id, data);
  await record({ userId: user.sub, action: 'FORM_UPDATED', entity: 'form', entityId: id });
  return form;
}

export async function publishForm(id, body, user) {
  const form = await requireDraft(id);
  const questions = await repository.questions(id);
  if (!questions.length) throw serviceError(422, 'Inclua ao menos uma pergunta antes de publicar', 'FORM_WITHOUT_QUESTIONS');
  if (!form.start_date || !form.end_date) throw serviceError(422, 'Defina o período da coleta', 'FORM_PERIOD_REQUIRED');
  const organizationIds = Array.isArray(body.organizationIds) ? [...new Set(body.organizationIds)] : [];
  for (const organizationId of organizationIds) {
    if (!await organizations.existsActive(organizationId)) {
      throw serviceError(422, 'Uma organização destinatária é inválida', 'INVALID_ORGANIZATION');
    }
  }
  const published = await repository.publish(id, organizationIds);
  if (!published) throw serviceError(409, 'O formulário não está mais em rascunho', 'FORM_NOT_DRAFT');
  await record({
    userId: user.sub,
    action: 'FORM_PUBLISHED',
    entity: 'form',
    entityId: id,
    details: { targetedOrganizations: organizationIds.length || 'ALL' },
  });
  return published;
}

export async function closeForm(id, user) {
  const form = await repository.findState(id);
  if (!form) throw serviceError(404, 'Formulário não encontrado', 'FORM_NOT_FOUND');
  if (form.status !== 'ACTIVE') throw serviceError(409, 'Apenas coletas ativas podem ser encerradas', 'FORM_NOT_ACTIVE');
  const closed = await repository.setStatus(id, 'ACTIVE', 'CLOSED');
  await record({ userId: user.sub, action: 'FORM_CLOSED', entity: 'form', entityId: id });
  return closed;
}

export async function archiveForm(id, user) {
  const form = await repository.findState(id);
  if (!form) throw serviceError(404, 'Formulário não encontrado', 'FORM_NOT_FOUND');
  if (form.status === 'ARCHIVED') throw serviceError(409, 'Formulário já arquivado', 'FORM_ALREADY_ARCHIVED');
  const archived = await repository.setStatus(id, form.status, 'ARCHIVED');
  await record({ userId: user.sub, action: 'FORM_ARCHIVED', entity: 'form', entityId: id });
  return archived;
}

export async function duplicateForm(id, user) {
  const duplicate = await repository.duplicate(id, user.sub);
  if (!duplicate) throw serviceError(404, 'Formulário não encontrado', 'FORM_NOT_FOUND');
  await record({ userId: user.sub, action: 'FORM_DUPLICATED', entity: 'form', entityId: duplicate.id, details: { sourceId: id } });
  return duplicate;
}

export async function listTargets(id, user) {
  await requireForm(id, user);
  return repository.targets(id);
}

export async function getProgress(id) {
  const progress = await repository.progress(id);
  if (!progress) throw serviceError(404, 'Formulário não encontrado', 'FORM_NOT_FOUND');
  return { ...progress, percentage: progress.recipients ? Math.round((progress.submitted / progress.recipients) * 100) : 0 };
}

export async function listQuestions(id, user) {
  await requireForm(id, user);
  return repository.questions(id);
}

export async function listQuestionOptions(formId, questionId, user) {
  await requireForm(formId, user);
  return repository.questionOptions(formId, questionId);
}

export async function createQuestion(formId, data, user) {
  await requireDraft(formId);
  const question = await repository.addQuestion(formId, data);
  if (!question) throw serviceError(409, 'Não foi possível alterar este formulário', 'FORM_NOT_DRAFT');
  await record({ userId: user.sub, action: 'FORM_QUESTION_CREATED', entity: 'form', entityId: formId });
  return question;
}

export async function editQuestion(formId, questionId, data, user) {
  await requireDraft(formId);
  const question = await repository.updateQuestion(formId, questionId, data);
  if (!question) throw serviceError(404, 'Pergunta não encontrada', 'QUESTION_NOT_FOUND');
  await record({ userId: user.sub, action: 'FORM_QUESTION_UPDATED', entity: 'form', entityId: formId });
  return question;
}

export async function deleteQuestion(formId, questionId, user) {
  await requireDraft(formId);
  if (!await repository.removeQuestion(formId, questionId)) throw serviceError(404, 'Pergunta não encontrada', 'QUESTION_NOT_FOUND');
  await record({ userId: user.sub, action: 'FORM_QUESTION_REMOVED', entity: 'form', entityId: formId });
}

export async function createQuestionOption(formId, questionId, body, user) {
  await requireDraft(formId);
  const value = typeof body === 'string' ? body : body?.value;
  if (!value?.trim()) throw serviceError(422, 'Informe a opção', 'OPTION_REQUIRED');
  const option = await repository.addQuestionOption(formId, questionId, value.trim());
  if (!option) throw serviceError(422, 'A opção só pode ser adicionada a uma pergunta de escolha', 'INVALID_OPTION_QUESTION');
  await record({ userId: user.sub, action: 'FORM_OPTION_CREATED', entity: 'form', entityId: formId });
  return option;
}
