import { Filter } from 'lucide-react';

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function DashboardFilters({ filters, categories = [], onChange, onClear }) {
  const set = (name) => (event) => onChange({ ...filters, [name]: event.target.value });
  return <section className="dashboard-filters" aria-label="Filtros do dashboard">
    <span><Filter />Filtros</span>
    <label>Ano<select value={filters.year} onChange={set('year')}><option value="2025">2025</option></select></label>
    <label>Período<select value={filters.month} onChange={set('month')}><option value="">Ano completo</option>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
    <label>Categoria<select value={filters.category} onChange={set('category')}><option value="">Todas as categorias</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
    <label>Origem<select value={filters.sourceType} onChange={set('sourceType')}><option value="SPREADSHEET_IMPORT">Planilha oficial</option></select></label>
    <button className="filter-clear" onClick={onClear}>Limpar</button>
  </section>;
}
