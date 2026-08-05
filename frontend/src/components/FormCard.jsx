import { Copy, Pencil, Trash2 } from 'lucide-react';

export default function FormCard({ form, onEdit, onRespond, onDuplicate, onArchive, resident = false }) {
  const responses = Number(form.responses ?? form.response_count ?? 0);
  const total = Number(form.total ?? form.recipient_count ?? 0);
  const ratio = total ? Math.round((responses / total) * 100) : 0;
  const status = form.status || 'DRAFT';
  const statusLabel = { ACTIVE: 'Ativo', CLOSED: 'Finalizado', DRAFT: 'Rascunho', ARCHIVED: 'Arquivado' }[status] || status;
  return (
    <article className="form-card">
      <div className="form-card-title">
        <h3>{form.title}</h3>
        <span className={`status ${status.toLowerCase()}`}>{statusLabel}</span>
      </div>
      <p>Período: {form.period || '—'} · {form.owner || 'Não informado'}</p>
      <div className="response-label"><span>Respostas</span><b>{ratio}% · {responses}/{total}</b></div>
      <div className="progress"><i style={{ width: `${ratio}%` }} /></div>
      <div className="form-actions">
        {resident
          ? <button className="respond-action" onClick={() => onRespond(form.id)}>Responder formulário</button>
          : <>
            <button onClick={onEdit} disabled={status !== 'DRAFT'}><Pencil />Editar</button>
            <button onClick={onDuplicate}><Copy />Duplicar</button>
            <button className="danger" aria-label="Arquivar formulário" onClick={onArchive}><Trash2 /></button>
          </>}
      </div>
    </article>
  );
}
