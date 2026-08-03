export function errorHandler(error, _req, res, _next) {
  if (error.status) {
    if (error.details?.retryAfterSeconds) res.set('Retry-After', String(error.details.retryAfterSeconds));
    return res.status(error.status).json({
      message: error.message,
      code: error.code,
      ...error.details,
    });
  }
  if (error.code === '23505') return res.status(409).json({ message: 'O recurso já existe', code: 'RESOURCE_CONFLICT' });
  if (error.code === '23503') return res.status(422).json({ message: 'Um relacionamento informado é inválido', code: 'INVALID_RELATIONSHIP' });
  if (error.code === '22P02') return res.status(400).json({ message: 'Identificador ou valor inválido', code: 'INVALID_VALUE' });
  console.error(error);
  return res.status(500).json({ message: 'Erro interno do servidor' });
}
