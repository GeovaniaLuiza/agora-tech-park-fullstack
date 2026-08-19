import { useEffect, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { resendVerification, normalizeApiError } from '../services/api';

const PUBLIC_FEEDBACK = 'Solicitação processada. Se existir um cadastro pendente para este e-mail, uma nova mensagem de confirmação será enviada. Verifique também a caixa de spam.';
const DELIVERY_ERROR = 'Não foi possível enviar o e-mail de confirmação neste momento. Tente novamente mais tarde.';

function readableDuration(totalSeconds) {
  const seconds = Math.max(1, Number(totalSeconds) || 1);
  if (seconds < 60) return `${seconds} segundo${seconds === 1 ? '' : 's'}`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} minuto${minutes === 1 ? '' : 's'}${remainder ? ` e ${remainder} segundo${remainder === 1 ? '' : 's'}` : ''}`;
}

export default function ResendVerificationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestInFlight = useRef(false);
  const emailRef = useRef(null);
  const [email, setEmail] = useState(location.state?.email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: null, message: '' });
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    if (retryAfter <= 0) return undefined;
    const timer = window.setTimeout(
      () => setRetryAfter((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [retryAfter]);

  const submit = async (event) => {
    event.preventDefault();
    // Guard against duplicate submits (extra protection beyond disabled)
    if (isSubmitting || requestInFlight.current || retryAfter > 0) return;
    requestInFlight.current = true;
    setIsSubmitting(true);
    setFeedback({ type: null, message: '' });

    try {
      const result = await resendVerification(email.trim().toLowerCase());
      setFeedback({ type: 'info', message: PUBLIC_FEEDBACK });
      const cooldown = Number(result?.retryAfter ?? result?.retryAfterSeconds) || 0;
      if (cooldown > 0) setRetryAfter(cooldown);
    } catch (err) {
      // Preserve specific backend code mapping (delivery failure)
      if (err && err.code === 'EMAIL_DELIVERY_FAILED') {
        setFeedback({ type: 'error', message: DELIVERY_ERROR });
        return;
      }

      // Normalize error centrally and handle by type
      const normalized = normalizeApiError(err);

      // If the server provided a retryAfter value, apply it
      const serverRetry = Number(
        err?.retryAfter ?? err?.retryAfterSeconds ?? normalized.details?.retryAfterSeconds,
      ) || undefined;
      if (serverRetry && serverRetry > 0) setRetryAfter(serverRetry);

      switch (normalized.type) {
        case 'NETWORK':
          setFeedback({ type: 'error', message: normalized.message });
          break;
        case 'TIMEOUT':
          setFeedback({ type: 'error', message: normalized.message });
          break;
        case 'UNAVAILABLE':
          setFeedback({ type: 'error', message: normalized.message });
          break;
        case 'RATE_LIMIT':
          setFeedback({
            type: 'warning',
            message: `Muitas tentativas. Aguarde ${readableDuration(serverRetry)} antes de tentar novamente.`,
          });
          break;
        case 'VALIDATION':
          // If there's a field-specific message for email, show it and focus field
          if (normalized.fieldErrors && normalized.fieldErrors.email) {
            setFeedback({ type: 'error', message: normalized.fieldErrors.email });
            if (emailRef.current) emailRef.current.focus();
          } else {
            setFeedback({ type: 'error', message: normalized.message || 'Verifique os dados informados e tente novamente.' });
          }
          break;
        case 'CONFLICT':
        case 'UNAUTHORIZED':
        case 'FORBIDDEN':
        case 'SERVER':
          setFeedback({ type: 'error', message: normalized.message });
          break;
        default:
          setFeedback({ type: 'error', message: normalized.message || 'Ocorreu um erro ao solicitar o reenvio. Tente novamente.' });
      }
    } finally {
      requestInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const feedbackRole = feedback.type === 'error' ? 'alert' : 'status';

  return <AuthLayout><section className="auth-form verification-state">
    <Mail />
    <h2>Reenviar confirmação</h2>
    <p>Informe o e-mail utilizado na solicitação de acesso.</p>
    <form className="resend-form" onSubmit={submit}>
      <label htmlFor="resend-email">E-mail da solicitação
        <input ref={emailRef} id="resend-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <button type="submit" className="button primary" disabled={isSubmitting || retryAfter > 0}>
        {isSubmitting ? 'Enviando...' : retryAfter ? `Tente novamente em ${retryAfter}s` : 'Enviar novo link'}
      </button>
    </form>
    {feedback.message && <div className={`auth-alert auth-alert--${feedback.type}`} role={feedbackRole} aria-live="polite">{feedback.message}</div>}
    <button type="button" className="link-button" onClick={() => navigate('/login')}>Voltar para o login</button>
  </section></AuthLayout>;
}
