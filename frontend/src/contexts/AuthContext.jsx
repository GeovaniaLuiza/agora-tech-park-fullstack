import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getMe, login as apiLogin, logout as apiLogout, tokenStore, updateAvatar as apiUpdateAvatar } from '../services/api';
import { authRateLimit } from '../utils/authRateLimit';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [sessionRateLimit, setSessionRateLimit] = useState(null);

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
    }
  }, []);

  const restoreSession = useCallback(async () => {
    setLoading(true);
    setSessionError('');
    setSessionRateLimit(null);
    if (!tokenStore.get()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await getMe();
      setUser(data.user);
      return data.user;
    } catch (error) {
      if (error.status === 429) {
        const limit = authRateLimit(error);
        setSessionRateLimit(limit);
        setSessionError(limit.message);
        return;
      }
      tokenStore.clear();
      setUser(null);
      setSessionError('Sua sessão não pôde ser restaurada. Entre novamente.');
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
      setUser(session.user);
      setSessionError('');
      setSessionRateLimit(null);
      return session.user;
    } catch (error) {
      if (error.status === 429) {
        const limit = authRateLimit(error);
        setSessionRateLimit(limit);
        setSessionError(limit.message);
        throw error;
      }
      tokenStore.clear();
      setUser(null);
      setSessionRateLimit(null);
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
    () => ({ user, loading, sessionError, sessionRateLimit, login, logout, restoreSession, clearSessionError, updateAvatar }),
    [user, loading, sessionError, sessionRateLimit, login, logout, restoreSession, clearSessionError, updateAvatar],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
