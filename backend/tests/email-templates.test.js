import { describe, expect, it } from 'vitest';
import { approvedTemplate, formInvitationTemplate, verificationTemplate } from '../src/email/templates.js';

describe('templates institucionais de e-mail', () => {
  it('gera confirmação HTML e texto com prazo, análise posterior e link alternativo', () => {
    const confirmationUrl = 'https://plataforma.example/confirmar-email?token=token-publico';
    const template = verificationTemplate({ name: 'Pessoa <Teste>', confirmationUrl, expiresHours: 24 });

    expect(template.text).toContain('Plataforma de Indicadores e Governança');
    expect(template.text).toContain('não libera acesso imediato');
    expect(template.text).toContain(confirmationUrl);
    expect(template.html).toContain('Confirmar meu e-mail');
    expect(template.html).toContain('copie e cole este link');
    expect(template.html).not.toContain('Pessoa <Teste>');
  });

  it('informa aprovação sem incluir ou redefinir senha', () => {
    const template = approvedTemplate({ name: 'Pessoa', loginUrl: 'https://plataforma.example/login' });

    expect(template.text).toContain('Acessar a plataforma');
    expect(template.html).not.toMatch(/senha temporária|redefinir senha/i);
  });

  it('escapa dados do convite e inclui alternativa textual', () => {
    const template = formInvitationTemplate({
      name: 'Pessoa <Teste>', formTitle: 'Indicadores <2026>', deadline: '31/08/2026',
      formUrl: 'https://plataforma.example/resident/forms/1/respond',
    });
    expect(template.html).toContain('Indicadores &lt;2026&gt;');
    expect(template.html).not.toContain('Pessoa <Teste>');
    expect(template.text).toContain('Responder formulário');
  });
});
