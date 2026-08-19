import { Filter } from 'lucide-react';

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 1999 }, (_, index) => currentYear - index);

export default function DashboardFilters({ filters, centers = [], categories = [], onChange, onClear }) {
  const set = (name) => (event) => onChange({ ...filters, [name]: event.target.value });
  return <section className="dashboard-filters" aria-label="Filtros do dashboard">
    <span><Filter />Filtros</span>
    <label>Centro<select value={filters.centerId || ''} onChange={set('centerId')}>{centers.map((center) => <option value={center.id} key={center.id}>{center.name}</option>)}</select></label>
    <label>Ano<select value={filters.year} onChange={set('year')}>{years.map((year) => <option value={year} key={year}>{year}</option>)}</select></label>
    <label>Período<select value={filters.month} onChange={set('month')}><option value="">Ano completo</option>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
    <label>Categoria<select value={filters.category} onChange={set('category')}><option value="">Todas as categorias</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
    <label>Origem<select value={filters.sourceType} onChange={set('sourceType')}><option value="LIVE">Dados consolidados</option><option value="FORM_RESPONSE">Formulários</option><option value="MANUAL_ENTRY">Lançamentos manuais</option><option value="SYSTEM_CALCULATION">Cálculos do sistema</option><option value="SPREADSHEET_IMPORT">Planilha importada</option></select></label>
    <button className="filter-clear" onClick={onClear}>Limpar</button>
  </section>;
}
