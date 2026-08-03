import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { approveAccessRequest, getAccessRequests, getOrganizations, rejectAccessRequest } from '../services/api';

export default function AdminRequestsPage() {
  const [items, setItems] = useState([]);
  const [roles, setRoles] = useState({});
  const [organizations, setOrganizations] = useState([]);
  const [organizationChoices, setOrganizationChoices] = useState({});
  const [reasons, setReasons] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState('');
  const load = useCallback(async () => {
    try {
      const [requests, availableOrganizations] = await Promise.all([getAccessRequests(), getOrganizations()]);
      setItems(requests);
      setOrganizations(availableOrganizations);
      setError('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const approve = async (item) => {
    setProcessingId(item.id); setError('');
    try {
      const role = roles[item.id];
      const organizationChoice = organizationChoices[item.id];
      if (!role) throw new Error('Defina o perfil antes de aprovar.');
      if (role === 'RESIDENTE' && !organizationChoice) throw new Error('Selecione ou crie uma organização para o residente.');
      await approveAccessRequest(item.id, {
        role,
        ...(organizationChoice === '__create__'
          ? { createOrganization: true, organizationName: item.requested_company_name }
          : organizationChoice ? { organizationId: organizationChoice } : {}),
      });
      await load();
    } catch (reason) { setError(reason.message); }
    finally { setProcessingId(''); }
  };
  const reject = async (id) => {
    setProcessingId(id); setError('');
    try {
      const reason = reasons[id]?.trim();
      if (!reason) throw new Error('Informe a justificativa administrativa da rejeição.');
      await rejectAccessRequest(id, reason);
      await load();
    }
    catch (reason) { setError(reason.message); }
    finally { setProcessingId(''); }
  };
  if (loading) return <div className="content">Carregando solicitações...</div>;
  return <div className="content"><div className="page-intro"><h2>Solicitações de acesso</h2><p>Defina o perfil e os vínculos antes de liberar o acesso.</p></div>{error && <div className="error" role="alert" aria-live="assertive">{error}</div>}<article className="panel admin-list">{items.length === 0 ? <p>Nenhuma solicitação pendente.</p> : items.map((item) => <div className="admin-row" key={item.id}>
    <div><strong>{item.name}</strong><span>{item.email}</span><small>{item.requested_company_name} · CNPJ {item.requested_company_cnpj}</small></div>
    <span className="status pendente">E-mail confirmado</span>
    <label>Perfil<select aria-label={`Perfil de ${item.name}`} disabled={processingId === item.id} value={roles[item.id] || ''} onChange={(event) => setRoles((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Selecione</option><option value="RESIDENTE">Residente</option><option value="GESTOR">Gestor</option><option value="PESQUISADOR">Pesquisador</option><option value="ADMIN">Admin</option></select></label>
    {roles[item.id] === 'RESIDENTE' && <label>Organização<select aria-label={`Organização de ${item.name}`} disabled={processingId === item.id} value={organizationChoices[item.id] || ''} onChange={(event) => setOrganizationChoices((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Selecione</option>{item.existing_organization_id && <option value={item.existing_organization_id}>{item.existing_organization_name}</option>}{organizations.filter((organization) => organization.id !== item.existing_organization_id).map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}<option value="__create__">Criar “{item.requested_company_name}”</option></select></label>}
    <label className="admin-reason">Justificativa para rejeição<input aria-label={`Justificativa de ${item.name}`} value={reasons[item.id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} /></label>
    <button className="button secondary" disabled={processingId === item.id} onClick={() => reject(item.id)}><X />Rejeitar</button>
    <button className="button primary" disabled={processingId === item.id} onClick={() => approve(item)}><Check />{processingId === item.id ? 'Processando...' : 'Aprovar acesso'}</button>
  </div>)}</article></div>;
}
