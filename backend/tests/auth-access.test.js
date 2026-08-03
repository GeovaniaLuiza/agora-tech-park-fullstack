import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const userRepo = vi.hoisted(() => ({
  findByEmail: vi.fn(), findById: vi.fn(), findPublicProfile: vi.fn(),
  createPending: vi.fn(), hasOrganization: vi.fn(), organizationsForUser: vi.fn(), recordLogin: vi.fn(),
}));
const auditRepo = vi.hoisted(() => ({ record: vi.fn(), list: vi.fn() }));
const accessRepo = vi.hoisted(() => ({
  listPending: vi.fn(), approve: vi.fn(), findRequest: vi.fn(), reject: vi.fn(), setStatus: vi.fn(), setRole: vi.fn(), linkOrganization: vi.fn(),
  organizationExists: vi.fn(), userHasOrganization: vi.fn(),
}));
const responseRepo = vi.hoisted(() => ({
  submit: vi.fn(), saveDraft: vi.fn(), history: vi.fn(), findByFormAndOrganization: vi.fn(),
  getAnswers: vi.fn(), submissionContext: vi.fn(), formQuestions: vi.fn(), reopen: vi.fn(),
}));
const verificationRepo = vi.hoisted(() => ({
  issue: vi.fn(),
  verify: vi.fn(),
  issueForExistingUser: vi.fn(),
  markDelivered: vi.fn(),
  markDeliveryFailed: vi.fn(),
}));
const emailService = vi.hoisted(() => ({ sendVerification: vi.fn(), sendVerified: vi.fn(), sendApproved: vi.fn(), sendRejected: vi.fn(), sendInactive: vi.fn() }));
vi.mock('../src/repositories/userRepository.js', () => userRepo);
vi.mock('../src/repositories/auditRepository.js', () => auditRepo);
vi.mock('../src/repositories/accessRepository.js', () => accessRepo);
vi.mock('../src/repositories/responseRepository.js', () => responseRepo);
vi.mock('../src/repositories/emailVerificationRepository.js', () => verificationRepo);
vi.mock('../src/services/emailService.js', () => emailService);

import app from '../src/app.js';

const activeUser = { id: '11111111-1111-1111-1111-111111111111', name: 'Admin', email: 'admin@agora.test', role: 'ADMIN', status: 'ACTIVE', email_verified_at: new Date().toISOString() };
const resident = { ...activeUser, id: '44444444-4444-4444-4444-444444444444', role: 'RESIDENTE', email: 'resident@agora.test' };
let passwordHash;
const tokenFor = (user, expiresIn = '1h') => jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn });

