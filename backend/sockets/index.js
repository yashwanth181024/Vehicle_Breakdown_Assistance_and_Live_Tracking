/**
 * Socket.IO setup: authentication, rooms, and joining a booking.
 *
 * Who connects
 *   admin / driver  -> JWT in  io(url, { auth: { token } })
 *   customer        -> no token; proves ownership by booking number + phone via "booking:join"
 *   family viewer   -> no token; opens a share link via "booking:join-shared"
 *
 * Rooms
 *   admin                     every admin
 *   driver:<driverMongoId>    all tabs of one driver
 *   booking:<bookingNumber>   status + live driver location (customer, driver, admin, share viewers)
 *   chat:<bookingNumber>      chat only (customer, assigned driver, admin read-only). Never share viewers.
 *
 * Client -> server events (all take an optional ack callback)
 *   booking:join        { bookingNumber, phone? }
 *   booking:join-shared { token }
 *   booking:leave       { bookingNumber }
 *   driver:location     { lat, lng, heading?, speed? }      (tracking.socket.js)
 *   offer:accept        { offerId }                          (dispatch.socket.js)
 *   offer:reject        { offerId }
 *   chat:send           { bookingNumber, text }              (chat.socket.js)
 *   chat:history        { bookingNumber }
 *   chat:typing         { bookingNumber, typing }
 */
const { verifyToken } = require('../middleware/auth');
const Admin = require('../models/Admin');
const Driver = require('../models/Driver');
const Booking = require('../models/Booking');
const tokenService = require('../services/token.service');
const tracking = require('./tracking.socket');
const dispatchSocket = require('./dispatch.socket');
const chat = require('./chat.socket');

const ROOMS = {
  admin: 'admin',
  driver: (id) => `driver:${id}`,
  booking: (n) => `booking:${n}`,
  chat: (n) => `chat:${n}`,
};

const MAX_FAILED_JOINS = 5;
const last10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);
const ackOf = (fn) => (typeof fn === 'function' ? fn : () => {});

async function authenticate(socket, next) {
  socket.data = { role: 'guest', failedJoins: 0 };
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next();

  try {
    const payload = verifyToken(token);
    if (payload.role === 'admin') {
      const admin = await Admin.findById(payload.id).select('name').lean();
      if (!admin) throw new Error('admin not found');
      socket.data = { ...socket.data, role: 'admin', id: String(admin._id), name: admin.name };
    } else if (payload.role === 'driver') {
      const driver = await Driver.findById(payload.id).select('name').lean();
      if (!driver) throw new Error('driver not found');
      socket.data = { ...socket.data, role: 'driver', id: String(driver._id), name: driver.name };
    } else {
      throw new Error('unknown role');
    }
    return next();
  } catch (_err) {
    return next(new Error('Authentication failed'));
  }
}

/** Joins the socket (and every other tab of the same driver) to a booking's rooms. */
function joinBookingRooms(io, socket, bookingNumber, { withChat = true } = {}) {
  const rooms = [ROOMS.booking(bookingNumber), ...(withChat ? [ROOMS.chat(bookingNumber)] : [])];
  if (socket.data.role === 'driver') io.in(ROOMS.driver(socket.data.id)).socketsJoin(rooms);
  else socket.join(rooms);
}

/** Decides whether this socket may follow a booking. Resolves to the booking or throws a message. */
async function authorizeBooking(socket, { bookingNumber, phone }) {
  const n = Number.parseInt(bookingNumber, 10);
  if (!Number.isInteger(n) || n < 1) throw new Error('Enter a valid booking number');

  const booking = await Booking.findOne({ bookingNumber: n })
    .select('bookingNumber phone status assignedDriver')
    .lean();

  let allowed = false;
  if (booking) {
    if (socket.data.role === 'admin') allowed = true;
    else if (socket.data.role === 'driver') allowed = String(booking.assignedDriver) === socket.data.id;
    else allowed = last10(phone).length === 10 && last10(phone) === last10(booking.phone);
  }

  if (!allowed) {
    if (socket.data.role === 'guest' && ++socket.data.failedJoins >= MAX_FAILED_JOINS) {
      socket.disconnect(true); // stop booking-number / phone guessing
    }
    // Same message for "no such booking" and "wrong phone" so numbers can't be probed
    throw new Error('Booking not found, or the phone number does not match');
  }
  return booking;
}

function registerBookingEvents(io, socket) {
  socket.on('booking:join', async (payload, ack) => {
    const reply = ackOf(ack);
    try {
      const booking = await authorizeBooking(socket, payload || {});
      joinBookingRooms(io, socket, booking.bookingNumber);
      reply({ ok: true, bookingNumber: booking.bookingNumber, status: booking.status });
    } catch (err) {
      reply({ ok: false, message: err.message });
    }
  });

  socket.on('booking:join-shared', async (payload, ack) => {
    const reply = ackOf(ack);
    try {
      const booking = await tokenService.resolveShareToken(payload && payload.token);
      if (!booking) throw new Error('This tracking link is invalid or has expired');
      // Location and status only. No chat room for people who only hold a link.
      joinBookingRooms(io, socket, booking.bookingNumber, { withChat: false });
      reply({ ok: true, bookingNumber: booking.bookingNumber, status: booking.status });
    } catch (err) {
      reply({ ok: false, message: err.message });
    }
  });

  socket.on('booking:leave', (payload) => {
    const n = Number.parseInt(payload && payload.bookingNumber, 10);
    if (!Number.isInteger(n)) return;
    socket.leave(ROOMS.booking(n));
    socket.leave(ROOMS.chat(n));
  });
}

async function onConnect(io, socket) {
  if (socket.data.role === 'admin') {
    socket.join(ROOMS.admin);
  } else if (socket.data.role === 'driver') {
    socket.join(ROOMS.driver(socket.data.id));
    // Reconnecting mid-job: put this tab back into the active booking's rooms
    const driver = await Driver.findById(socket.data.id).select('currentBooking').lean();
    if (driver && driver.currentBooking) {
      const booking = await Booking.findById(driver.currentBooking).select('bookingNumber status').lean();
      if (booking && ['Assigned', 'On The Way'].includes(booking.status)) {
        socket.join([ROOMS.booking(booking.bookingNumber), ROOMS.chat(booking.bookingNumber)]);
        socket.data.activeBooking = { n: booking.bookingNumber, at: Date.now() };
      }
    }
    await dispatchSocket.sendPendingOffers(socket); // offers that arrived while the app was closed
  }
}

function initSockets(io) {
  io.use(authenticate);

  io.on('connection', (socket) => {
    // Register handlers first so no event sent right after connect is lost
    registerBookingEvents(io, socket);
    tracking.register(io, socket);
    dispatchSocket.register(io, socket);
    chat.register(io, socket);

    onConnect(io, socket).catch((err) => console.error('[socket] connect setup failed:', err.message));
  });
}

module.exports = { initSockets, ROOMS, joinBookingRooms, ackOf };
