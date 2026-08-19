import * as repository from '../repositories/formRepository.js';
import * as organizations from '../repositories/organizationRepository.js';
import * as users from '../repositories/userRepository.js';
import * as notifications from '../repositories/notificationRepository.js';
import { record } from '../repositories/auditRepository.js';
import { sendFormInvitation } from './emailService.js';
import { serviceError } from '../utils/validation.js';
import { emailFailures, formsCreated, formsPublished } from '../observability/metrics.js';

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

function validatedFormData(data) {
  const fields = [data.innovationCenterId, data.indicatorYear, data.indicatorMonth];
  const informed = fields.filter((value) => value !== undefined && value !== null && value !== '').length;
  if (informed && informed !== fields.length) {
    throw serviceError(422, 'Para coletar indicadores, informe o Centro de Inovação, o ano e o mês de referência.', 'INVALID_INDICATOR_PERIOD');
  }
  if (!informed) return { ...data, innovationCenterId: null, indicatorYear: null, indicatorMonth: null };
  const year = Number(data.indicatorYear); const month = Number(data.indicatorMonth);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw serviceError(422, 'Período de referência inválido', 'INVALID_INDICATOR_PERIOD');
  }
  return { ...data, indicatorYear: year, indicatorMonth: month };
}

export const listForms = (user) => repository.findAll(user);
export const getForm = (id, user) => requireForm(id, user);
export const listIndicatorDefinitions = (category) => repository.indicatorDefinitions(category || null);

async function prepareIndicatorQuestion(data, formId, questionId = null) {
  if (!data.indicatorId) return data;
  const definition = await repository.findDefinitionById(data.indicatorId);
  if (!definition?.active || definition.calculation_type !== 'MANUAL') {
    throw serviceError(422, 'Indicador inexistente, inativo ou não coletável', 'INVALID_INDICATOR');
  }
  if (await repository.indicatorAlreadyLinked(formId, data.indicatorId, questionId)) {
    throw serviceError(409, 'Este indicador já está vinculado ao formulário', 'INDICATOR_ALREADY_LINKED');
  }
  const type = definition.value_type === 'INTEGER' ? 'NUMBER'
    : ['NUMBER', 'DECIMAL', 'CURRENCY', 'PERCENT', 'PERCENTAGE'].includes(definition.value_type) ? 'DECIMAL' : 'TEXT';
  return { ...data, label: definition.name, type };
}

export async function listEligibleRecipients(query = {}) {
  const raw = Array.isArray(query.organizationId) ? query.organizationId : String(query.organizationId || '').split(',');
  const organizationIds = raw.map((value) => value.trim()).filter(Boolean);
  return users.findEligibleFormRecipients({ organizationIds });
}

export async function createForm(data, user) {
  const form = await repository.create({ ...validatedFormData(data), createdBy: user.sub });
  await record({ userId: user.sub, action: 'FORM_CREATED', entity: 'form', entityId: form.id });
  formsCreated.inc();
  return form;
}

export async function updateForm(id, data, user) {
  await requireDraft(id);
  const form = await repository.update(id, validatedFormData(data));
  await record({ userId: user.sub, action: 'FORM_UPDATED', entity: 'form', entityId: id });
  return form;
}

export async function saveAudience(id, body, user) {
  await requireDraft(id);
  const organizationIds = Array.isArray(body.organizationIds) ? body.organizationIds.filter(Boolean) : [];
  const recipientIds = Array.isArray(body.recipientIds) ? body.recipientIds.filter(Boolean) : [];
  if (new Set(organizationIds).size !== organizationIds.length || new Set(recipientIds).size !== recipientIds.length) {
    throw serviceError(422, 'Organizações e respondentes não podem ser duplicados', 'DUPLICATE_FORM_RECIPIENT');
  }
  for (const organizationId of organizationIds) {
    if (!await organizations.existsActive(organizationId)) throw serviceError(422, 'Uma organização destinatária é inválida', 'INVALID_ORGANIZATION');
  }
  const eligible = recipientIds.length ? await users.findEligibleFormRecipients({ organizationIds, userIds: recipientIds }) : [];
  if (eligible.length !== recipientIds.length) throw serviceError(422, 'Um destinatário não é elegível', 'INELIGIBLE_RESIDENT_RECIPIENT');
  const effectiveOrganizationIds = organizationIds.length ? organizationIds : [...new Set(eligible.flatMap((recipient) => recipient.organizations.map((organization) => organization.id)))];
  const respondents = eligible.map((recipient) => {
    const organization = recipient.organizations.find(({ id: organizationId }) => effectiveOrganizationIds.includes(organizationId));
    return { ...recipient, organizationId: organization.id };
  });
  if (!await repository.saveAudience(id, effectiveOrganizationIds, respondents)) throw serviceError(409, 'Somente formulários em rascunho podem ser alterados', 'FORM_NOT_DRAFT');
  await record({ userId: user.sub, action: 'FORM_RESPONDENT_ASSIGNED', entity: 'form', entityId: id, details: { respondents: recipientIds.length } });
  return { organizationIds: effectiveOrganizationIds, respondentIds: recipientIds };
}