beforeAll(async () => { process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters'; passwordHash = await bcrypt.hash('Senha123', 4); });
beforeEach(() => {
  vi.clearAllMocks();
  auditRepo.record.mockResolvedValue(undefined);
  userRepo.findById.mockImplementation(async (id) => id === activeUser.id ? activeUser : resident);
  userRepo.findPublicProfile.mockImplementation(async (id) => ({ ...(id === activeUser.id ? activeUser : resident), organizations: id === activeUser.id ? [] : [{ id: '55555555-5555-5555-5555-555555555555' }] }));
  userRepo.recordLogin.mockImplementation(async (_id, audit) => audit({ query: vi.fn() }));
  accessRepo.organizationExists.mockResolvedValue(true);
  accessRepo.userHasOrganization.mockResolvedValue(true);
  accessRepo.reject.mockImplementation(async (_id, _adminId, _reason, audit) => {
    await audit({ query: vi.fn() });
    return { ...resident, status: 'REJECTED' };
  });
  verificationRepo.issue.mockResolvedValue({ tokenId: 'token-id', rawToken: 'raw-verification-token-with-more-than-32-characters' });
  verificationRepo.markDelivered.mockResolvedValue(true);
  verificationRepo.markDeliveryFailed.mockResolvedValue(true);
  emailService.sendVerification.mockResolvedValue({});
  emailService.sendVerified.mockResolvedValue({});
  emailService.sendApproved.mockResolvedValue({});
  emailService.sendRejected.mockResolvedValue({});
  responseRepo.submissionContext.mockResolvedValue({
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    status: 'ACTIVE',
    start_date: null,
    end_date: null,
    targeted: true,
  });
  responseRepo.formQuestions.mockResolvedValue([{ id: 'q', label: 'Quantidade', type: 'NUMBER', required: true, options: [] }]);
});

describe('autenticação e solicitação de acesso', () => {
  it('realiza login válido sem expor password_hash', async () => {
    userRepo.findByEmail.mockResolvedValue({ ...activeUser, password_hash: passwordHash });
    const response = await request(app).post('/api/auth/login').send({ email: ' ADMIN@AGORA.TEST ', password: 'Senha123' });
    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toContain('password_hash');
  });
  it('rejeita login inválido e conta pendente', async () => {
    userRepo.findByEmail.mockResolvedValue({ ...activeUser, password_hash: passwordHash });
    expect((await request(app).post('/api/auth/login').send({ email: activeUser.email, password: 'Errada123' })).status).toBe(401);
    userRepo.findByEmail.mockResolvedValue({ ...activeUser, status: 'PENDING', password_hash: passwordHash });
    expect((await request(app).post('/api/auth/login').send({ email: activeUser.email, password: 'Senha123' })).status).toBe(403);
  });
  it('rejeita senha fraca e tentativa de injetar ADMIN', async () => {
    const base = { name: 'Pessoa Teste', email: 'pessoa@test.com', password: 'Senha123', confirmPassword: 'Senha123', cnpj: '11222333000181', companyName: 'Startup', acceptedTerms: true };
    expect((await request(app).post('/api/auth/register-request').send({ ...base, password: 'fraca', confirmPassword: 'fraca' })).status).toBe(422);
    expect((await request(app).post('/api/auth/register-request').send({ ...base, role: 'ADMIN' })).status).toBe(400);
  });
  it('cria solicitação sem perfil, com EMAIL_PENDING, hash de senha e sem organização ativa', async () => {
    const body = { name: 'Pessoa Teste', email: 'pessoa@test.com', password: 'Senha123', confirmPassword: 'Senha123', cnpj: '11222333000181', companyName: 'Startup', acceptedTerms: true };
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.createPending.mockImplementation(async (_data, audit) => {
      const created = { id: resident.id, name: 'Pessoa Teste', email: body.email, status: 'EMAIL_PENDING', role: null };
      const context = await audit({ query: vi.fn() }, created);
      return { ...created, ...context };
    });
    const createdResponse = await request(app).post('/api/auth/register-request').send(body);
    expect(createdResponse.status).toBe(201);
    expect(createdResponse.body).toMatchObject({
      requestCreated: true,
      notificationSent: true,
      nextAction: 'VERIFY_EMAIL',
    });
    expect(userRepo.createPending.mock.calls[0][0]).not.toHaveProperty('role');
    expect(userRepo.createPending.mock.calls[0][0]).not.toHaveProperty('organizationId');
    expect(userRepo.createPending.mock.calls[0][0].passwordHash).not.toBe(body.password);
    expect(emailService.sendVerification).toHaveBeenCalledOnce();
    expect(verificationRepo.markDelivered).toHaveBeenCalledWith('token-id');
    expect(auditRepo.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCESS_REQUESTED', entityId: resident.id }), expect.any(Object));
    userRepo.findByEmail.mockResolvedValue(activeUser);
    const existingResponse = await request(app).post('/api/auth/register-request').send({ ...body, email: 'outro@test.com' });
    expect(existingResponse.status).toBe(409);
    expect(existingResponse.body).toMatchObject({
      code: 'EXISTING_ACCESS_REQUEST',
      requestCreated: false,
      notificationSent: false,
      nextAction: 'RESEND_VERIFICATION',
    });
  });
  it('trata e audita falha no envio da confirmação sem expor detalhes do provedor', async () => {
    const body = { name: 'Pessoa Teste', email: 'falha@test.com', password: 'Senha123', confirmPassword: 'Senha123', cnpj: '11222333000181', companyName: 'Startup', acceptedTerms: true };
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.createPending.mockImplementation(async (_data, callback) => {
      const created = { id: resident.id, name: body.name, email: body.email, status: 'EMAIL_PENDING' };
      return { ...created, ...await callback({ query: vi.fn() }, created) };
    });
    emailService.sendVerification.mockRejectedValueOnce(new Error('credencial SMTP secreta'));

    const response = await request(app).post('/api/auth/register-request').send(body);

    expect(response.status).toBe(503);
    expect(response.body.message).not.toContain('SMTP');
    expect(response.body).toMatchObject({
      code: 'EMAIL_DELIVERY_FAILED',
      requestCreated: true,
      notificationSent: false,
      nextAction: 'RESEND_VERIFICATION',
    });
    expect(verificationRepo.markDeliveryFailed).toHaveBeenCalledWith('token-id');
    expect(auditRepo.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMAIL_DELIVERY_FAILED',
      entityId: resident.id,
    }));
  });
  it('confirma token válido, rejeita inválido, expirado e reutilizado', async () => {
    const rawToken = 'token-valid-with-at-least-thirty-two-characters';
    verificationRepo.verify.mockResolvedValueOnce({ state: 'VERIFIED', user: resident });
    const valid = await request(app).post('/api/auth/verify-email').send({ token: rawToken });
    expect(valid.status).toBe(200);
    expect(valid.body).not.toHaveProperty('token');
    expect(valid.body).not.toHaveProperty('user');
    expect(emailService.sendVerified).toHaveBeenCalled();
    for (const [state, status] of [['INVALID', 400], ['EXPIRED', 410], ['USED', 409]]) {
      verificationRepo.verify.mockResolvedValueOnce({ state });
      expect((await request(app).post('/api/auth/verify-email').send({ token: rawToken })).status).toBe(status);
    }
  });
  it('confirma o e-mail mesmo se a notificação posterior falhar e informa o resultado real', async () => {
    const rawToken = 'token-valid-with-at-least-thirty-two-characters';
    verificationRepo.verify.mockResolvedValueOnce({ state: 'VERIFIED', user: resident });
    emailService.sendVerified.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));

    const response = await request(app).post('/api/auth/verify-email').send({ token: rawToken });

    expect(response.status).toBe(200);
    expect(response.body.notificationSent).toBe(false);
    expect(auditRepo.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMAIL_DELIVERY_FAILED',
      details: { type: 'VERIFIED', reason: 'CONNECTION_TIMEOUT' },
    }));
  });
  it('bloqueia EMAIL_PENDING e PENDING com mensagens específicas', async () => {
    userRepo.findByEmail.mockResolvedValue({ ...resident, status: 'EMAIL_PENDING', email_verified_at: null, password_hash: passwordHash });
    expect((await request(app).post('/api/auth/login').send({ email: resident.email, password: 'Senha123' })).body.code).toBe('EMAIL_NOT_VERIFIED');
    userRepo.findByEmail.mockResolvedValue({ ...resident, status: 'PENDING', email_verified_at: new Date().toISOString(), password_hash: passwordHash });
    expect((await request(app).post('/api/auth/login').send({ email: resident.email, password: 'Senha123' })).body.code).toBe('APPROVAL_PENDING');
  });
  it('reenvio mantém resposta 202 idêntica para conta inexistente, confirmada ou não elegível', async () => {
    userRepo.findByEmail
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...resident, status: 'PENDING', email_verified_at: new Date().toISOString() })
      .mockResolvedValueOnce({ ...resident, status: 'INACTIVE', email_verified_at: null });
    const accepted = {
      message: 'Solicitação processada. Se existir um cadastro pendente para este e-mail, uma nova mensagem de confirmação será enviada.',
      status: 'REQUEST_ACCEPTED',
      nextAction: 'CHECK_EMAIL',
    };
    const unknown = await request(app).post('/api/auth/resend-verification').send({ email: 'unknown@test.com' });
    const confirmed = await request(app).post('/api/auth/resend-verification').send({ email: resident.email });
    const unavailable = await request(app).post('/api/auth/resend-verification').send({ email: resident.email });
    expect(unknown.status).toBe(202);
    expect(confirmed.status).toBe(202);
    expect(unavailable.status).toBe(202);
    expect(unknown.body).toEqual(accepted);
    expect(confirmed.body).toEqual(accepted);
    expect(unavailable.body).toEqual(accepted);
    expect(verificationRepo.issueForExistingUser).not.toHaveBeenCalled();
  });
  it('reenvio válido entrega uma vez, ativa o token e registra auditoria', async () => {
    userRepo.findByEmail.mockResolvedValue({ ...resident, status: 'EMAIL_PENDING', email_verified_at: null });
    verificationRepo.issueForExistingUser.mockResolvedValue({
      tokenId: 'resent-token-id',
      rawToken: 'another-raw-token-with-at-least-32-characters',
    });

    const response = await request(app).post('/api/auth/resend-verification').send({ email: resident.email });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: 'Solicitação processada. Se existir um cadastro pendente para este e-mail, uma nova mensagem de confirmação será enviada.',
      status: 'REQUEST_ACCEPTED',
      nextAction: 'CHECK_EMAIL',
    });
    expect(emailService.sendVerification).toHaveBeenCalledOnce();
    expect(verificationRepo.issueForExistingUser).toHaveBeenCalledWith(
      resident.id,
      expect.objectContaining({ requestedIp: expect.any(String) }),
    );
    expect(verificationRepo.issueForExistingUser.mock.calls[0][1]).not.toHaveProperty('minimumMinutes');
    expect(verificationRepo.issueForExistingUser.mock.calls[0][1]).not.toHaveProperty('maxPerHour');
    expect(verificationRepo.markDelivered).toHaveBeenCalledWith('resent-token-id');
    expect(auditRepo.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'EMAIL_VERIFICATION_RESENT' }));
  });
  it('falha SMTP no reenvio retorna 503, invalida somente o token preparado e não expõe detalhes', async () => {
    userRepo.findByEmail.mockResolvedValue({ ...resident, status: 'EMAIL_PENDING', email_verified_at: null });
    verificationRepo.issueForExistingUser.mockResolvedValue({
      tokenId: 'failed-token-id',
      rawToken: 'another-raw-token-with-at-least-32-characters',
    });
    emailService.sendVerification.mockRejectedValueOnce(Object.assign(new Error('smtp://usuario:senha@host'), { code: 'ECONNREFUSED' }));

    const response = await request(app).post('/api/auth/resend-verification').send({ email: resident.email });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      message: 'Não foi possível enviar o e-mail de confirmação neste momento. Tente novamente mais tarde.',
      code: 'EMAIL_DELIVERY_FAILED',
      notificationSent: false,
      nextAction: 'RESEND_VERIFICATION',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/smtp|usuario|senha|host/i);
    expect(verificationRepo.markDeliveryFailed).toHaveBeenCalledWith('failed-token-id');
    expect(verificationRepo.markDelivered).not.toHaveBeenCalledWith('failed-token-id');
    expect(auditRepo.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMAIL_DELIVERY_FAILED',
      details: { type: 'VERIFICATION_RESEND', reason: 'CONNECTION_REFUSED' },
    }));
  });
  it.each([
    [{ inProgress: true, retryAfterSeconds: 30 }, 'RESEND_THROTTLED', 'DELIVERY_IN_PROGRESS'],
    [{ inProgress: true, retryAfterSeconds: 30 }, 'RESEND_LIMIT_EXCEEDED', 'DELIVERY_IN_PROGRESS'],
  ])('mantém bloqueio interno indistinguível sem remover a proteção', async (issued, _code, reason) => {
    userRepo.findByEmail.mockResolvedValue({ ...resident, status: 'EMAIL_PENDING', email_verified_at: null });
    verificationRepo.issueForExistingUser.mockResolvedValue(issued);

    const response = await request(app).post('/api/auth/resend-verification').send({ email: resident.email });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: 'Solicitação processada. Se existir um cadastro pendente para este e-mail, uma nova mensagem de confirmação será enviada.',
      status: 'REQUEST_ACCEPTED',
      nextAction: 'CHECK_EMAIL',
    });
    expect(response.headers['retry-after']).toBeUndefined();
    expect(emailService.sendVerification).not.toHaveBeenCalled();
    expect(auditRepo.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMAIL_VERIFICATION_RESEND_THROTTLED',
      details: { reason },
    }));
  });
  it('rejeita e-mail sintaticamente inválido com contrato de validação', async () => {
    const response = await request(app).post('/api/auth/resend-verification').send({ email: 'invalido' });
    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      message: 'Informe um endereço de e-mail válido.',
      code: 'INVALID_EMAIL',
      nextAction: 'CORRECT_EMAIL',
    });
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
  });
  it('/me aceita token válido e rejeita inválido ou expirado', async () => {
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenFor(activeUser)}`)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer inválido')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenFor(activeUser, '-1s')}`)).status).toBe(401);
  });
  it('revalida o perfil atual do banco em cada sessão', async () => {
    userRepo.findPublicProfile.mockResolvedValue({ ...activeUser, role: 'GESTOR', organizations: [] });
    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenFor(activeUser)}`);
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('GESTOR');
  });
  it('registra login e logout sem expor dados sensíveis', async () => {
    userRepo.findByEmail.mockResolvedValue({ ...activeUser, password_hash: passwordHash });
    const loginResponse = await request(app).post('/api/auth/login').send({ email: activeUser.email, password: 'Senha123' });
    const logoutResponse = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${loginResponse.body.token}`);
    expect(logoutResponse.status).toBe(204);
    expect(auditRepo.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_LOGIN' }), expect.any(Object));
    expect(auditRepo.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_LOGOUT' }));
    expect(JSON.stringify(loginResponse.body)).not.toMatch(/password_hash|rawToken|token_hash/);
  });
  it.each(['REJECTED', 'INACTIVE'])('bloqueia login de conta %s', async (status) => {
    userRepo.findByEmail.mockResolvedValue({ ...resident, status, password_hash: passwordHash });
    const response = await request(app).post('/api/auth/login').send({ email: resident.email, password: 'Senha123' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ACCOUNT_UNAVAILABLE');
  });
  it('bloqueia residente ativo sem organização e perfil desconhecido', async () => {
    userRepo.findByEmail.mockResolvedValue({ ...resident, password_hash: passwordHash });
    userRepo.findPublicProfile.mockResolvedValueOnce({ ...resident, organizations: [] });
    expect((await request(app).post('/api/auth/login').send({ email: resident.email, password: 'Senha123' })).body.code).toBe('ACCOUNT_UNAVAILABLE');
    userRepo.findByEmail.mockResolvedValue({ ...activeUser, role: 'LEGADO', password_hash: passwordHash });
    expect((await request(app).post('/api/auth/login').send({ email: activeUser.email, password: 'Senha123' })).body.code).toBe('ACCOUNT_UNAVAILABLE');
  });
});

