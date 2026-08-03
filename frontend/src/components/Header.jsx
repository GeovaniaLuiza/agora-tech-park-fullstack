import { Bell, Menu, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function Header({ title, subtitle, setOpen }) {
  const { user } = useAuth();
  const name = user?.name || 'Marina Ribeiro';
  const initials = name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return (
    <header className="topbar">
      <button className="menu-button" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu /></button>
      <div className="heading"><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="top-actions">
        <label className="global-search"><Search /><input placeholder="Buscar formulários, residentes..." /></label>
        <button className="bell" aria-label="Notificações"><Bell /><i /></button>
        <span className="avatar">{initials}</span>
        <div className="profile"><strong>{name}</strong><span>{user?.role || 'Pesquisadora'}</span></div>
      </div>
    </header>
  );
}
