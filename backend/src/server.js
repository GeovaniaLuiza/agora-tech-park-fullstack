import 'dotenv/config';
import app from './app.js';
import { classifyEmailError, EmailConfigurationError } from './email/smtpProvider.js';
import { verifyConnection } from './services/emailService.js';
const port = process.env.PORT || 3002;

async function start() {
  try {
    await verifyConnection();
    console.info('[email] Conexão SMTP validada');
  } catch (error) {
    console.error(`[email] Serviço SMTP indisponível (${classifyEmailError(error)})`);
    if (process.env.NODE_ENV === 'production' && error instanceof EmailConfigurationError) throw error;
  }
  app.listen(port, () => console.log(`API em http://localhost:${port}`));
}

start().catch(() => {
  console.error('[startup] Não foi possível iniciar a API por configuração inválida');
  process.exitCode = 1;
});
