import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api/client.js';
import { copy } from '../i18n.js';
import { useToast } from './useToast.jsx';

const SessionContext = createContext(null);

/** Holds the logged-in student. A 401 anywhere logs the student out and explains why. */
export function SessionProvider({ children }) {
  const toast = useToast();
  const [student, setStudent] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { student: me } = await api.me();
      setStudent(me);
      return me;
    } catch {
      setStudent(null);
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setStudent((current) => {
        if (current) toast.error(copy.errors.session);
        return null;
      });
    });
    refresh();
  }, [refresh, toast]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setStudent(null);
    }
  }, []);

  const value = useMemo(
    () => ({ student, ready, setStudent, refresh, logout }),
    [student, ready, refresh, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession needs a SessionProvider');
  return value;
}
