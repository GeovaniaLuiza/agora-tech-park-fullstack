import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import { logger } from '../observability/logger.js';

function safePath(url = '/') {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return '/invalid-url';
  }
}

export const requestLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    return requestId;
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, path: '[omitted]' }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customLogLevel(_req, res, error) {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  autoLogging: {
    ignore: (req) => ['/api/health/live', '/metrics'].includes(safePath(req.url)),
  },
});
