import { useContext, useEffect, useRef } from 'react';
import { SocketContext } from '../context/SocketContext';

/** { socket, connected }. socket is null for a moment while the connection is being set up. */
export default function useSocket() {
  return useContext(SocketContext);
}

/**
 * Runs `handler` whenever the server sends `event`. Cleans up on its own, and keeps working
 * after a reconnect or a login change. The handler may change on every render without causing re-subscribes.
 *   useSocketEvent('booking:status', (data) => setStatus(data.status));
 */
export function useSocketEvent(event, handler) {
  const { socket } = useSocket();
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    if (!socket || !event) return undefined;
    const listener = (...args) => saved.current(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [socket, event]);
}

/** Emits an event and waits for the server's reply. Resolves to { ok:false, message } if nothing answers in time. */
export function emitWithAck(socket, event, payload, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) {
      resolve({ ok: false, message: 'Not connected to the live server. Please try again in a moment.' });
      return;
    }
    socket.timeout(timeoutMs).emit(event, payload, (err, reply) => {
      if (err) resolve({ ok: false, message: 'The server did not answer in time. Please try again.' });
      else resolve(reply || { ok: false, message: 'No answer from the server.' });
    });
  });
}

// ---------- Alert sound ----------
let audioEl = null;
let audioCtx = null;

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch {
    /* no sound available */
  }
}

/**
 * Plays /alert.mp3 for a new job offer or an SOS. Browsers only allow sound after the person has
 * tapped or clicked something on the page once; until then this stays silent instead of throwing.
 */
export function playAlert() {
  try {
    audioEl = audioEl || new Audio('/alert.mp3');
    audioEl.currentTime = 0;
    const result = audioEl.play();
    if (result && result.catch) result.catch(beep);
  } catch {
    beep();
  }
}