export async function publishForm(id, body, user) {
  const form = await requireDraft(id);
  const questions = await repository.questions(id);
  if (!questions.length) throw serviceError(422, 'Inclua ao menos uma pergunta antes de publicar', 'FORM_WITHOUT_QUESTIONS');
  if (!form.start_date || !form.end_date) throw serviceError(422, 'Defina o período da coleta', 'FORM_PERIOD_REQUIRED');
  if (questions.some((question) => question.indicator_id)
      && (!form.innovation_center_id || !form.indicator_year || !form.indicator_month)) {
    throw serviceError(422, 'Para publicar indicadores, informe o Centro de Inovação, o ano e o mês de referência.', 'INDICATOR_PERIOD_REQUIRED');
  }
  const organizationIds = Array.isArray(body.organizationIds) ? body.organizationIds.filter(Boolean) : [];
  const recipientIds = Array.isArray(body.recipientIds) ? body.recipientIds.filter(Boolean) : [];
  if (new Set(organizationIds).size !== organizationIds.length || new Set(recipientIds).size !== recipientIds.length) {
    throw serviceError(422, 'Organizações e respondentes não podem ser duplicados', 'DUPLICATE_FORM_RECIPIENT');
  }
  if (!recipientIds.length) throw serviceError(422, 'Selecione ao menos um residente do Ágora Tech Park', 'RESIDENT_RECIPIENT_REQUIRED');
  if (recipientIds.length > 100 || recipientIds.some((id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
    throw serviceError(422, 'Lista de residentes destinatários inválida', 'INVALID_RESIDENT_RECIPIENTS');
  }
  for (const organizationId of organizationIds) {
    if (!await organizations.existsActive(organizationId)) {
      throw serviceError(422, 'Uma organização destinatária é inválida', 'INVALID_ORGANIZATION');
    }
  }
  const registeredRecipients = await users.findEligibleFormRecipients({ organizationIds, userIds: recipientIds });
  if (registeredRecipients.length !== recipientIds.length) {
    throw serviceError(422, 'Um destinatário não é residente ativo ou não possui vínculo válido com a organização selecionada', 'INELIGIBLE_RESIDENT_RECIPIENT');
  }
  const effectiveOrganizationIds = organizationIds.length ? organizationIds : [...new Set(registeredRecipients.flatMap((recipient) => recipient.organizations.map((organization) => organization.id)))];
  const respondents = registeredRecipients.map((recipient) => {
    const organization = recipient.organizations.find(({ id: organizationId }) => effectiveOrganizationIds.includes(organizationId));
    if (!organization) throw serviceError(422, 'Cada respondente deve estar vinculado a uma organização destinatária ativa', 'RESPONDENT_ORGANIZATION_REQUIRED');
    return { ...recipient, organizationId: organization.id, organizationName: organization.name };
  });
  const published = await repository.publish(id, effectiveOrganizationIds, respondents);
  if (!published) throw serviceError(409, 'O formulário não está mais em rascunho', 'FORM_NOT_DRAFT');
  let inAppNotifications = 0;
  try {
    const createdNotifications = await notifications.createMany(
      respondents.map((recipient) => recipient.id),
      { title: 'Novo formulário disponível', message: published.title, link: `/resident/forms/${id}/respond` },
    );
    inAppNotifications = createdNotifications.length;
  } catch { /* a publicação e os e-mails não devem ser desfeitos por falha no canal interno */ }
  const emailSummary = await deliverInvitations(published, respondents, user, 'FORM_EMAIL_SENT');
  await record({
    userId: user.sub,
    action: 'FORM_PUBLISHED',
    entity: 'form',
    entityId: id,
    details: { targetedOrganizations: effectiveOrganizationIds.length, residentRecipients: recipientIds.length, emailSummary },
  });
  formsPublished.inc();
  return { ...published, notificationSummary: { inApp: inAppNotifications, ...emailSummary } };
}

async function deliverInvitations(form, respondents, actor, successAction) {
  const deadline = form.end_date ? new Date(form.end_date).toLocaleDateString('pt-BR') : null;
  const deliveries = await Promise.allSettled(respondents.map((respondent) => sendFormInvitation({
    ...respondent, formId: form.id, formTitle: form.title, deadline,
  })));
  const result = { requested: respondents.length, sent: 0, failed: 0 };
  await Promise.all(deliveries.map(async (delivery, index) => {
    const respondent = respondents[index];
    if (delivery.status === 'fulfilled') {
      result.sent += 1;
      await repository.recordDelivery(form.id, respondent.id, { status: 'SENT' });
      await record({ userId: actor.sub, action: successAction, entity: 'form', entityId: form.id, details: { respondentId: respondent.id } });
    } else {
      result.failed += 1;
      emailFailures.inc({ purpose: 'FORM_INVITATION', reason: 'delivery_failed' });
      await repository.recordDelivery(form.id, respondent.id, { status: 'FAILED', error: String(delivery.reason?.message || 'Falha SMTP').slice(0, 1000) });
      await record({ userId: actor.sub, action: 'FORM_EMAIL_FAILED', entity: 'form', entityId: form.id, details: { respondentId: respondent.id } });
    }
  }));
  return result;
}

export async function listRespondents(id, user) {
  await requireForm(id, user);
  return repository.respondents(id);
}

export async function resendInvitation(id, userId, user) {
  const form = await requireForm(id, user);
  if (form.status !== 'ACTIVE') throw serviceError(409, 'O formulário ainda não foi publicado', 'FORM_NOT_ACTIVE');
  const respondent = await repository.respondent(id, userId);
  if (!respondent) throw serviceError(404, 'Respondente não encontrado', 'FORM_RESPONDENT_NOT_FOUND');
  return { respondentId: userId, ...await deliverInvitations(form, [{ ...respondent, organizationName: respondent.organization_name }], user, 'FORM_EMAIL_RESENT') };
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
  const question = await repository.addQuestion(formId, await prepareIndicatorQuestion(data, formId));
  if (!question) throw serviceError(409, 'Não foi possível alterar este formulário', 'FORM_NOT_DRAFT');
  await record({ userId: user.sub, action: 'FORM_QUESTION_CREATED', entity: 'form', entityId: formId });
  return question;
}

export async function editQuestion(formId, questionId, data, user) {
  await requireDraft(formId);
  const question = await repository.updateQuestion(formId, questionId, await prepareIndicatorQuestion(data, formId, questionId));
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
