import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getMe, login as apiLogin, logout as apiLogout, tokenStore, updateAvatar as apiUpdateAvatar } from '../services/api';
import { authRateLimit } from '../utils/authRateLimit';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [sessionRateLimit, setSessionRateLimit] = useState(null);
  const [sessionRecoveryRequired, setSessionRecoveryRequired] = useState(false);

  const logout = useCallback(async () => {
    try {
      if (tokenStore.get()) await apiLogout();
    } catch {
      // O encerramento local da sessão não depende da disponibilidade da API.
    } finally {
      tokenStore.clear();
      setUser(null);
      setSessionError('');
      setSessionRateLimit(null);
      setSessionRecoveryRequired(false);
    }
  }, []);

  const restoreSession = useCallback(async () => {
    setLoading(true);
    setSessionError('');
    setSessionRateLimit(null);
    setSessionRecoveryRequired(false);
    const restoringToken = tokenStore.get();
    if (!restoringToken) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await getMe();
      if (tokenStore.get() !== restoringToken) return;
      setUser(data.user);
      return data.user;
    } catch (error) {
      if (tokenStore.get() && tokenStore.get() !== restoringToken) return;
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => restoreSession());
  }, [restoreSession]);
  useEffect(() => {
    const onUnauthorized = () => { void logout(); };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [logout]);

  const login = useCallback(async (email, password, remember = false) => {
    const data = await apiLogin(email.trim().toLowerCase(), password);
    tokenStore.set(data.token, remember);
    try {
      const session = await getMe();
      if (tokenStore.get() !== data.token) return;
      setUser(session.user);
      setSessionError('');
      setSessionRateLimit(null);
      setSessionRecoveryRequired(false);
      return session.user;
    } catch (error) {
      if (tokenStore.get() && tokenStore.get() !== data.token) throw error;
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
    const data = await apiUpdateAvatar(avatarData);
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
