import { BarChart3, ClipboardList, FileText, Users } from 'lucide-react';
import StatCard from '../StatCard.jsx';

export default function OperationalSummary({ data }) {
  return <section aria-labelledby="operational-title"><div className="section-heading"><div><span>OPERAÇÃO DO SISTEMA</span><h2 id="operational-title">Visão operacional atual</h2></div><small>Os dados operacionais refletem o estado atual do sistema.</small></div><div className="stats">
    <StatCard label="Residentes ativos" value={data.active_organizations} icon={<Users />} />
    <StatCard label="Formulários ativos" value={data.active_forms} icon={<FileText />} tone="green" />
    <StatCard label="Taxa de resposta" value={`${data.response_rate}%`} icon={<ClipboardList />} tone="sand" />
    <StatCard label="Indicadores monitorados" value={data.monitored_indicators} icon={<BarChart3 />} />
  </div></section>;
}
