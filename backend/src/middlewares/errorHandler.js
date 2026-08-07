export function errorHandler(error, _req, res, _next) {
  // Detect database connection failures (pg Pool AggregateError or direct ECONNREFUSED)
  try {
    const isDbConnRefused = error && (
      error.code === 'ECONNREFUSED' ||
      (Array.isArray(error.errors) && error.errors.some((e) => e && e.code === 'ECONNREFUSED'))
    );
    if (isDbConnRefused) {
      console.error('[db] conexão recusada:', error);
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
  console.error(error);
  return res.status(500).json({ message: 'Erro interno do servidor' });
}
