import pino from 'pino';

export const REDACTED_PATHS = [
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
  serializers: { err: pino.stdSerializers.err },
  timestamp: pino.stdTimeFunctions.isoTime,
});
