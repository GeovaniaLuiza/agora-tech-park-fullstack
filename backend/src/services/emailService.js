import { createSmtpProvider } from '../email/smtpProvider.js';
import { approvedTemplate, formInvitationTemplate, inactiveTemplate, passwordResetTemplate, rejectedTemplate, verificationTemplate, verifiedTemplate } from '../email/templates.js';

let provider;
const getProvider = () => {
  if (!provider) provider = createSmtpProvider();
  return provider;
};
export const setEmailProviderForTests = (value) => { provider = value; };

async function send(to, subject, template) {
  return getProvider().send({ to, subject, ...template });
}

export const verifyConnection = () => getProvider().verify();

export const sendVerification = ({ email, name, rawToken }) => {
  const expiresHours = Number(process.env.EMAIL_VERIFICATION_TOKEN_TTL_HOURS || process.env.EMAIL_VERIFICATION_TTL_HOURS || 24);
  const url = new URL('/confirmar-email', process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5174');
  url.searchParams.set('token', rawToken);
  return send(email, 'Confirme seu e-mail — Ágora Tech Park', verificationTemplate({ name, confirmationUrl: url.toString(), expiresHours }));
};
export const sendPasswordReset = ({ email, name, rawToken, expiresHours }) => {
  const url = new URL('/redefinir-senha', process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5174');
  url.searchParams.set('token', rawToken);
  return send(email, 'Redefina sua senha — Ágora Tech Park', passwordResetTemplate({ name, resetUrl: url.toString(), expiresHours }));
};
export const sendVerified = ({ email, name }) => send(email, 'E-mail confirmado — Ágora Tech Park', verifiedTemplate({ name }));
export const sendApproved = ({ email, name }) => send(email, 'Acesso liberado — Ágora Tech Park', approvedTemplate({ name, loginUrl: new URL('/login', process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5174').toString() }));
export const sendRejected = ({ email, name }) => send(email, 'Atualização da solicitação — Ágora Tech Park', rejectedTemplate({ name }));
export const sendInactive = ({ email, name }) => send(email, 'Acesso inativado — Ágora Tech Park', inactiveTemplate({ name }));
export const sendFormInvitation = ({ email, name, formId, formTitle, deadline }) => {
  const url = new URL(`/resident/forms/${formId}/respond`, process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5174');
  return send(email, `Formulário disponível: ${formTitle}`, formInvitationTemplate({
    name: name || 'respondente', formTitle, deadline, formUrl: url.toString(),
  }));
};
