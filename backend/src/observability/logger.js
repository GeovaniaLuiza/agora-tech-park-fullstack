import pino from 'pino';

export const REDACTED_PATHS = [
  'msg', // Pino may derive this field from an unsanitized Error.message.
  'cpf', 'cnpj', 'email', 'phone', 'telefone', 'jwt',
  'body', 'file', 'files', 'buffer', 'rows', 'workbook',
  '*.cpf', '*.cnpj', '*.email', '*.phone', '*.telefone',
  'req.body', 'req.file', 'req.files',
  'password',
  'password_hash',
  'token',
  'rawToken',
  'authorization',
  'cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  '*.password',
  '*.password_hash',
  '*.token',
  '*.rawToken',
  '*.jwt',
  '*.databaseUrl',
  '*.smtpPassword',
];

export const logger = pino({
  name: 'agora-api',
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: 'agora-api', environment: process.env.NODE_ENV || 'development' },
  redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
  // Driver errors can embed submitted values in messages, stacks and details.
  serializers: { err: () => ({ type: 'Error', message: 'Operation failed' }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});
