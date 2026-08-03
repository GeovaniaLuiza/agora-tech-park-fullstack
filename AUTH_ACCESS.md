# Autenticação, solicitação de acesso e RBAC

## Fluxos

- O frontend restaura a sessão por `GET /api/auth/me`.
- O token fica no `sessionStorage` por padrão e no `localStorage` somente quando “Lembrar-me” está marcado.
- O cadastro público sempre cria uma conta `RESIDENTE` com status `EMAIL_PENDING`.
- Um token aleatório de uso único é enviado por e-mail; somente seu hash SHA-256 é armazenado.
- Após a confirmação, a conta passa para `PENDING` e fica disponível para análise administrativa.
- Somente contas com e-mail confirmado e status `ACTIVE` podem autenticar.
- Somente `ADMIN` pode aprovar, rejeitar, alterar perfil/status e confirmar o vínculo com uma organização.
- O backend revalida perfil e status no PostgreSQL em cada requisição autenticada.
- Um `RESIDENTE` só consulta ou envia respostas para organizações presentes em `users_organizations`.

## Endpoints

| Método | Rota | Acesso |
| --- | --- | --- |
| POST | `/api/auth/login` | Público |
| POST | `/api/auth/register-request` | Público, 5 solicitações/hora/IP |
| POST | `/api/auth/verify-email` | Público, 20 tentativas/15 minutos/IP |
| POST | `/api/auth/resend-verification` | Público, 5 solicitações/hora/IP |
| GET | `/api/auth/me` | Autenticado |
| GET | `/api/admin/access-requests` | ADMIN |
| POST | `/api/admin/access-requests/:id/approve` | ADMIN |
| POST | `/api/admin/access-requests/:id/reject` | ADMIN |
| PATCH | `/api/admin/users/:id/status` | ADMIN |
| PATCH | `/api/admin/users/:id/role` | ADMIN |
| POST | `/api/admin/users/:id/organizations` | ADMIN |

## Migration obrigatória

Para um banco que já possui a migration `001`:

```powershell
Get-Content database/migrations/002_auth_access_control.sql |
  docker compose exec -T postgres psql -U agora -d agora_indicadores
Get-Content database/migrations/003_email_identity.sql |
  docker compose exec -T postgres psql -U agora -d agora_indicadores
Get-Content database/migrations/004_email_verification.sql |
  docker compose exec -T postgres psql -U agora -d agora_indicadores
```

Em uma instalação nova, `docker compose up -d` executa `001`, `002`, `003`, `004` e o seed nessa ordem.

A migration `003_email_identity.sql` adiciona unicidade case-insensitive para e-mails.
A migration `004_email_verification.sql` adiciona o status `EMAIL_PENDING`, `email_verified_at` e a tabela de tokens.

## Configuração de e-mail

O backend envia mensagens por SMTP por meio de um serviço desacoplado. Configure as variáveis documentadas em `backend/.env.example`: `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `FRONTEND_URL`, `EMAIL_VERIFICATION_TTL_HOURS` e `EMAIL_RESEND_MINUTES`.

Não existe fallback por console ou provedor simulado. Sem SMTP válido, o cadastro permanece em `EMAIL_PENDING`, a falha é auditada e o usuário pode tentar o reenvio posteriormente.

## Validação

```powershell
npm.cmd test --prefix backend
npm.cmd test --prefix frontend
npm.cmd run build --prefix frontend
```

Não há script de lint configurado neste projeto.
