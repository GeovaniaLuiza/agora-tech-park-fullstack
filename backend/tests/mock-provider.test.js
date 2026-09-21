import { describe, expect, it } from 'vitest';
import { createMockProvider } from '../src/email/mockProvider.js';

describe('mock email provider', () => {
  it('reports a controlled healthy result', async () => {
    const provider = createMockProvider();
    await expect(provider.verify()).resolves.toBe(true);
  });

  it('returns deterministic delivery data without external connection details', async () => {
    const provider = createMockProvider();
    const message = {
      to: 'person@example.test',
      subject: 'Sensitive subject',
      text: 'token=secret-token',
      html: '<a href="https://example.test/private">Private</a>',
    };

    const first = await provider.send(message);
    const second = await provider.sendMail(message);

    expect(first).toEqual(second);
    expect(first).toEqual({
      accepted: [],
      rejected: [],
      messageId: 'mock-message-id',
      response: 'mock-delivery',
    });
    expect(JSON.stringify(first)).not.toMatch(/secret-token|private|person@example/i);
  });
});
