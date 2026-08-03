import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, LoaderCircle } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { verifyEmail } from '../services/api';

const errorStates = {
  INVALID_TOKEN: ['Link inválido', 'O link de confirmação não é válido.'],
  EXPIRED_TOKEN: ['Link expirado', 'O prazo deste link terminou. Solicite um novo envio.'],
  USED_TOKEN: ['Link já utilizado', 'Este endereço já foi confirmado com este link.'],
  NETWORK_ERROR: ['Não foi possível validar', 'Não foi possível conectar à plataforma. Verifique sua conexão e tente novamente.'],
};

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState({ type: 'verifying' });

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState({ type: 'error', code: 'INVALID_TOKEN' }); return; }
    verifyEmail(token).then((data) => setState({ type: 'success', message: data.message }))
      .catch((error) => setState({ type: 'error', code: error.code || 'NETWORK_ERROR' }));
  }, [params]);

  if (state.type === 'verifying') return <AuthLayout><section className="auth-form verification-state" role="status"><LoaderCircle className="spin" /><h2>Verificando seu e-mail</h2><p>Aguarde enquanto validamos o link com segurança.</p></section></AuthLayout>;
  if (state.type === 'success') return <AuthLayout><section className="auth-form verification-state" aria-live="polite"><CheckCircle2 /><h2>E-mail confirmado</h2><p>{state.message}</p><button className="button primary" onClick={() => navigate('/login')}>Ir para o login</button></section></AuthLayout>;
  const [title, description] = errorStates[state.code] || errorStates.INVALID_TOKEN;
  return <AuthLayout><section className="auth-form verification-state" aria-live="polite"><AlertCircle className="verification-error" /><h2>{title}</h2><p>{description}</p>
    <button className="button primary" onClick={() => navigate('/reenviar-confirmacao')}>Solicitar novo link</button>
    <button className="link-button" onClick={() => navigate('/login')}>Voltar para o login</button>
  </section></AuthLayout>;
}
