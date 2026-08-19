import 'dotenv/config';
import app from './app.js';
import { classifyEmailError, EmailConfigurationError } from './email/smtpProvider.js';
import { verifyConnection } from './services/emailService.js';
import { shutdown } from './db/pool.js';
import { logger } from './observability/logger.js';
import { validateEnvironment } from './config/environment.js';

async function start() {
  const config = validateEnvironment();
  try {
    await verifyConnection();
    logger.info({ event: 'smtp_connection_verified' }, 'SMTP connection verified');
  } catch (error) {
    logger.warn({ event: 'smtp_unavailable', reason: classifyEmailError(error) }, 'SMTP service unavailable');
    if (process.env.NODE_ENV === 'production' && error instanceof EmailConfigurationError) throw error;
  }
  const server = app.listen(config.PORT, () => logger.info({ event: 'api_started', port: config.PORT }, 'API started'));

  const stop = async (signal) => {
    logger.info({ event: 'api_stopping', signal }, 'Graceful shutdown started');
    server.close(async () => {
      await shutdown();
      logger.info({ event: 'api_stopped' }, 'Graceful shutdown completed');
      process.exitCode = 0;
    });
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
}

start().catch((error) => {
  logger.fatal({ event: 'api_start_failed', err: error }, 'API failed to start');
  process.exitCode = 1;
});
