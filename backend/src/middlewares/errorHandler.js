import { logger } from '../observability/logger.js';

export function errorHandler(error, _req, res, _next) {
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    return res.status(413).json({ message: 'A imagem é muito grande. Envie uma foto JPG, PNG ou WebP de até 2 MB.', code: 'PAYLOAD_TOO_LARGE' });
  }
  // Detect database connection failures (pg Pool AggregateError or direct ECONNREFUSED)
  try {
    const isDbConnRefused = error && (
      error.code === 'ECONNREFUSED' ||
      (Array.isArray(error.errors) && error.errors.some((e) => e && e.code === 'ECONNREFUSED'))
    );
    if (isDbConnRefused) {
      logger.error({ event: 'database_connection_refused', err: error }, 'PostgreSQL connection refused');
      return res.status(503).json({ message: 'O serviço está temporariamente indisponível. Tente novamente em alguns minutos.', code: 'SERVICE_UNAVAILABLE' });
    }
  } catch (e) {
    // ignore detection errors and continue to default handling
  }

  if (error && error.status) {
    if (error.details?.retryAfterSeconds) res.set('Retry-After', String(error.details.retryAfterSeconds));
    return res.status(error.status).json({
      message: error.message,
      code: error.code,
      ...error.details,
    });
  }
  if (error && error.code === '23505') return res.status(409).json({ message: 'O recurso já existe', code: 'RESOURCE_CONFLICT' });
  if (error && error.code === '23503') return res.status(422).json({ message: 'Um relacionamento informado é inválido', code: 'INVALID_RELATIONSHIP' });
  if (error && error.code === '22P02') return res.status(400).json({ message: 'Identificador ou valor inválido', code: 'INVALID_VALUE' });
  logger.error({ event: 'unhandled_request_error', err: error }, 'Unhandled request error');
  return res.status(500).json({
    message: process.env.NODE_ENV === 'production' ? 'Não foi possível concluir a operação. Tente novamente.' : (error?.message || 'Não foi possível concluir a operação. Tente novamente.'),
    code: 'INTERNAL_SERVER_ERROR',
  });
}
