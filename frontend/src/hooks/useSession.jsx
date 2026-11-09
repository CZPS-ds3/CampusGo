import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api/client.js';
import { t } from '../i18n.js';
import { forgetMapStyle, loadMapStyle } from '../mapStyle.js';
import { useAutoRefresh } from './useAutoRefresh.js';
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
        if (current) toast.error(t('Your session ended. Please log in again.'));
        return null;
      });
    });
    refresh();
  }, [refresh, toast]);

  // One map style per account: it is loaded after sign-in and forgotten when the person leaves this browser.
  const studentId = student?.id ?? null;
  useEffect(() => {
    if (studentId) loadMapStyle(api);
    else if (ready) forgetMapStyle();
  }, [studentId, ready]);

  // The role, the status and the points can change while the page is open (an admin makes someone an admin, the
  // points grow on another device). Looking again every so often keeps the menus and the admin area in step.
  const syncStudent = useCallback(() => {
    api
      .me()
      .then(({ student: me }) =>
        setStudent((current) =>
          current && JSON.stringify(current) !== JSON.stringify(me) ? me : current,
        ),
      )
      // A lost connection is shown by the offline banner; an ended session is handled by the 401 handler.
      .catch(() => {});
  }, []);
  useAutoRefresh(syncStudent, 15_000, studentId !== null);

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
