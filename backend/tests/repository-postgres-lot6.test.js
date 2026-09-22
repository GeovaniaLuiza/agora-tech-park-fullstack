import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

dotenv.config();

const { pool, shutdown } = await import('../src/db/pool.js');
const indicators = await import('../src/repositories/indicatorManagementRepository.js');
const forms = await import('../src/repositories/formRepository.js');
const access = await import('../src/repositories/accessRepository.js');
const organizations = await import('../src/repositories/organizationRepository.js');

const schema = `lot6_${randomUUID().replaceAll('-', '')}`;
const adminId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const secondAdminId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const residentId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const organizationId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const secondOrganizationId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const tableNames = [
  'users', 'organizations', 'users_organizations', 'innovation_centers', 'indicator_definitions',
  'indicator_applicability', 'indicator_values', 'indicator_records', 'forms', 'form_organizations',
  'form_respondents', 'questions', 'question_options', 'question_indicator_links', 'responses', 'answers',
  'audit_logs',
];

let setup;
let querySpy;
let connectSpy;
let connect;

const insertBaseData = async () => {
  await setup.query(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at)
    VALUES($1,'Admin A','admin-a@lot6.invalid','hash','ADMIN','ACTIVE',NOW()),
          ($2,'Admin B','admin-b@lot6.invalid','hash','ADMIN','ACTIVE',NOW()),
          ($3,'Residente','resident@lot6.invalid','hash','RESIDENTE','ACTIVE',NOW())`,
  [adminId, secondAdminId, residentId]);
  await setup.query(`INSERT INTO organizations(id,name,cnpj,status)
    VALUES($1,'Organizacao Alfa','11111111111111','ACTIVE'),
          ($2,'Organizacao Beta','22222222222222','ACTIVE')`,
  [organizationId, secondOrganizationId]);
  await setup.query('INSERT INTO users_organizations(user_id,organization_id) VALUES($1,$2)', [residentId, organizationId]);
};

beforeAll(async () => {
  setup = await pool.connect();
  await setup.query(`CREATE SCHEMA ${schema}`);
  await setup.query(`SET search_path TO ${schema}, public`);
  for (const table of tableNames) {
    await setup.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  }
  const foreignKeys = await setup.query(`SELECT c.conname,t.relname
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname=$1 AND c.contype='f'`, [schema]);
  for (const { conname, relname } of foreignKeys.rows) {
    await setup.query(`ALTER TABLE ${relname} DROP CONSTRAINT ${conname}`);
  }
  connect = pool.connect.bind(pool);
});

beforeEach(async () => {
  querySpy = vi.spyOn(pool, 'query').mockImplementation((...args) => setup.query(...args));
  connectSpy = vi.spyOn(pool, 'connect').mockImplementation(async () => {
    const client = await connect();
    await client.query(`SET search_path TO ${schema}, public`);
    return client;
  });
  await setup.query(`TRUNCATE ${tableNames.join(', ')}`);
  await insertBaseData();
});

afterAll(async () => {
  querySpy?.mockRestore();
  connectSpy?.mockRestore();
  if (setup) {
    await setup.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    setup.release();
  }
  await shutdown();
});

describe('repositories de indicadores com PostgreSQL real', () => {
  it('mantem centros, catalogo, aplicabilidade e inativacao observaveis no banco', async () => {
    const center = await indicators.createCenter({
      code: 'LOT6_CENTER', name: 'Centro Zeta', municipality: 'Joinville', state: 'SC', phase: 'OPERACAO',
      facilitiesStatus: 'READY', innovationLawStatus: 'YES', miditecStatus: 'NO',
    }, adminId);
    await indicators.createCenter({ code: 'LOT6_INACTIVE', name: 'Centro Alfa' }, adminId);
    await setup.query("UPDATE innovation_centers SET active=FALSE WHERE code='LOT6_INACTIVE'");

    expect((await indicators.listCenters()).map((item) => item.code)).toEqual(['LOT6_CENTER']);
    expect((await indicators.listCenters({ includeInactive: true })).map((item) => item.code)).toEqual(['LOT6_INACTIVE', 'LOT6_CENTER']);
    expect((await indicators.findCenter(center.id)).name).toBe('Centro Zeta');
    expect(await indicators.findCenter(randomUUID())).toBeUndefined();

    const updatedCenter = await indicators.updateCenter(center.id, {
      name: 'Centro Atualizado', municipality: null, state: null, phase: 'EXPANSAO', facilitiesStatus: null,
      innovationLawStatus: null, miditecStatus: 'YES', active: true,
    }, secondAdminId);
    expect(updatedCenter).toMatchObject({ name: 'Centro Atualizado', municipality: 'Joinville', phase: 'EXPANSAO', miditec_status: 'YES' });

    const definition = await indicators.createDefinition({
      code: 'LOT6_MANUAL', name: 'Indicador Zeta', description: 'Inicial', category: 'Categoria B', unit: 'UNIDADE',
      valueType: 'INTEGER', periodicity: 'MONTHLY', aggregationType: 'SUM', annualAggregation: 'SUM', sortOrder: 20,
    });
    const second = await indicators.createDefinition({
      code: 'LOT6_SECOND', name: 'Indicador Alfa', description: null, category: 'Categoria A', unit: 'UNIDADE',
      valueType: 'INTEGER', periodicity: 'MONTHLY', aggregationType: 'LAST_VALUE', annualAggregation: 'LAST_VALUE', sortOrder: 10,
    });
    expect((await indicators.findDefinition('LOT6_MANUAL')).id).toBe(definition.id);
    expect((await indicators.findDefinition(definition.id)).code).toBe('LOT6_MANUAL');
    expect((await indicators.listCatalogDefinitions()).map((item) => item.code)).toEqual(['LOT6_SECOND', 'LOT6_MANUAL']);

    const changed = await indicators.updateDefinition(definition.id, {
      name: 'Indicador Atualizado', description: 'Revisado', category: 'Categoria B', unit: 'PESSOA', valueType: 'INTEGER',
      periodicity: 'MONTHLY', aggregationType: 'COUNT', annualAggregation: 'COUNT', sortOrder: 5, active: true,
    });
    expect(changed).toMatchObject({ name: 'Indicador Atualizado', aggregation_type: 'COUNT' });

    const applicability = await indicators.setApplicability(center.id, definition.id, false, '', adminId);
    expect(applicability).toMatchObject({ applicable: false, notes: null });
    await indicators.setApplicability(center.id, definition.id, true, 'Aplicavel', secondAdminId);
    expect((await indicators.listDefinitions(center.id)).find((item) => item.id === definition.id)).toMatchObject({ applicable: true, applicability_notes: 'Aplicavel' });

    const formId = (await setup.query("INSERT INTO forms(title,created_by) VALUES('Formulario', $1) RETURNING id", [adminId])).rows[0].id;
    const questionId = (await setup.query("INSERT INTO questions(form_id,label,type) VALUES($1,'Pergunta','NUMBER') RETURNING id", [formId])).rows[0].id;
    await setup.query(`INSERT INTO question_indicator_links(question_id,indicator_id,aggregation_type,periodicity)
      VALUES($1,$2,'COUNT','MONTHLY')`, [questionId, definition.id]);
    expect(await indicators.definitionFormLinks(definition.id)).toBe(1);
    expect((await indicators.deactivateDefinition(definition.id)).active).toBe(false);
    expect(await indicators.deactivateDefinition(definition.id)).toBeUndefined();
    expect((await indicators.listCatalogDefinitions()).map((item) => item.id)).toEqual([second.id]);
    expect(await indicators.listCatalogDefinitions(true)).toHaveLength(2);
  });

  it('faz insert, update, filtros, historico e exclusao logica de valores', async () => {
    const center = await indicators.createCenter({ code: 'VALUES_CENTER', name: 'Centro Valores' }, adminId);
    const definition = await indicators.createDefinition({
      code: 'VALUES_DEF', name: 'Valor', category: 'Valores', unit: 'BRL', valueType: 'CURRENCY', periodicity: 'MONTHLY',
      aggregationType: 'SUM', annualAggregation: 'SUM', sortOrder: 1,
    });
    const base = {
      indicatorId: definition.id, centerId: center.id, year: 2026, month: 5,
      periodStart: '2026-05-01', periodEnd: '2026-05-31', numericValue: 10,
      textValue: null, jsonValue: null, notes: 'primeiro', sourceType: 'MANUAL_ENTRY',
    };
    const inserted = await indicators.upsertValue(base, adminId);
    expect(inserted).toMatchObject({ created: true, numeric_value: '10.0000' });
    const updated = await indicators.upsertValue({ ...base, numericValue: 25, notes: 'atualizado' }, secondAdminId);
    expect(updated).toMatchObject({ id: inserted.id, created: false, numeric_value: '25.0000' });
    const annual = await indicators.upsertValue({ ...base, month: null, periodStart: '2026-01-01', periodEnd: '2026-12-31', numericValue: 25 }, adminId);

    expect(await indicators.listValues({ centerId: center.id, year: 2026, month: 5 })).toHaveLength(1);
    expect(await indicators.listValues({ centerId: center.id, year: 2026, month: 5, indicatorId: definition.id, includeAnnual: true })).toHaveLength(2);
    expect((await indicators.valueHistory({ centerId: center.id, indicatorId: definition.id })).map((item) => item.id)).toEqual([inserted.id, annual.id]);
    expect((await indicators.findValue(inserted.id)).created_by_name).toBe('Admin A');
    expect((await indicators.manualValuesForCalculation(center.id, 2026))[0].numeric_value).toBe('25.0000');

    await indicators.upsertValue({ ...base, sourceType: 'SYSTEM_CALCULATION', numericValue: 99 }, adminId);
    await indicators.clearSystemValues(center.id, 2026, secondAdminId);
    expect((await indicators.listValues({ centerId: center.id, year: 2026 })).every((item) => item.source_type === 'MANUAL_ENTRY')).toBe(true);
    expect((await indicators.deleteManualValue(inserted.id, secondAdminId)).deleted_at).toBeInstanceOf(Date);
    expect(await indicators.findValue(inserted.id)).toBeUndefined();
    expect(await indicators.deleteManualValue(inserted.id, secondAdminId)).toBeUndefined();
  });

  it('mantem registros com filtros de periodo e garante commit e rollback', async () => {
    const center = await indicators.createCenter({ code: 'RECORD_CENTER', name: 'Centro Registros' }, adminId);
    const event = await indicators.createRecord({
      innovation_center_id: center.id, record_type: 'EVENT', name: 'Demo Day', event_at: '2026-05-10T12:00:00Z',
      municipality: 'Joinville', continuous: false, active: true, extra: { source: 'lot6' },
    }, adminId);
    await indicators.createRecord({
      innovation_center_id: center.id, record_type: 'EVENT', name: 'Evento Antigo', event_at: '2025-01-01T12:00:00Z', active: false,
      continuous: false, extra: {},
    }, adminId);
    const continuous = await indicators.createRecord({
      innovation_center_id: center.id, record_type: 'PROGRAM', name: 'Programa Continuo', start_date: '2025-12-01', end_date: null,
      continuous: true, active: true, extra: {},
    }, adminId);

    expect((await indicators.listRecords({ centerId: center.id, type: 'EVENT', year: 2026, month: 5, search: 'join' })).map((item) => item.id)).toEqual([event.id]);
    expect(await indicators.listRecords({ centerId: center.id, type: 'EVENT', includeInactive: true })).toHaveLength(2);
    expect((await indicators.findRecord(event.id)).name).toBe('Demo Day');
    const updated = await indicators.updateRecord(event.id, {
      innovation_center_id: center.id, record_type: 'EVENT', name: 'Demo Day Atualizado', event_at: '2026-06-15T12:00:00Z',
      municipality: 'Florianopolis', continuous: false, active: true, extra: {},
    }, secondAdminId);
    expect(updated).toMatchObject({ name: 'Demo Day Atualizado', municipality: 'Florianopolis' });
    expect((await indicators.recordsForCalculation(center.id, 2026)).map((item) => item.id)).toEqual(expect.arrayContaining([event.id, continuous.id]));
    expect(await indicators.allDefinitions()).toEqual([]);

    const committed = await indicators.withTransaction(async (client) => {
      const { rows } = await client.query("INSERT INTO indicator_records(innovation_center_id,record_type,name) VALUES($1,'FUNCTION','Persistido') RETURNING id", [center.id]);
      return rows[0].id;
    });
    expect((await setup.query('SELECT name FROM indicator_records WHERE id=$1', [committed])).rows[0].name).toBe('Persistido');

    await expect(indicators.withTransaction(async (client) => {
      await client.query("INSERT INTO indicator_records(innovation_center_id,record_type,name) VALUES($1,'FUNCTION','Reverter')", [center.id]);
      throw new Error('rollback lot6');
    })).rejects.toThrow('rollback lot6');
    expect((await setup.query("SELECT 1 FROM indicator_records WHERE name='Reverter'")).rowCount).toBe(0);

    expect((await indicators.deleteRecord(event.id, adminId)).active).toBe(false);
    expect(await indicators.findRecord(event.id)).toBeUndefined();
    expect(await indicators.updateRecord(event.id, {}, adminId)).toBeUndefined();
  });
});

describe('repository de formularios com PostgreSQL real', () => {
  it('publica audiencia, aplica escopo do residente e registra entrega e resposta', async () => {
    const form = await forms.create({
      title: 'Pesquisa Lot 6', description: 'Inicial', startDate: '2026-01-01', endDate: '2026-12-31', createdBy: adminId,
    });
    expect(form).toMatchObject({ title: 'Pesquisa Lot 6', status: 'DRAFT', owner: 'Admin A' });
    expect((await forms.findAll({ role: 'ADMIN', sub: adminId })).map((item) => item.id)).toContain(form.id);
    expect(await forms.findAll({ role: 'RESIDENTE', sub: residentId })).toEqual([]);
    expect((await forms.findState(form.id)).status).toBe('DRAFT');

    const updated = await forms.update(form.id, { title: 'Pesquisa Atualizada', description: 'Revisada' });
    expect(updated).toMatchObject({ title: 'Pesquisa Atualizada', description: 'Revisada' });
    const question = await forms.addQuestion(form.id, { label: 'Quantidade?', type: 'NUMBER', position: 0 });
    const optionQuestion = await forms.addQuestion(form.id, { label: 'Escolha', type: 'OPTION', required: false, position: 1 });
    expect((await forms.addQuestionOption(form.id, optionQuestion.id, 'Opcao A')).value).toBe('Opcao A');
    expect(await forms.addQuestionOption(form.id, question.id, 'Invalida')).toBeUndefined();

    expect(await forms.saveAudience(form.id, [organizationId], [{ id: residentId, organizationId }])).toBe(true);
    expect((await forms.targets(form.id)).map((item) => item.id)).toEqual([organizationId]);
    expect((await forms.respondents(form.id))[0]).toMatchObject({ user_id: residentId, organization_name: 'Organizacao Alfa', status: 'PENDING' });
    expect((await forms.respondent(form.id, residentId)).email).toBe('resident@lot6.invalid');

    const published = await forms.publish(form.id, [organizationId], [{ id: residentId, organizationId }]);
    expect(published.status).toBe('ACTIVE');
    expect((await forms.findAll({ role: 'RESIDENTE', sub: residentId })).map((item) => item.id)).toEqual([form.id]);
    expect((await forms.findById(form.id, { role: 'RESIDENTE', sub: residentId })).id).toBe(form.id);
    expect(await forms.findById(form.id, { role: 'RESIDENTE', sub: secondAdminId })).toBeUndefined();
    expect(await forms.publish(form.id, [], [])).toBeNull();
    expect(await forms.saveAudience(form.id, [], [])).toBeNull();

    const sent = await forms.recordDelivery(form.id, residentId, { status: 'SENT' });
    expect(sent).toMatchObject({ status: 'SENT', last_error: null });
    expect(sent.sent_at).toBeInstanceOf(Date);
    await forms.recordDelivery(form.id, residentId, { status: 'FAILED', error: 'smtp' });
    await forms.markResponded(form.id, residentId);
    expect((await forms.respondent(form.id, residentId)).status).toBe('RESPONDED');

    await setup.query("INSERT INTO responses(form_id,organization_id,answered_by,status) VALUES($1,$2,$3,'SUBMITTED')", [form.id, organizationId, residentId]);
    expect(await forms.progress(form.id)).toMatchObject({ recipients: 1, submitted: 1 });
    expect((await forms.questions(form.id)).map((item) => item.label)).toEqual(['Quantidade?', 'Escolha']);
  });

  it('vincula indicadores, duplica estrutura e respeita estados e retornos vazios', async () => {
    const center = await indicators.createCenter({ code: 'FORM_CENTER', name: 'Centro Formulario' }, adminId);
    const definition = await indicators.createDefinition({
      code: 'FORM_DEF', name: 'Indicador Formulario', description: 'Manual', category: 'Formulario', unit: 'UNIDADE',
      valueType: 'INTEGER', periodicity: 'MONTHLY', aggregationType: 'SUM', annualAggregation: 'SUM', sortOrder: 1,
    });
    const form = await forms.create({
      title: 'Formulario Indicador', startDate: null, endDate: null, innovationCenterId: center.id,
      indicatorYear: 2026, indicatorMonth: 8, createdBy: adminId,
    });
    const question = await forms.addQuestion(form.id, { label: 'Valor', type: 'NUMBER', indicatorId: definition.id });
    expect(await forms.indicatorAlreadyLinked(form.id, definition.id)).toBe(true);
    expect(await forms.indicatorAlreadyLinked(form.id, definition.id, question.id)).toBe(false);
    expect((await forms.indicatorDefinitions('Formulario')).map((item) => item.id)).toEqual([definition.id]);
    expect((await forms.indicatorDefinitions()).map((item) => item.id)).toEqual([definition.id]);
    expect((await forms.findDefinitionById(definition.id)).active).toBe(true);

    const changed = await forms.updateQuestion(form.id, question.id, { label: 'Valor revisado', indicatorId: null });
    expect(changed.label).toBe('Valor revisado');
    expect(await forms.indicatorAlreadyLinked(form.id, definition.id)).toBe(false);
    await forms.updateQuestion(form.id, question.id, { type: 'OPTION', required: false, position: 2, indicatorId: definition.id });
    await forms.addQuestionOption(form.id, question.id, 'Sim');
    expect((await forms.questionOptions(form.id, question.id)).map((item) => item.value)).toEqual(['Sim']);
    await forms.setTargets(form.id, [organizationId, randomUUID()]);
    await forms.setRespondents(form.id, [{ id: residentId, organizationId }]);

    const copy = await forms.duplicate(form.id, secondAdminId);
    expect(copy).toMatchObject({ title: 'Formulario Indicador (cópia)', status: 'DRAFT' });
    expect(await forms.questions(copy.id)).toHaveLength(1);
    expect(await forms.targets(copy.id)).toHaveLength(1);
    expect(await forms.duplicate(randomUUID(), adminId)).toBeNull();

    expect(await forms.removeQuestion(form.id, question.id)).toBe(true);
    expect(await forms.removeQuestion(form.id, question.id)).toBe(false);
    expect(await forms.updateQuestion(form.id, randomUUID(), { label: 'Ausente' })).toBeUndefined();
    expect(await forms.addQuestion(randomUUID(), { label: 'Ausente' })).toBeUndefined();
    expect(await forms.update(randomUUID(), { title: 'Ausente' })).toBeNull();

    expect((await forms.setStatus(form.id, 'DRAFT', 'ACTIVE')).status).toBe('ACTIVE');
    expect((await forms.setStatus(form.id, 'ACTIVE', 'CLOSED')).status).toBe('CLOSED');
    expect(await forms.setStatus(form.id, 'CLOSED', 'ARCHIVED')).toBeUndefined();
    expect((await setup.query('SELECT status,archived_at FROM forms WHERE id=$1', [form.id])).rows[0]).toMatchObject({ status: 'ARCHIVED', archived_at: expect.any(Date) });
    expect(await forms.findById(form.id)).toBeUndefined();
    expect(await forms.setStatus(form.id, 'CLOSED', 'ARCHIVED')).toBeNull();
  });
});

describe('repositories de acesso e organizacoes com PostgreSQL real', () => {
  it('mantem CRUD, filtros e vinculos de organizacoes', async () => {
    const created = await organizations.create({ name: 'Organizacao Gama', cnpj: '33333333333333' });
    expect(await organizations.findById(created.id)).toMatchObject({ name: 'Organizacao Gama', status: 'ACTIVE' });
    expect(await organizations.existsActive(created.id)).toBe(true);
    expect((await organizations.findAll()).map((item) => item.name)).toEqual(['Organizacao Alfa', 'Organizacao Beta', 'Organizacao Gama']);

    const updated = await organizations.update(created.id, { name: 'Organizacao Delta', cnpj: null, status: null });
    expect(updated).toMatchObject({ name: 'Organizacao Delta', cnpj: '33333333333333' });
    await access.linkOrganization(residentId, created.id);
    expect(await organizations.userHasOrganization(residentId, created.id)).toBe(true);
    expect((await organizations.findForUser(residentId)).map((item) => item.id)).toEqual([organizationId, created.id]);
    expect(await access.userHasOrganization(residentId)).toBe(true);
    expect(await access.organizationExists(created.id)).toBe(true);
    expect(await access.unlinkOrganization(residentId, created.id)).toBe(true);
    expect(await access.unlinkOrganization(residentId, created.id)).toBe(false);
    expect(await organizations.userHasOrganization(residentId, created.id)).toBe(false);

    expect(await organizations.inactivate(created.id)).toBe(true);
    expect(await organizations.inactivate(created.id)).toBe(false);
    expect(await organizations.existsActive(created.id)).toBe(false);
    expect((await organizations.findAll({ includeInactive: true })).map((item) => item.id)).toContain(created.id);
    expect(await organizations.update(randomUUID(), { name: 'Ausente' })).toBeNull();
  });

  it('aprova, rejeita e cria usuario gerenciado com auditoria transacional', async () => {
    const audit = async (client, entity = {}) => {
      await client.query("INSERT INTO audit_logs(action,entity,entity_id,details) VALUES('LOT6','user',$1,$2)", [entity.id || null, entity]);
    };
    const managed = await access.createManagedUser({
      name: 'Gestor Lot6', email: 'gestor@lot6.invalid', passwordHash: 'hash', role: 'GESTOR',
      organizationId, adminId,
    }, audit);
    expect(managed).toMatchObject({ role: 'GESTOR', status: 'ACTIVE' });
    expect(await access.organizationExists(organizationId)).toBe(true);

    const pendingId = randomUUID();
    await setup.query(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at,requested_company_name,requested_company_cnpj)
      VALUES($1,'Pendente','pending@lot6.invalid','hash','RESIDENTE','PENDING',NOW(),'Nova Empresa','44444444444444')`, [pendingId]);
    expect((await access.listPending()).map((item) => item.id)).toEqual([pendingId]);
    expect((await access.findRequest(pendingId)).requested_company_name).toBe('Nova Empresa');

    const approved = await access.approve({
      userId: pendingId, adminId, role: 'RESIDENTE', organizationId: null, organizationName: null, createOrganization: true,
    }, async (client, data) => client.query("INSERT INTO audit_logs(action,entity,entity_id,details) VALUES('APPROVED','user',$1,$2)", [pendingId, data]));
    expect(approved).toMatchObject({ userId: pendingId, role: 'RESIDENTE', status: 'ACTIVE' });
    expect(await access.userHasOrganization(pendingId)).toBe(true);

    const rejectedId = randomUUID();
    await setup.query(`INSERT INTO users(id,name,email,password_hash,role,status,email_verified_at)
      VALUES($1,'Rejeitado','rejected@lot6.invalid','hash','GESTOR','PENDING',NOW())`, [rejectedId]);
    const rejected = await access.reject(rejectedId, adminId, 'Sem vinculo', (client) =>
      client.query("INSERT INTO audit_logs(action,entity,entity_id) VALUES('REJECTED','user',$1)", [rejectedId]));
    expect(rejected.status).toBe('REJECTED');
    expect(await access.reject(rejectedId, adminId, 'Novamente', async () => {})).toBeNull();

    expect((await access.listUsers({ status: 'ACTIVE', role: 'RESIDENTE' })).map((item) => item.id)).toEqual(expect.arrayContaining([residentId, pendingId]));
    expect(await access.approve({ userId: randomUUID(), adminId, role: 'GESTOR' }, async () => {})).toBeNull();
  });

  it('protege o ultimo admin e reverte callbacks que falham no banco real', async () => {
    const audit = (action) => (client) => client.query(
      'INSERT INTO audit_logs(action,entity,entity_id) VALUES($1,\'user\',$2)', [action, adminId],
    );
    expect((await access.setStatus(adminId, 'INACTIVE', null, audit('INACTIVE'))).status).toBe('INACTIVE');
    expect((await access.setStatus(adminId, 'ACTIVE', secondAdminId, audit('ACTIVE'))).status).toBe('ACTIVE');
    expect((await access.setRole(adminId, 'GESTOR', audit('ROLE'))).role).toBe('GESTOR');
    expect((await access.setRole(adminId, 'ADMIN', audit('ADMIN'))).role).toBe('ADMIN');

    await setup.query('DELETE FROM users WHERE id=$1', [secondAdminId]);
    await expect(access.setStatus(adminId, 'INACTIVE', null, audit('BLOCKED'))).rejects.toMatchObject({ code: 'LAST_ACTIVE_ADMIN' });
    expect((await access.findRequest(adminId)).status).toBe('ACTIVE');

    await expect(access.setRole(adminId, 'ADMIN', async (client) => {
      await client.query("UPDATE users SET name='Nao persistir' WHERE id=$1", [adminId]);
      throw new Error('falha de auditoria');
    })).rejects.toThrow('falha de auditoria');
    expect((await access.findRequest(adminId)).name).toBe('Admin A');
    expect(await access.setRole(randomUUID(), 'ADMIN', async () => {})).toBeNull();
    expect(await access.setStatus(randomUUID(), 'ACTIVE', adminId, async () => {})).toBeNull();
  });
});
