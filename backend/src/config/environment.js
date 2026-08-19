import { z } from 'zod';

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CLIENT_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  METRICS_TOKEN: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['smtp', 'mock']).default('smtp'),
  SMTP_HOST: z.string().optional(),
});

function isPlaceholder(value) {
  return !value || /troque|change-me|example|sua-chave/i.test(value);
}

export function validateEnvironment(environment = process.env) {
  const result = baseSchema.safeParse(environment);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new Error(`Invalid environment configuration. Review: ${fields}`);
  }

  const config = result.data;
  if (!/^postgres(?:ql)?:\/\//.test(config.DATABASE_URL)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }

  if (config.NODE_ENV === 'production') {
    const invalidSecrets = [config.JWT_SECRET, config.METRICS_TOKEN].some(isPlaceholder);
    if (invalidSecrets || config.METRICS_TOKEN.length < 32) {
      throw new Error('Production secrets are missing, placeholders, or shorter than 32 characters.');
    }
    if (config.EMAIL_PROVIDER === 'smtp' && !config.SMTP_HOST) {
      throw new Error('SMTP_HOST is required when EMAIL_PROVIDER=smtp in production.');
    }
  }

  return config;
}

