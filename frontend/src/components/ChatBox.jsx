import { useEffect, useRef, useState } from 'react';
import useChat from '../hooks/useChat';
import { formatTime } from '../utils/format';

const QUICK = {
  customer: ['I can see you on the map', 'Please call me', 'I am near the main road'],
  driver: ['I am on my way', 'Stuck in traffic, a few minutes late', 'I have reached, please come to the road'],
};

/**
 * Chat between customer and driver for one booking. Admins see it read-only.
 *   role: 'customer' | 'driver' | 'admin'      phone: the customer's number (customer only)
 */
export default function ChatBox({ bookingNumber, phone, role, disabledReason = '' }) {
  const chat = useChat({ bookingNumber, phone, role });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');
  const logRef = useRef(null);
  const typingStop = useRef(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, chat.otherTyping]);

  useEffect(() => () => clearTimeout(typingStop.current), []);

  const onChange = (e) => {
    setText(e.target.value);
    chat.setTyping(true);
    clearTimeout(typingStop.current);
    typingStop.current = setTimeout(() => chat.setTyping(false), 1500);
  };

  const submit = async (value) => {
    const body = (value ?? text).trim();
    if (!body || sending) return;
    setSending(true);
    setProblem('');
    const reply = await chat.send(body);
    setSending(false);
    chat.setTyping(false);
    if (reply.ok) setText('');
    else setProblem(reply.message || 'Message not sent.');
  };

  const mine = (m) => m.senderRole === role || m.sender === role;
  const quick = QUICK[role] || [];
  const locked = Boolean(disabledReason);

  return (
    <section className="chat" aria-label="Chat">
      <div className="chat-log" ref={logRef} role="log" aria-live="polite">
        {chat.error && <p className="notice notice-error" role="alert">{chat.error}</p>}
        {!chat.error && chat.ready && chat.messages.length === 0 && (
          <p className="muted small" style={{ textAlign: 'center' }}>No messages yet. Say hello.</p>
        )}
        {chat.messages.map((m) => (
          <div key={m.id} className={`bubble${mine(m) ? ' mine' : ''}`}>
            {m.text}
            <div className="bubble-meta">
              {!mine(m) && <span style={{ textTransform: 'capitalize' }}>{m.senderRole || m.sender} · </span>}
              {formatTime(m.createdAt)}
            </div>
          </div>
        ))}
        {chat.otherTyping && <div className="chat-typing" aria-live="polite">typing…</div>}
      </div>

      {locked ? (
        <p className="small muted" style={{ margin: 0, padding: 12 }}>{disabledReason}</p>
      ) : !chat.canWrite ? (
        <p className="small muted" style={{ margin: 0, padding: 12 }}>You are viewing this chat. Only the customer and driver can write.</p>
      ) : (
        <>
          {quick.length > 0 && (
            <div className="quick-replies">
              {quick.map((q) => (
                <button key={q} type="button" className="chip" onClick={() => submit(q)} disabled={sending || !chat.ready}>{q}</button>
              ))}
            </div>
          )}
          {problem && <p className="small" role="alert" style={{ margin: '0 12px', color: 'var(--danger)' }}>{problem}</p>}
          <form className="chat-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <input
              type="text"
              value={text}
              onChange={onChange}
              maxLength={500}
              placeholder="Type a message"
              aria-label="Message"
              autoComplete="off"
              disabled={!chat.ready}
            />
            <button className="btn btn-primary" type="submit" disabled={sending || !text.trim() || !chat.ready}>Send</button>
          </form>
        </>
      )}
    </section>
  );
}
