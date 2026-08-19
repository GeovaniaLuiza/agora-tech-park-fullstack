import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { changeUserRole, changeUserStatus, createUser, deleteUser, getOrganizations, getUsers } from '../services/api.js';

const roles = [['ADMIN', 'Administrador'], ['PESQUISADOR', 'Pesquisador'], ['GESTOR', 'Gestor'], ['RESIDENTE', 'Residente']];
const empty = { name: '', email: '', role: 'RESIDENTE', organizationId: '' };

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const [processingId, setProcessingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(() => getUsers().then(setUsers).catch((reason) => setError(reason.message)), []);
  useEffect(() => { void load(); getOrganizations().then(setOrganizations).catch((reason) => setError(reason.message)); }, [load]);
  const visible = useMemo(() => users.filter((item) => `${item.name} ${item.email} ${item.role}`.toLowerCase().includes(search.toLowerCase())), [users, search]);
  const change = async (id, operation) => {
    setProcessingId(id); setError(''); setMessage('');
    try { await operation(); await load(); setMessage('Usuário atualizado com sucesso.'); }
    catch (reason) { setError(reason.message); } finally { setProcessingId(''); }
  };
  const remove = async (item) => {
    if (!window.confirm(`Excluir o usuário ${item.name}? O acesso será removido e o histórico preservado.`)) return;
    setProcessingId(item.id); setError(''); setMessage('');
    try { await deleteUser(item.id); setUsers((current) => current.filter((user) => user.id !== item.id)); setMessage('Usuário excluído com sucesso.'); }
    catch (reason) { setError(reason.message); } finally { setProcessingId(''); }
  };
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const created = await createUser({ ...form, organizationId: form.role === 'RESIDENTE' ? form.organizationId : null });
      setForm(null); await load();
      setMessage(created.invitationSent ? 'Usuário criado. O convite para definir a senha foi enviado.' : 'Usuário criado, mas o convite por e-mail não foi entregue. Ele pode usar “Esqueci a senha”.');
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  };
  return <div className="content admin-users-page">
    <div className="toolbar"><label className="field-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuário..." /></label><button className="button primary push" onClick={() => setForm({ ...empty })}><Plus />Cadastrar usuário</button></div>
    {error && <div className="error" role="alert">{error}</div>}{message && <div className="success-message" role="status">{message}</div>}
    <section className="panel history">{visible.map((item) => <div className="history-row" key={item.id}><div><strong>{item.name}</strong><small>{item.email} · {item.status}{item.organizations?.length ? ` · ${item.organizations.map((organization) => organization.name).join(', ')}` : ''}</small></div><select className="profile-select" aria-label={`Perfil de ${item.name}`} disabled={processingId === item.id} value={item.role || ''} onChange={(event) => change(item.id, () => changeUserRole(item.id, event.target.value))}><option value="" disabled>Sem perfil</option>{roles.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{item.status === 'ACTIVE' ? <button className="button secondary" disabled={processingId === item.id} onClick={() => change(item.id, () => changeUserStatus(item.id, 'INACTIVE'))}>Inativar</button> : item.status === 'INACTIVE' && <button className="button primary" disabled={processingId === item.id} onClick={() => change(item.id, () => changeUserStatus(item.id, 'ACTIVE'))}>Ativar</button>}{String(item.id) !== String(localStorage.getItem('userId')) && <button className="button danger" disabled={processingId === item.id} onClick={() => remove(item)}>Excluir</button>}</div>)}{!visible.length && <div className="empty-state">Nenhum usuário encontrado.</div>}</section>
    {form && <div className="management-modal"><form className="panel managed-user-form" onSubmit={save}><header><div><span>ADMINISTRAÇÃO</span><h2>Cadastrar usuário</h2></div><button type="button" onClick={() => setForm(null)} aria-label="Fechar"><X /></button></header><label>Nome<input required minLength="3" maxLength="150" pattern="[\p{L}\p{M}][\p{L}\p{M} .'’-]*" title="Use apenas letras, espaços, apóstrofo, ponto ou hífen." value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>E-mail<input required type="email" maxLength="254" pattern="[^\s@]+@[^\s@]+\.[^\s@]{2,}" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Perfil<select className="profile-select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value, organizationId: event.target.value === 'RESIDENTE' ? form.organizationId : '' })}>{roles.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{form.role === 'RESIDENTE' && <label>Organização<select required value={form.organizationId} onChange={(event) => setForm({ ...form, organizationId: event.target.value })}><option value="">Selecione</option>{organizations.filter((item) => item.status !== 'INACTIVE').map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}<p className="span-2">O usuário receberá um link seguro para definir a própria senha.</p><footer><button type="button" className="button secondary" onClick={() => setForm(null)}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? 'Cadastrando...' : 'Cadastrar'}</button></footer></form></div>}
  </div>;
}
