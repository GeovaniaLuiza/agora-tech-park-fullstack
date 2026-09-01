import { BarChart3, Building2, CalendarDays, ClipboardList, Database, History, LayoutDashboard, LogOut, Settings, ShieldCheck, Users, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

const entries = [
  ['/dashboard', 'Dashboard', LayoutDashboard, ['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE']],
  ['/forms', 'Formulários', ClipboardList, ['ADMIN', 'PESQUISADOR']],
  ['/indicators', 'Indicadores', BarChart3, ['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE']],
  ['/indicadores/importar-eventos', 'Importar eventos', CalendarDays, ['ADMIN', 'PESQUISADOR']],
  ['/indicadores/importar-residentes', 'Importar residentes', Building2, ['ADMIN', 'PESQUISADOR']],
  ['/indicators/catalog', 'Cadastro de indicadores', Database, ['ADMIN', 'PESQUISADOR']],
  ['/organizations', 'Organizações', Users, ['ADMIN', 'PESQUISADOR', 'GESTOR']],
  ['/admin/solicitacoes', 'Solicitações', ShieldCheck, ['ADMIN']],
  ['/admin/usuarios', 'Usuários', Users, ['ADMIN']],
  ['/admin/auditoria', 'Auditoria', History, ['ADMIN']],
  ['/residente', 'Formulários', ClipboardList, ['RESIDENTE']],
  ['/resident/history', 'Histórico', History, ['RESIDENTE']],
];

export default function Sidebar({ open, setOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const go = (path) => { navigate(path); setOpen(false); };
  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }); };
  return <aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="brand"><span className="brand-mark">Á</span><span>Ágora Tech Park<small>Centro de Inovação</small></span><button className="mobile-close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X /></button></div>
    <nav>{entries.filter((entry) => entry[3].includes(user.role)).map(([path, label, Icon]) => <button key={path} className={pathname === path ? 'active' : ''} onClick={() => go(path)}><Icon />{label}</button>)}</nav>
    <div className="side-bottom"><button onClick={() => go('/perfil')}><Settings />Configurações</button><button onClick={handleLogout}><LogOut />Sair</button></div>
  </aside>;
}
