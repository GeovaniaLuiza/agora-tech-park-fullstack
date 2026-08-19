import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../src/config/environment.js';

const valid = {
  NODE_ENV: 'production',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/agora',
  JWT_SECRET: 'a'.repeat(32),
  CLIENT_URL: 'https://app.example.org',
  FRONTEND_URL: 'https://app.example.org',
  METRICS_TOKEN: 'b'.repeat(32),
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.example.org',
};

describe('validateEnvironment', () => {
  it('accepts a complete production configuration', () => {
    expect(validateEnvironment(valid).PORT).toBe(3000);
  });

  it('rejects placeholder production secrets without exposing them', () => {
    expect(() => validateEnvironment({ ...valid, JWT_SECRET: 'troque-esta-chave-em-producao-1234' }))
      .toThrow(/Production secrets/);
  });

  it('requires SMTP configuration in production', () => {
    expect(() => validateEnvironment({ ...valid, SMTP_HOST: undefined })).toThrow(/SMTP_HOST/);
  });
});
