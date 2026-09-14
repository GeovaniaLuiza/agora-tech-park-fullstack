import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('keeps submitted values and error details out of emitted logs', () => {
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { logger } from './src/observability/logger.js';
    const marker = 'private-synthetic-value@example.test';
    const err = new Error(marker);
    err.detail = marker;
    err.cause = new Error(marker);
    logger.error({ event: 'privacy_test', err, email: marker, cpf: marker,
      cnpj: marker, jwt: marker, password: marker, token: marker,
      req: { body: { nested: marker }, file: { buffer: marker },
        headers: { authorization: marker, cookie: marker } } });
  `], { cwd: new URL('..', import.meta.url), env: { ...process.env, LOG_LEVEL: 'info' }, encoding: 'utf8' });
  expect(output).not.toContain('private-synthetic-value');
  expect(JSON.parse(output).event).toBe('privacy_test');
  expect(JSON.parse(output).err.type).toBe('Error');
});
