import { useCallback, useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Building2, Download, GraduationCap, Landmark, Rocket, Users, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DashboardFilters from '../components/dashboard/DashboardFilters.jsx';
import KpiCard from '../components/dashboard/KpiCard.jsx';
import DashboardChart from '../components/dashboard/DashboardChart.jsx';
import OperationalSummary from '../components/dashboard/OperationalSummary.jsx';
import CapacitationChart from '../components/dashboard/CapacitationChart.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/dashboard/DashboardStates.jsx';
import { formatDate } from '../utils/formatters.js';
import {
  downloadDashboardSpreadsheet, getDashboardCompanies, getDashboardEngagement,
  getDashboardFinancial, getDashboardProjects, getInstitutionalDashboard,
  getOperationalDashboard,
} from '../services/api.js';

const initialFilters = { year: '2025', month: '', category: '', sourceType: 'SPREADSHEET_IMPORT' };
const icons = {
  EMPRESAS_ATIVAS_TOTAL: <Building2 />, NOVAS_EMPRESAS_ATIVAS: <BriefcaseBusiness />,
  STARTUPS_ATIVAS: <Rocket />, COLABORADORES_EMPRESAS: <Users />, OCUPACAO_PREDIO: <Landmark />,
  PROJETOS_SUBMETIDOS: <BriefcaseBusiness />, PROJETOS_GANHOS: <BriefcaseBusiness />,
  VALOR_PROJETOS_GANHOS: <WalletCards />, VISITANTES_CENTRO: <Users />,
  RECEITA_TOTAL_CENTRO: <WalletCards />, DESPESAS_TOTAL_CENTRO: <WalletCards />,
  RESULTADO_ANUAL_CENTRO: <WalletCards />, CAPACITACOES_REALIZADAS: <GraduationCap />,
  EMPRESAS_CAPACITADAS: <GraduationCap />, PESSOAS_CAPACITADAS: <GraduationCap />,
  PROGRAMAS_INICIADOS: <Rocket />, FUNCOES_ATIVAS: <Users />,
};

const sectionInitial = { loading: true, data: null, error: '' };

export default function DashboardPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(initialFilters);
  const [operational, setOperational] = useState(sectionInitial);
  const [sections, setSections] = useState({ institutional: sectionInitial, companies: sectionInitial, financial: sectionInitial, projects: sectionInitial, engagement: sectionInitial });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const query = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')), [filters]);
  const loadOperational = useCallback(() => {
    setOperational(sectionInitial);
    getOperationalDashboard().then((data) => setOperational({ loading: false, data, error: '' })).catch((error) => setOperational({ loading: false, data: null, error: error.message }));
  }, []);
  const loadSection = useCallback((name, request) => {
    setSections((current) => ({ ...current, [name]: sectionInitial }));
    request(query).then((data) => setSections((current) => ({ ...current, [name]: { loading: false, data, error: '' } }))).catch((error) => setSections((current) => ({ ...current, [name]: { loading: false, data: null, error: error.message } })));
  }, [query]);
  const loadInstitutional = useCallback(() => loadSection('institutional', getInstitutionalDashboard), [loadSection]);
  const loadCompanies = useCallback(() => loadSection('companies', getDashboardCompanies), [loadSection]);
  const loadFinancial = useCallback(() => loadSection('financial', getDashboardFinancial), [loadSection]);
  const loadProjects = useCallback(() => loadSection('projects', getDashboardProjects), [loadSection]);
  const loadEngagement = useCallback(() => loadSection('engagement', getDashboardEngagement), [loadSection]);

  useEffect(() => { loadOperational(); }, [loadOperational]);
  useEffect(() => { loadInstitutional(); loadCompanies(); loadFinancial(); loadProjects(); loadEngagement(); }, [loadInstitutional, loadCompanies, loadFinancial, loadProjects, loadEngagement]);

  const clearFilters = () => setFilters(initialFilters);
  const exportReport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const report = await downloadDashboardSpreadsheet();
      const url = URL.createObjectURL(report.blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = report.filename; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error.message || 'Não foi possível exportar o relatório.');
    } finally { setExporting(false); }
  };

  const companies = sections.companies.data?.series || [];
  const financial = sections.financial.data?.series || [];
  const projects = sections.projects.data?.series || [];
  const engagement = sections.engagement.data?.series || [];
  return <div className="content executive-dashboard">
    <div className="dashboard-page-head"><div><span>PAINEL EXECUTIVO</span><h2>Centro de Inovação de Joinville</h2><p>Resultados institucionais consolidados e operação da plataforma.</p></div><div className="dashboard-head-actions"><small>Última atualização: {formatDate(sections.institutional.data?.lastUpdate)}</small><button className="button secondary" disabled={exporting} onClick={exportReport}><Download />{exporting ? 'Exportando...' : 'Exportar relatório'}</button></div></div>
    <DashboardFilters filters={filters} categories={sections.institutional.data?.categories || []} onChange={setFilters} onClear={clearFilters} />
    {exportError && <div className="error" role="alert">{exportError}</div>}

    {operational.loading ? <LoadingState /> : operational.error ? <ErrorState message={operational.error} onRetry={loadOperational} /> : <OperationalSummary data={operational.data} />}

    <section aria-labelledby="institutional-title"><div className="section-heading"><div><span>FONTE OFICIAL · CI JOINVILLE</span><h2 id="institutional-title">Indicadores institucionais — {filters.year}</h2></div><small>{sections.institutional.data?.source?.fileName || 'Planilha institucional'}</small></div>
      {sections.institutional.loading ? <LoadingState cards={8} /> : sections.institutional.error ? <ErrorState message={sections.institutional.error} onRetry={loadInstitutional} /> : !sections.institutional.data?.cards.length ? <EmptyState onClear={clearFilters} /> : <div className="institutional-grid">{sections.institutional.data.cards.map((item) => <KpiCard item={item} icon={icons[item.code] || <Landmark />} key={item.code} />)}</div>}
    </section>

    <section aria-labelledby="charts-title"><div className="section-heading"><div><span>SÉRIES MENSAIS</span><h2 id="charts-title">Evolução dos indicadores</h2></div></div>
      <div className="dashboard-chart-grid">
        {sections.companies.loading ? <LoadingState cards={2} /> : sections.companies.error ? <ErrorState message={sections.companies.error} onRetry={loadCompanies} /> : <><DashboardChart title="Evolução das empresas ativas" series={companies.filter((item) => item.code === 'EMPRESAS_ATIVAS_TOTAL')} /><DashboardChart title="Novas empresas por mês" type="bar" series={companies.filter((item) => item.code === 'NOVAS_EMPRESAS_ATIVAS')} /></>}
        {sections.projects.loading ? <LoadingState cards={1} /> : sections.projects.error ? <ErrorState message={sections.projects.error} onRetry={loadProjects} /> : <DashboardChart title="Projetos submetidos e ganhos" type="bar" series={projects.filter((item) => ['PROJETOS_SUBMETIDOS', 'PROJETOS_GANHOS'].includes(item.code))} />}
        {sections.financial.loading ? <LoadingState cards={1} /> : sections.financial.error ? <ErrorState message={sections.financial.error} onRetry={loadFinancial} /> : <DashboardChart title="Receita, despesas e resultado" series={financial} />}
        {sections.engagement.loading ? <LoadingState cards={2} /> : sections.engagement.error ? <ErrorState message={sections.engagement.error} onRetry={loadEngagement} /> : <><DashboardChart title="Visitantes por mês" type="bar" series={engagement.filter((item) => item.code === 'VISITANTES_CENTRO')} /><CapacitationChart series={engagement.filter((item) => ['CAPACITACOES_REALIZADAS', 'EMPRESAS_CAPACITADAS', 'PESSOAS_CAPACITADAS'].includes(item.code))} /></>}
      </div>
    </section>
    <div className="dashboard-footer-link"><button className="button secondary" onClick={() => navigate('/indicators')}>Ver todos os indicadores</button></div>
  </div>;
}
