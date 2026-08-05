import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendFormInvitation, sendVerification, setEmailProviderForTests } from '../src/services/emailService.js';

afterEach(() => {
  setEmailProviderForTests(undefined);
  vi.unstubAllEnvs();
});

describe('serviço de e-mail', () => {
  it('gera a URL de confirmação configurada e entrega HTML e texto ao provider', async () => {
    const provider = { send: vi.fn().mockResolvedValue({ accepted: ['pessoa@test.com'] }) };
    setEmailProviderForTests(provider);
    vi.stubEnv('FRONTEND_URL', 'https://plataforma.example/base');
    const rawToken = 'raw-token-with-more-than-thirty-two-characters';

    await sendVerification({ email: 'pessoa@test.com', name: 'Pessoa', rawToken });

    expect(provider.send).toHaveBeenCalledOnce();
    const message = provider.send.mock.calls[0][0];
    expect(message.to).toBe('pessoa@test.com');
    expect(message.text).toContain(`https://plataforma.example/confirmar-email?token=${rawToken}`);
    expect(message.html).toContain(`https://plataforma.example/confirmar-email?token=${rawToken}`);
    expect(message.text).not.toContain('password');
  });

  it('envia convite do formulário com link direto e prazo', async () => {
    const provider = { send: vi.fn().mockResolvedValue({ accepted: ['residente@test.com'] }) };
    setEmailProviderForTests(provider);
    vi.stubEnv('FRONTEND_URL', 'https://indicadores.example');

    await sendFormInvitation({
      email: 'residente@test.com', name: 'Residente', formId: 'form-123',
      formTitle: 'Coleta anual', deadline: '31/08/2026',
    });

    const message = provider.send.mock.calls[0][0];
    expect(message.to).toBe('residente@test.com');
    expect(message.subject).toContain('Coleta anual');
    expect(message.text).toContain('https://indicadores.example/resident/forms/form-123/respond');
    expect(message.text).toContain('31/08/2026');
  });
});
