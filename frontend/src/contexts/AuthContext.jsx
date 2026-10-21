import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getMe, login as apiLogin, logout as apiLogout, LOGOUT_STORAGE_KEY, tokenStore, updateAvatar as apiUpdateAvatar } from '../services/api';
import { authRateLimit } from '../utils/authRateLimit';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [sessionRateLimit, setSessionRateLimit] = useState(null);
  const [sessionRecoveryRequired, setSessionRecoveryRequired] = useState(false);
  const generation = useRef(0);

  const clearLocalSession = useCallback(() => {
    generation.current++;
    tokenStore.clear();
    setUser(null);
    setLoading(false);
    setSessionError('');
    setSessionRateLimit(null);
    setSessionRecoveryRequired(false);
  }, []);

  const logout = useCallback(async () => {
    const token = tokenStore.get();
    clearLocalSession();
    tokenStore.notifyLogout();
    try {
      if (token) await apiLogout(token);
    } catch {
      // O encerramento local da sessão não depende da disponibilidade da API.
    }
  }, [clearLocalSession]);

  const restoreSession = useCallback(async ({ background = false } = {}) => {
    const operation = ++generation.current;
    if (!background) setLoading(true);
    setSessionError('');
    setSessionRateLimit(null);
    if (!background) setSessionRecoveryRequired(false);
    const restoringToken = tokenStore.get();
    if (!restoringToken) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await getMe();
      if (generation.current !== operation || tokenStore.get() !== restoringToken) return;
      setUser(data.user);
      setSessionRecoveryRequired(false);
      return data.user;
    } catch (error) {
      if (generation.current !== operation || (tokenStore.get() && tokenStore.get() !== restoringToken)) return;
      if (error.status === 429) {
        const limit = authRateLimit(error);
        setSessionRateLimit(limit);
        setSessionError(limit.message);
        setSessionRecoveryRequired(true);
        return;
      }
      if (error.status === 401) {
        tokenStore.clear();
        setUser(null);
        setSessionError('Sua sessão não pôde ser restaurada. Entre novamente.');
      } else {
        setSessionRecoveryRequired(true);
        setSessionError('Não foi possível verificar sua sessão. Tente novamente em instantes.');
      }
    } finally {
      if (generation.current === operation) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => restoreSession());
  }, [restoreSession]);
  useEffect(() => {
    const onUnauthorized = () => { clearLocalSession(); };
    const onStorage = (event) => {
      if (event.key === LOGOUT_STORAGE_KEY && event.newValue) clearLocalSession();
      else if (event.key === 'token' || event.key === null) void restoreSession();
    };
    const onResume = () => {
      if (document.visibilityState === 'visible' && (tokenStore.get() || user)) void restoreSession({ background: true });
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      window.removeEventListener('auth:unauthorized', onUnauthorized);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [clearLocalSession, restoreSession, user]);

  useEffect(() => {
    if (!user) return;
    // This is only a UI deadline; authenticity and expiration are checked by the API.
    const expiringToken = tokenStore.get();
    let expiresAt;
    try { expiresAt = JSON.parse(atob(expiringToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { return; }
    if (!Number.isFinite(expiresAt)) return;
    let timer;
    const check = () => {
      if (tokenStore.get() !== expiringToken) return;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) { clearLocalSession(); tokenStore.notifyLogout(); }
      else timer = setTimeout(check, Math.min(remaining, 2_147_483_647));
    };
    check();
    return () => clearTimeout(timer);
  }, [user, clearLocalSession]);

  const login = useCallback(async (email, password, remember = false) => {
    const operation = ++generation.current;
    const data = await apiLogin(email.trim().toLowerCase(), password);
    if (generation.current !== operation) return;
    tokenStore.set(data.token, remember);
    try {
      const session = await getMe();
      if (generation.current !== operation || tokenStore.get() !== data.token) return;
      setUser(session.user);
      setSessionError('');
      setSessionRateLimit(null);
      setSessionRecoveryRequired(false);
      return session.user;
    } catch (error) {
      if (generation.current !== operation || (tokenStore.get() && tokenStore.get() !== data.token)) throw error;
      if (error.status === 429) {
        const limit = authRateLimit(error);
        setSessionRateLimit(limit);
        setSessionError(limit.message);
        setSessionRecoveryRequired(true);
        throw error;
      }
      if (error.status === 401) {
        tokenStore.clear();
        setUser(null);
        setSessionRecoveryRequired(false);
      } else {
        setSessionRecoveryRequired(true);
        setSessionError('Não foi possível verificar sua sessão. Tente novamente em instantes.');
        error.sessionRecoveryRequired = true;
      }
      throw error;
    }
  }, []);

  const clearSessionError = useCallback(() => setSessionError(''), []);
  const updateAvatar = useCallback(async (avatarData) => {
    const operation = generation.current;
    const data = await apiUpdateAvatar(avatarData);
    if (generation.current !== operation || !tokenStore.get()) return;
    setUser(data.user);
    return data.user;
  }, []);
  const value = useMemo(
    () => ({ user, loading, sessionError, sessionRateLimit, sessionRecoveryRequired, login, logout, restoreSession, clearSessionError, updateAvatar }),
    [user, loading, sessionError, sessionRateLimit, sessionRecoveryRequired, login, logout, restoreSession, clearSessionError, updateAvatar],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
