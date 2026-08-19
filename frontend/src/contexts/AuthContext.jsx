import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getMe, login as apiLogin, logout as apiLogout, tokenStore, updateAvatar as apiUpdateAvatar } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');

  const logout = useCallback(async () => {
    try {
      if (tokenStore.get()) await apiLogout();
    } catch {
      // O encerramento local da sessão não depende da disponibilidade da API.
    } finally {
      tokenStore.clear();
      setUser(null);
      setSessionError('');
    }
  }, []);

  const restoreSession = useCallback(async () => {
    setLoading(true);
    setSessionError('');
    if (!tokenStore.get()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await getMe();
      setUser(data.user);
    } catch {
      tokenStore.clear();
      setUser(null);
      setSessionError('Sua sessão não pôde ser restaurada. Entre novamente.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { restoreSession(); }, [restoreSession]);
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
      return session.user;
    } catch (error) {
      tokenStore.clear();
      setUser(null);
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
    () => ({ user, loading, sessionError, login, logout, restoreSession, clearSessionError, updateAvatar }),
    [user, loading, sessionError, login, logout, restoreSession, clearSessionError, updateAvatar],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
