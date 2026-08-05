import { useState } from 'react';
import DashboardChart from './DashboardChart.jsx';

export default function CapacitationChart({ series }) {
  const [code, setCode] = useState('CAPACITACOES_REALIZADAS');
  const selected = series.find((item) => item.code === code) || series[0];
  return <div className="capacitation-chart"><label>Métrica<select value={selected?.code || ''} onChange={(event) => setCode(event.target.value)}>{series.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><DashboardChart title="Capacitações" subtitle="Selecione uma métrica para preservar a leitura das escalas" type="bar" series={selected ? [selected] : []} /></div>;
}
