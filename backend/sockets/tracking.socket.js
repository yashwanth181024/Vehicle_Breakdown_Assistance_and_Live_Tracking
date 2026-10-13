/**
 * Driver location stream.
 * The driver's phone sends "driver:location" every few seconds. We store the latest point
 * (this is what the nearest-driver query uses) and relay it to the people watching.
 *
 *   -> booking:<n>  "driver:location" { bookingNumber, lat, lng, heading, speed, at }
 *   -> admin        "driver:moved"    { driverId, lat, lng, heading, speed, at }
 */
const Driver = require('../models/Driver');
const Booking = require('../models/Booking');
const { toPoint } = require('../utils/geo');

const MIN_INTERVAL_MS = 2000; // ignore updates faster than this per socket
const BOOKING_CACHE_MS = 15000; // how long we trust the cached "current booking" of a driver

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : undefined);

/** Booking number of the job this driver is on, or null. Cached on the socket. */
async function activeBookingNumber(socket) {
  const cached = socket.data.activeBooking;
  if (cached && Date.now() - cached.at < BOOKING_CACHE_MS) return cached.n;

  let n = null;
  const driver = await Driver.findById(socket.data.id).select('currentBooking').lean();
  if (driver && driver.currentBooking) {
    const booking = await Booking.findById(driver.currentBooking).select('bookingNumber status').lean();
    if (booking && ['Assigned', 'On The Way'].includes(booking.status)) n = booking.bookingNumber;
  }
  socket.data.activeBooking = { n, at: Date.now() };
  return n;
}

function register(io, socket) {
  if (socket.data.role !== 'driver') return;
  let lastAt = 0;

  socket.on('driver:location', async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      const now = Date.now();
      if (now - lastAt < MIN_INTERVAL_MS) return reply({ ok: false, message: 'Sending too fast' });

      const point = toPoint(payload && payload.lat, payload && payload.lng);
      if (!point) return reply({ ok: false, message: 'Invalid coordinates' });
      lastAt = now;

      const at = new Date(now);
      await Driver.updateOne({ _id: socket.data.id }, { location: point, locationUpdatedAt: at });

      const update = {
        lat: point.coordinates[1],
        lng: point.coordinates[0],
        heading: num(payload.heading),
        speed: num(payload.speed),
        at,
      };
      io.to('admin').emit('driver:moved', { driverId: socket.data.id, ...update });

      const n = await activeBookingNumber(socket);
      if (n) io.to(`booking:${n}`).emit('driver:location', { bookingNumber: n, ...update });

      return reply({ ok: true });
    } catch (err) {
      console.error('[tracking] location failed:', err.message);
      return reply({ ok: false, message: 'Could not save location' });
    }
  });
}

module.exports = { register, activeBookingNumber };
