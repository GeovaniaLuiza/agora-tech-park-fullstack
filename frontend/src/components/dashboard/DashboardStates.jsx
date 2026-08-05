export function LoadingState({ cards = 4, label = 'Carregando dados' }) {
  return <div className="dashboard-skeleton" role="status" aria-label={label}>{Array.from({ length: cards }, (_, index) => <i key={index} />)}</div>;
}

export function EmptyState({ onClear }) {
  return <div className="panel dashboard-state"><h3>Nenhum dado encontrado</h3><p>Não há indicadores para os filtros selecionados.</p>{onClear && <button className="button secondary" onClick={onClear}>Limpar filtros</button>}</div>;
}

export function ErrorState({ message, onRetry }) {
  return <div className="panel dashboard-state error-state" role="alert"><h3>Não foi possível carregar esta seção</h3><p>{message}</p><button className="button secondary" onClick={onRetry}>Tentar novamente</button></div>;
}
