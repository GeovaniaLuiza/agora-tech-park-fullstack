const allowed = ['TEXT', 'NUMBER', 'DECIMAL', 'OPTION'];

export function validateForm(req, res, next) {
  const { title, startDate, endDate } = req.body;
  if (req.method === 'POST' && (typeof title !== 'string' || title.trim().length < 3)) {
    return res.status(422).json({ message: 'Título inválido', code: 'INVALID_FORM_TITLE' });
  }
  if (title !== undefined && (typeof title !== 'string' || title.trim().length < 3)) {
    return res.status(422).json({ message: 'Título inválido', code: 'INVALID_FORM_TITLE' });
  }
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime())) || (start && end && start > end)) {
    return res.status(422).json({ message: 'Período inválido', code: 'INVALID_FORM_PERIOD' });
  }
  return next();
}

export function validateQuestion(req, res, next) {
  const { label, type } = req.body;
  if (req.method === 'POST' && (typeof label !== 'string' || label.trim().length < 3)) {
    return res.status(422).json({ message: 'Pergunta inválida', code: 'INVALID_QUESTION' });
  }
  if (label !== undefined && (typeof label !== 'string' || label.trim().length < 3)) {
    return res.status(422).json({ message: 'Pergunta inválida', code: 'INVALID_QUESTION' });
  }
  if (type !== undefined && !allowed.includes(type)) {
    return res.status(422).json({ message: 'Tipo inválido', code: 'INVALID_QUESTION_TYPE' });
  }
  return next();
}
