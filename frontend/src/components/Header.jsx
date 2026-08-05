import { useEffect, useState } from 'react';
import { Bell, Menu, Search, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { getNotifications, markNotificationRead } from '../services/api.js';

export default function Header({ title, subtitle, setOpen }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const name = user?.name || 'Marina Ribeiro';
  const initials = name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const roleLabel = { ADMIN: 'Administradora', PESQUISADOR: 'Pesquisadora', GESTOR: 'Gestora', RESIDENTE: 'Residente' }[user?.role] || 'Sem perfil';
  useEffect(() => {
    getNotifications().then(setNotifications).catch(() => setNotifications([]));
  }, []);
  const openNotification = async (notification) => {
    if (!notification.read_at) {
      try {
        const updated = await markNotificationRead(notification.id);
        setNotifications((items) => items.map((item) => item.id === updated.id ? updated : item));
      } catch { /* a navegação continua mesmo se a leitura não puder ser registrada */ }
    }
    setNotificationsOpen(false);
    if (notification.link) navigate(notification.link);
  };
  return (
    <header className="topbar">
      <button className="menu-button" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu /></button>
      <div className="heading"><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="top-actions">
        <label className="global-search"><Search /><input placeholder="Buscar formulários, residentes..." /></label>
        <div className="notification-area">
          <button className="bell" aria-label="Notificações" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((current) => !current)}><Bell />{notifications.some((item) => !item.read_at) && <i />}</button>
          {notificationsOpen && <section className="header-popover notification-popover" aria-label="Painel de notificações">
            <strong>Notificações</strong>
            {notifications.map((notification) => <button className={notification.read_at ? '' : 'unread'} key={notification.id} onClick={() => openNotification(notification)}><strong>{notification.title}</strong><span>{notification.message}</span></button>)}
            {!notifications.length && <p>Nenhuma notificação nova.</p>}
            {user?.role === 'ADMIN' && <button onClick={() => { setNotificationsOpen(false); navigate('/admin/solicitacoes'); }}>Ver solicitações de acesso</button>}
          </section>}
        </div>
        <button className="profile-button" aria-label="Abrir meu perfil" onClick={() => navigate('/perfil')}>
          <span className="avatar">{initials}</span>
          <span className="profile"><strong>{name}</strong><span>{roleLabel}</span></span>
          <UserRound className="profile-icon" />
        </button>
      </div>
    </header>
  );
}
