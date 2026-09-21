# ADR-0005: Usar Gmail SMTP via Nodemailer para e-mail de produção

- Status: Aceito
- Data: 2026-09-18

## Contexto

A aplicação envia e-mails transacionais e precisa de um provedor real em produção, sem permitir que desenvolvimento ou testes acessem SMTP externo por padrão.

## Decisão

Usar Nodemailer com Gmail SMTP em produção. A conexão SMTP é verificada pela aplicação e o envio real foi validado no ambiente produtivo. DEV e testes usam provider mock controlado, sem conexão SMTP externa; testes sempre forçam esse provider. Amazon SES não integra a arquitetura vigente.

## Consequências

- A configuração atende ao estágio atual sem introduzir outro serviço de e-mail na arquitetura.
- O envio de produção depende da disponibilidade e das políticas do Gmail/Google.
- Credenciais e configuração sensível do SMTP devem permanecer fora do repositório e dos logs.
- A conta emissora precisa ser mantida e monitorada. Uma eventual dependência de conta pessoal não é registrada como solução definitiva e exige avaliação futura.
- Mudança para outro provedor exige nova configuração e validação operacional.

## Alternativas consideradas

Um serviço SMTP local de captura foi removido em favor do provider mock, que reduz dependências e impede entrega externa em DEV/test. Amazon SES é citado como fora da arquitetura vigente, sem rejeição definitiva ou comparação detalhada registrada.

## Evidências

- `docs/ARCHITECTURE.md`: Gmail SMTP em produção, mock em DEV/test e SES fora da arquitetura vigente.
- `docs/CONFORMIDADE_TCC.md`: `nodemailer.verify()`, envio real e health de e-mail validados em produção.
- `backend/src/email/smtpProvider.js`: transporte SMTP com Nodemailer, verificação da conexão e envio de mensagens.
- `backend/src/services/emailService.js`: integração do provedor com os e-mails transacionais.
- `backend/src/config/environment.js`: SMTP obrigatório em produção e mock admitido sem SMTP em DEV/test.
- `backend/src/email/providerFactory.js`: seleção centralizada e mock obrigatório em testes.
