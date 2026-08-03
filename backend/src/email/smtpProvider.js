import nodemailer from 'nodemailer';

export class EmailConfigurationError extends Error {
  constructor(reason) {
    super('Configuração do serviço de e-mail inválida');
    this.name = 'EmailConfigurationError';
    this.reason = reason;
  }
}

const present = (value) => typeof value === 'string' && value.trim().length > 0;

function parseSecure(value) {
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new EmailConfigurationError('SMTP_SECURE_INVALID');
}

export function validateSmtpConfiguration(env = process.env) {
  if (env.EMAIL_PROVIDER !== 'smtp') throw new EmailConfigurationError('EMAIL_PROVIDER_INVALID');
  if (!present(env.SMTP_HOST)) throw new EmailConfigurationError('SMTP_HOST_MISSING');

  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new EmailConfigurationError('SMTP_PORT_INVALID');
  }

  const secure = parseSecure(env.SMTP_SECURE);
  if (port === 465 && !secure) throw new EmailConfigurationError('SMTP_PORT_465_REQUIRES_SECURE');
  if (port === 587 && secure) throw new EmailConfigurationError('SMTP_PORT_587_REQUIRES_STARTTLS');

  const hasUser = present(env.SMTP_USER);
  const hasPassword = present(env.SMTP_PASSWORD);
  if (hasUser !== hasPassword) throw new EmailConfigurationError('SMTP_AUTH_INCOMPLETE');

  const from = env.EMAIL_FROM || (
    env.EMAIL_FROM_NAME && env.EMAIL_FROM_ADDRESS
      ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`
      : env.EMAIL_FROM_ADDRESS
  );
  if (!present(from)) throw new EmailConfigurationError('EMAIL_FROM_MISSING');
  const connectionTimeout = Number(env.SMTP_CONNECTION_TIMEOUT_MS || 10_000);
  if (!Number.isSafeInteger(connectionTimeout) || connectionTimeout < 1) {
    throw new EmailConfigurationError('SMTP_TIMEOUT_INVALID');
  }

  return {
    host: env.SMTP_HOST.trim(),
    port,
    secure,
    from: from.trim(),
    auth: hasUser ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    connectionTimeout,
  };
}

export function classifyEmailError(error) {
  if (error instanceof EmailConfigurationError) return error.reason;
  if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') return 'DNS_FAILURE';
  if (error?.code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
  if (error?.code === 'ESOCKET' && error?.syscall === 'connect') return 'CONNECTION_REFUSED';
  if (error?.code === 'ETIMEDOUT' || error?.code === 'ETIMEOUT') return 'CONNECTION_TIMEOUT';
  if (error?.code === 'EAUTH' || [530, 534, 535].includes(error?.responseCode)) return 'AUTHENTICATION_REJECTED';
  if (error?.command === 'MAIL FROM') return 'SENDER_REJECTED';
  if (error?.command === 'RCPT TO' || error?.code === 'EENVELOPE') return 'RECIPIENT_REJECTED';
  if (error?.code === 'ETLS' || error?.code === 'EPROTO' || error?.code === 'ESOCKET') return 'TLS_INCOMPATIBLE';
  return 'SMTP_DELIVERY_FAILED';
}

export function createSmtpProvider(env = process.env, createTransport = nodemailer.createTransport) {
  const config = validateSmtpConfiguration(env);
  const transport = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.port === 587,
    connectionTimeout: config.connectionTimeout,
    greetingTimeout: config.connectionTimeout,
    socketTimeout: config.connectionTimeout,
    ...(config.auth ? { auth: config.auth } : {}),
  });

  return {
    verify: () => transport.verify(),
    send: ({ to, subject, text, html }) => transport.sendMail({ from: config.from, to, subject, text, html }),
    close: () => transport.close(),
  };
}