describe('RBAC administrativo e isolamento do residente', () => {
  it('permite aprovação apenas para ADMIN', async () => {
    accessRepo.findRequest.mockResolvedValue({ ...resident, role: null, status: 'PENDING', email_verified_at: new Date().toISOString() });
    accessRepo.approve.mockImplementation(async (_payload, audit) => {
      await audit({ query: vi.fn() }, { resolvedOrganizationId: '55555555-5555-5555-5555-555555555555', previousRole: 'RESIDENTE' });
      return { userId: resident.id, role: 'RESIDENTE', status: 'ACTIVE' };
    });
    expect((await request(app).post(`/api/admin/access-requests/${resident.id}/approve`).set('Authorization', `Bearer ${tokenFor(activeUser)}`).send({ role: 'RESIDENTE', organizationId: '55555555-5555-5555-5555-555555555555' })).status).toBe(200);
    expect(emailService.sendApproved).toHaveBeenCalled();
    for (const role of ['GESTOR', 'PESQUISADOR', 'RESIDENTE']) {
      const unauthorizedUser = { ...resident, role };
      userRepo.findPublicProfile.mockResolvedValue({ ...unauthorizedUser, organizations: role === 'RESIDENTE' ? [{ id: '55555555-5555-5555-5555-555555555555' }] : [] });
      expect((await request(app).post(`/api/admin/access-requests/${resident.id}/approve`).set('Authorization', `Bearer ${tokenFor(unauthorizedUser)}`).send({ role: 'RESIDENTE', organizationId: '55555555-5555-5555-5555-555555555555' })).status).toBe(403);
    }
    expect(auditRepo.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ORGANIZATION_LINKED' }), expect.any(Object));
  });
  it('exige perfil, confirmação e organização para aprovar', async () => {
    accessRepo.findRequest.mockResolvedValue({ ...resident, role: null, status: 'PENDING', email_verified_at: new Date().toISOString() });
    const endpoint = `/api/admin/access-requests/${resident.id}/approve`;
    const authorized = (body) => request(app).post(endpoint).set('Authorization', `Bearer ${tokenFor(activeUser)}`).send(body);
    expect((await authorized({})).status).toBe(422);
    expect((await authorized({ role: 'RESIDENTE' })).status).toBe(422);
    accessRepo.findRequest.mockResolvedValue({ ...resident, role: null, status: 'PENDING', email_verified_at: null });
    expect((await authorized({ role: 'GESTOR' })).status).toBe(422);
  });
  it('envia notificações de rejeição e registra falhas de entrega sem desfazer a decisão', async () => {
    accessRepo.findRequest.mockResolvedValue({ ...resident, status: 'PENDING', email_verified_at: new Date().toISOString() });
    emailService.sendRejected.mockRejectedValueOnce(new Error('SMTP indisponível'));
    const response = await request(app).post(`/api/admin/access-requests/${resident.id}/reject`)
      .set('Authorization', `Bearer ${tokenFor(activeUser)}`).send({ reason: 'Vínculo não comprovado' });
    expect(response.status).toBe(200);
    expect(response.body.notificationSent).toBe(false);
    expect(auditRepo.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCESS_REJECTED' }), expect.any(Object));
    expect(auditRepo.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMAIL_DELIVERY_FAILED',
      entityId: resident.id,
    }));
  });
  it('impede não ADMIN de consultar solicitações', async () => {
    userRepo.findPublicProfile.mockResolvedValue({ ...resident, role: 'GESTOR', organizations: [] });
    const response = await request(app).get('/api/admin/access-requests').set('Authorization', `Bearer ${tokenFor(resident)}`);
    expect(response.status).toBe(403);
    expect(accessRepo.listPending).not.toHaveBeenCalled();
  });
  it('impede residente de consultar ou responder por outra organização', async () => {
    userRepo.findPublicProfile.mockResolvedValue({ ...resident, organizations: [{ id: '55555555-5555-5555-5555-555555555555' }] });
    userRepo.hasOrganization.mockResolvedValue(false);
    const token = tokenFor(resident);
    const organizationId = '99999999-9999-9999-9999-999999999999';
    expect((await request(app).get(`/api/organizations/${organizationId}/responses`).set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).post('/api/forms/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/responses').set('Authorization', `Bearer ${token}`).send({ organizationId, answers: [{ questionId: 'q', value: '1' }] })).status).toBe(403);
  });
  it('permite resposta apenas quando o vínculo com a organização existe', async () => {
    userRepo.findPublicProfile.mockResolvedValue({ ...resident, organizations: [{ id: '55555555-5555-5555-5555-555555555555' }] });
    userRepo.hasOrganization.mockResolvedValue(true);
    responseRepo.submit.mockResolvedValue({ id: '88888888-8888-8888-8888-888888888888' });
    const response = await request(app).post('/api/forms/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/responses')
      .set('Authorization', `Bearer ${tokenFor(resident)}`)
      .send({ organizationId: '55555555-5555-5555-5555-555555555555', answers: [{ questionId: 'q', value: '1' }] });
    expect(response.status).toBe(201);
    expect(responseRepo.submit).toHaveBeenCalledWith(expect.objectContaining({ userId: resident.id }));
  });
  it('valida campos obrigatorios e impede sobrescrever resposta enviada', async () => {
    userRepo.findPublicProfile.mockResolvedValue({ ...resident, organizations: [{ id: '55555555-5555-5555-5555-555555555555' }] });
    userRepo.hasOrganization.mockResolvedValue(true);
    const token = tokenFor(resident);
    const path = '/api/forms/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/responses';
    const incomplete = await request(app).post(path).set('Authorization', `Bearer ${token}`).send({
      organizationId: '55555555-5555-5555-5555-555555555555',
      answers: [],
    });
    expect(incomplete.status).toBe(422);
    expect(incomplete.body.code).toBe('REQUIRED_ANSWERS_MISSING');
    responseRepo.submit.mockResolvedValue({ conflict: true });
    const conflict = await request(app).post(path).set('Authorization', `Bearer ${token}`).send({
      organizationId: '55555555-5555-5555-5555-555555555555',
      answers: [{ questionId: 'q', value: '1' }],
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('RESPONSE_ALREADY_SUBMITTED');
  });
  it('impede GESTOR de criar formularios', async () => {
    userRepo.findPublicProfile.mockResolvedValue({ ...resident, role: 'GESTOR', organizations: [] });
    const response = await request(app).post('/api/forms')
      .set('Authorization', `Bearer ${tokenFor(resident)}`)
      .send({ title: 'Formulario nao autorizado' });
    expect(response.status).toBe(403);
  });
});
