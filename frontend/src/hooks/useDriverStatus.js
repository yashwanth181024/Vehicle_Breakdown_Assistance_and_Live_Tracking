import { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api/axios';
import { useSocketEvent } from './useSocket';

/** The driver's own profile, whether they are online, and the job they are on. */
export default function useDriverStatus() {
  const [profile, setProfile] = useState(null);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        api.get('/drivers/me/profile'),
        api.get('/drivers/me/active').catch((err) => (err.response && err.response.status === 404 ? { data: { data: null } } : Promise.reject(err))),
      ]);
      const pd = p.data.data || {};
      setProfile(pd.driver || pd);
      const ad = a.data.data;
      setActive(ad ? ad.booking || ad : null);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useSocketEvent('job:assigned', load);
  useSocketEvent('job:cancelled', load);
  useSocketEvent('booking:status', load);

  const online = Boolean(profile && (profile.isOnline ?? profile.online));

  const setOnline = useCallback(async (value) => {
    setBusy(true);
    try {
      const body = { online: value, isOnline: value };
      await api.patch('/drivers/me/online', body);
      setProfile((p) => ({ ...p, isOnline: value, online: value }));
      return { ok: true };
    } catch (err) {
      return { ok: false, message: getErrorMessage(err) };
    } finally {
      setBusy(false);
    }
  }, []);

  return { profile, active, online, loading, error, busy, setOnline, reload: load };
}
