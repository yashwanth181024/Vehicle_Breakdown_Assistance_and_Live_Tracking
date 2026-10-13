/**
 * Customer <-> driver chat.
 * Permission = being in the room "chat:<bookingNumber>". Sockets only get there through
 * sockets/index.js (customer proved the phone number, driver is assigned, admin read-only),
 * so a share-link viewer can never read or write messages.
 *
 *   chat:send    { bookingNumber, text }   -> ack { ok, message }   -> room "chat:message"
 *   chat:history { bookingNumber }         -> ack { ok, messages }
 *   chat:typing  { bookingNumber, typing } -> room "chat:typing" { bookingNumber, role, typing }
 */
const Booking = require('../models/Booking');
const Message = require('../models/Message');

const MAX_LENGTH = 1000;
const HISTORY_LIMIT = 100;
const MAX_PER_MINUTE = 30;
const CHAT_STATUSES = ['Assigned', 'On The Way'];

const ackOf = (fn) => (typeof fn === 'function' ? fn : () => {});
const roomOf = (n) => `chat:${n}`;

function serializeMessage(m) {
  return {
    id: String(m._id),
    bookingNumber: m.bookingNumber,
    senderRole: m.senderRole,
    senderName: m.senderName,
    text: m.text,
    at: m.createdAt,
  };
}

/** Last messages of a booking, oldest first. Also used by the REST chat route. */
async function getHistory(bookingId, limit = HISTORY_LIMIT) {
  const rows = await Message.find({ booking: bookingId }).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.reverse().map(serializeMessage);
}

/** What this socket is in a chat: customer, driver, or null for read-only admins. */
const senderRoleOf = (socket) => {
  if (socket.data.role === 'driver') return 'driver';
  if (socket.data.role === 'guest') return 'customer';
  return null;
};

function register(io, socket) {
  const sentAt = []; // timestamps of recent messages from this socket

  socket.on('chat:send', async (payload, ack) => {
    const reply = ackOf(ack);
    try {
      const n = Number.parseInt(payload && payload.bookingNumber, 10);
      const text = String((payload && payload.text) || '').trim();

      if (!Number.isInteger(n) || !socket.rooms.has(roomOf(n))) {
        return reply({ ok: false, message: 'You are not part of this chat' });
      }
      const senderRole = senderRoleOf(socket);
      if (!senderRole) return reply({ ok: false, message: 'Admins can read chats but not write in them' });
      if (!text) return reply({ ok: false, message: 'Message cannot be empty' });
      if (text.length > MAX_LENGTH) return reply({ ok: false, message: `Message is too long (max ${MAX_LENGTH})` });

      const now = Date.now();
      while (sentAt.length && now - sentAt[0] > 60000) sentAt.shift();
      if (sentAt.length >= MAX_PER_MINUTE) return reply({ ok: false, message: 'Slow down a little' });
      sentAt.push(now);

      const booking = await Booking.findOne({ bookingNumber: n }).select('name status').lean();
      if (!booking) return reply({ ok: false, message: 'Booking not found' });
      if (!CHAT_STATUSES.includes(booking.status)) {
        return reply({ ok: false, message: 'Chat is open while a driver is assigned to the job' });
      }

      const message = await Message.create({
        booking: booking._id,
        bookingNumber: n,
        senderRole,
        senderName: senderRole === 'customer' ? booking.name : socket.data.name,
        text,
      });
      const out = serializeMessage(message);
      io.to(roomOf(n)).emit('chat:message', out);
      return reply({ ok: true, message: out });
    } catch (err) {
      console.error('[chat] send failed:', err.message);
      return reply({ ok: false, message: 'Could not send the message' });
    }
  });

  socket.on('chat:history', async (payload, ack) => {
    const reply = ackOf(ack);
    try {
      const n = Number.parseInt(payload && payload.bookingNumber, 10);
      if (!Number.isInteger(n) || !socket.rooms.has(roomOf(n))) {
        return reply({ ok: false, message: 'You are not part of this chat' });
      }
      const booking = await Booking.findOne({ bookingNumber: n }).select('_id').lean();
      if (!booking) return reply({ ok: false, message: 'Booking not found' });
      return reply({ ok: true, messages: await getHistory(booking._id) });
    } catch (err) {
      return reply({ ok: false, message: 'Could not load messages' });
    }
  });

  socket.on('chat:typing', (payload) => {
    const n = Number.parseInt(payload && payload.bookingNumber, 10);
    const role = senderRoleOf(socket);
    if (!Number.isInteger(n) || !role || !socket.rooms.has(roomOf(n))) return;
    socket.to(roomOf(n)).emit('chat:typing', { bookingNumber: n, role, typing: Boolean(payload.typing) });
  });
}

module.exports = { register, getHistory, serializeMessage, CHAT_STATUSES };
