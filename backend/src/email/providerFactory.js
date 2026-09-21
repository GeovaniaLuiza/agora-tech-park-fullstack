import { createMockProvider } from './mockProvider.js';
import { createSmtpProvider, EmailConfigurationError } from './smtpProvider.js';

export function selectEmailProvider(environment = process.env) {
  const nodeEnvironment = environment.NODE_ENV || 'development';

  if (nodeEnvironment === 'test') return 'mock';
  if (nodeEnvironment === 'development') {
    const provider = environment.EMAIL_PROVIDER || 'mock';
    if (provider === 'mock' || provider === 'smtp') return provider;
  }
  if (nodeEnvironment === 'production' && environment.EMAIL_PROVIDER === 'smtp') return 'smtp';

  throw new EmailConfigurationError('EMAIL_PROVIDER_INVALID');
}

export function createEmailProvider(
  environment = process.env,
  providers = { mock: createMockProvider, smtp: createSmtpProvider },
) {
  return providers[selectEmailProvider(environment)](environment);
}
