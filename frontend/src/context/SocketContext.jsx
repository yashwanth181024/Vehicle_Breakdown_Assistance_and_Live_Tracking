import { createContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../api/axios';
import { useAuth } from './AuthContext';

export const SocketContext = createContext({ socket: null, connected: false });

/**
 * One live connection for the whole app.
 *   - Admins and drivers connect with their login token.
 *   - Customers and share-link viewers connect without one; each page then proves what it may see
 *     (booking number + phone, or a share token) with a "booking:join" event.
 * Logging in or out replaces the connection, so the server always knows who is on the other end.
 */
export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io(SOCKET_URL, {
      auth: token ? { token } : {},
      reconnectionDelayMax: 8000,
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => {
      setConnected(false);
      // The server rejected our token (account deleted, secret changed): let AuthContext sign out
      if (token && err && err.message === 'Authentication failed') window.dispatchEvent(new Event('vba:unauthorized'));
    });

    setSocket(s);
    return () => {
      s.off();
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
