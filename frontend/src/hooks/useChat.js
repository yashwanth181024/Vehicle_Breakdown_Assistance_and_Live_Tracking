import { useCallback, useEffect, useRef, useState } from 'react';
import useSocket, { emitWithAck, useSocketEvent } from './useSocket';

/**
 * Live chat for one booking.
 *
 *   role 'customer' needs the phone number to prove the booking is theirs
 *   role 'driver'   works once the driver is assigned to the booking
 *   role 'admin'    can read but not write
 *
 *   const { messages, send, canWrite, otherTyping, setTyping, error, ready } =
 *     useChat({ bookingNumber, phone, role: 'customer' });
 */
export default function useChat({ bookingNumber, phone, role }) {
  const { socket, connected } = useSocket();
  const [messages, setMessages] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(false);

  const n = Number(bookingNumber);
  const canWrite = role !== 'admin';

  // Join the booking's room and load earlier messages. Runs again after every reconnect,
  // because the server forgets a socket's rooms when it drops.
  useEffect(() => {
    if (!socket || !connected || !n) return undefined;
    let cancelled = false;
    setError('');

    (async () => {
      const joinPayload = role === 'customer' ? { bookingNumber: n, phone } : { bookingNumber: n };
      const joined = await emitWithAck(socket, 'booking:join', joinPayload);
      if (cancelled) return;
      if (!joined.ok) {
        setError(joined.message || 'Could not open the chat.');
        setReady(false);
        return;
      }
      const history = await emitWithAck(socket, 'chat:history', { bookingNumber: n });
      if (cancelled) return;
      if (history.ok) {
        // Keep anything that arrived live while history was loading
        setMessages((live) => {
          const known = new Set(history.messages.map((m) => m.id));
          return [...history.messages, ...live.filter((m) => !known.has(m.id))];
        });
        setReady(true);
      } else {
        setError(history.message || 'Could not load earlier messages.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [socket, connected, n, phone, role]);

  // A different booking starts with an empty chat
  useEffect(() => {
    setMessages([]);
    setReady(false);
    setOtherTyping(false);
  }, [n]);

  useSocketEvent('chat:message', (m) => {
    if (m.bookingNumber !== n) return;
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  });

  useSocketEvent('chat:typing', (t) => {
    if (t.bookingNumber !== n || t.role === role) return;
    setOtherTyping(Boolean(t.typing));
    clearTimeout(typingTimer.current);
    if (t.typing) typingTimer.current = setTimeout(() => setOtherTyping(false), 4000);
  });

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  /** Sends a message. Resolves to { ok:true } or { ok:false, message } so the box can show why it failed. */
  const send = useCallback(
    async (text) => {
      const clean = String(text || '').trim();
      if (!clean) return { ok: false, message: 'Type a message first.' };
      const reply = await emitWithAck(socket, 'chat:send', { bookingNumber: n, text: clean });
      if (reply.ok && reply.message) {
        setMessages((list) => (list.some((x) => x.id === reply.message.id) ? list : [...list, reply.message]));
      }
      return reply;
    },
    [socket, n]
  );

  /** Call with true while the person is typing and false when they stop. Only changes are sent. */
  const setTyping = useCallback(
    (typing) => {
      if (!socket || !socket.connected || !canWrite || lastTypingSent.current === typing) return;
      lastTypingSent.current = typing;
      socket.emit('chat:typing', { bookingNumber: n, typing });
    },
    [socket, n, canWrite]
  );

  return { messages, ready, error, otherTyping, canWrite, send, setTyping };
}
