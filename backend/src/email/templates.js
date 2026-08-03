const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character]));

const layout = (title, name, content, action) => ({
  text: `${title}\n\nOlá, ${name}.\n\n${content.text}\n\n${action ? `${action.label}: ${action.url}\n\n` : ''}Ágora Tech Park`,
  html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#14213d">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden">
    <tr><td style="background:#173fa2;color:#fff;padding:24px 30px;font-size:20px;font-weight:bold">Ágora Tech Park</td></tr>
    <tr><td style="padding:30px"><h1 style="font-size:22px;margin:0 0 20px">${escapeHtml(title)}</h1>
    <p>Olá, ${escapeHtml(name)}.</p><p style="line-height:1.6">${content.html}</p>
    ${action ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="background:#204bb7;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(action.label)}</a></p>
    <p style="color:#687489;font-size:12px;line-height:1.5">Se o botão não funcionar, copie e cole este link no navegador:<br><a href="${escapeHtml(action.url)}">${escapeHtml(action.url)}</a></p>` : ''}
    <p style="color:#687489;font-size:13px;line-height:1.5">${content.footer || ''}</p></td></tr>
    </table></td></tr></table></body></html>`,
});

export const verificationTemplate = ({ name, confirmationUrl, expiresHours }) => layout(
  'Confirme seu e-mail — Ágora Tech Park', name,
  {
    text: `Recebemos uma solicitação de acesso à Plataforma de Indicadores e Governança. Confirme seu endereço em até ${expiresHours} horas. A confirmação não libera acesso imediato: a solicitação ainda será analisada pela equipe do Ágora Tech Park. Se você não fez esta solicitação, ignore esta mensagem.`,
    html: `Recebemos uma solicitação de acesso à <strong>Plataforma de Indicadores e Governança</strong>. Confirme seu endereço em até <strong>${expiresHours} horas</strong>. A confirmação não libera acesso imediato: a solicitação ainda será analisada pela equipe do Ágora Tech Park.`,
    footer: 'Se você não fez esta solicitação, ignore esta mensagem. Nenhuma senha é enviada por e-mail.',
  },
  { label: 'Confirmar meu e-mail', url: confirmationUrl },
);

export const passwordResetTemplate = ({ name, resetUrl, expiresHours }) => layout(
  'Redefina sua senha', name,
  {
    text: `Recebemos uma solicita\u00e7\u00e3o para redefinir sua senha. Use o link em at\u00e9 ${expiresHours} hora(s). Se voc\u00ea n\u00e3o fez a solicita\u00e7\u00e3o, ignore esta mensagem.`,
    html: `Recebemos uma solicita\u00e7\u00e3o para redefinir sua senha. Use o link em at\u00e9 <strong>${expiresHours} hora(s)</strong>. Se voc\u00ea n\u00e3o fez a solicita\u00e7\u00e3o, ignore esta mensagem.`,
  },
  { label: 'Redefinir minha senha', url: resetUrl },
);

export const verifiedTemplate = ({ name }) => layout('E-mail confirmado', name, {
  text: 'Seu endereço foi confirmado e sua solicitação aguarda análise da equipe do Ágora Tech Park.',
  html: 'Seu endereço foi confirmado e sua solicitação agora aguarda análise da equipe do Ágora Tech Park.',
});

export const approvedTemplate = ({ name, loginUrl }) => layout('Solicitação aprovada', name, {
  text: 'Seu acesso foi liberado. Use a senha criada durante a solicitação para entrar.',
  html: 'Seu acesso foi liberado. Use a senha criada durante a solicitação para entrar. Por segurança, nunca enviamos senhas por e-mail.',
}, { label: 'Acessar a plataforma', url: loginUrl });

export const rejectedTemplate = ({ name }) => layout('Atualização sobre sua solicitação', name, {
  text: 'Após análise, sua solicitação de acesso não foi aprovada. Em caso de dúvidas, entre em contato com a equipe responsável.',
  html: 'Após análise, sua solicitação de acesso não foi aprovada. Em caso de dúvidas, entre em contato com a equipe responsável.',
});

export const inactiveTemplate = ({ name }) => layout('Acesso inativado', name, {
  text: 'Seu acesso foi inativado. Entre em contato com a equipe responsável caso precise de orientação.',
  html: 'Seu acesso foi inativado. Entre em contato com a equipe responsável caso precise de orientação.',
});
