# ADR-0005: Usar Gmail SMTP via Nodemailer para e-mail de produção

- Status: Aceito
- Data: 2026-09-18

## Contexto

A aplicação envia e-mails transacionais e precisa de um provedor real em produção, mantendo o serviço local de captura de e-mails restrito ao desenvolvimento.

## Decisão

Usar Nodemailer com Gmail SMTP em produção. A conexão SMTP é verificada pela aplicação e o envio real foi validado no ambiente produtivo. Mailpit permanece exclusivo do desenvolvimento. Amazon SES não integra a arquitetura vigente.

## Consequências

- A configuração atende ao estágio atual sem introduzir outro serviço de e-mail na arquitetura.
- O envio de produção depende da disponibilidade e das políticas do Gmail/Google.
- Credenciais e configuração sensível do SMTP devem permanecer fora do repositório e dos logs.
- A conta emissora precisa ser mantida e monitorada. Uma eventual dependência de conta pessoal não é registrada como solução definitiva e exige avaliação futura.
- Mudança para outro provedor exige nova configuração e validação operacional.

## Alternativas consideradas

Mailpit é usado apenas no ambiente de desenvolvimento. Amazon SES é citado como fora da arquitetura vigente, sem rejeição definitiva ou comparação detalhada registrada.

## Evidências

- `docs/ARCHITECTURE.md`: Gmail SMTP em produção, Mailpit em desenvolvimento e SES fora da arquitetura vigente.
- `docs/CONFORMIDADE_TCC.md`: `nodemailer.verify()`, envio real e health de e-mail validados em produção.
- `backend/src/email/smtpProvider.js`: transporte SMTP com Nodemailer, verificação da conexão e envio de mensagens.
- `backend/src/services/emailService.js`: integração do provedor com os e-mails transacionais.
- `backend/src/config/environment.js`: exigência de configuração SMTP em produção quando o provedor selecionado é SMTP.
- `docker-compose.yml`: Mailpit limitado ao ambiente local de desenvolvimento.
