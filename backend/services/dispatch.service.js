/**
 * Dispatch: offers a booking to the nearest free driver, one at a time.
 *
 *   startDispatch(booking)
 *        └─ nearest eligible driver (not yet tried) ──> JobOffer (pending, expires in N s)
 *              ├─ driver accepts  -> booking Assigned, driver reserved
 *              ├─ driver rejects  -> next nearest driver
 *              └─ timer expires   -> next nearest driver
 *   No driver left (or MAX_DISPATCH_ATTEMPTS reached) -> admin alert, booking.dispatchFailed = true
 *
 * Every state change on an offer is a single atomic findOneAndUpdate on { status: 'pending' },
 * so a late accept racing a timeout (or two requests at once) can only succeed once.
 *
 * Driver socket events: offer:new, offer:expired, offer:cancelled  (see notification.service)
 */
const Booking = require('../models/Booking');
const Driver = require('../models/Driver');
const JobOffer = require('../models/JobOffer');
const { AppError } = require('../middleware/errorHandler');
const assignment = require('./assignment.service');
const notification = require('./notification.service');

const OPEN = ['Pending', 'Approved'];
const timeoutSeconds = (priority) => {
  if (priority === 'critical') return Number(process.env.OFFER_TIMEOUT_CRITICAL_SECONDS) || 30;
  return Number(process.env.OFFER_TIMEOUT_SECONDS) || 60;
};
const maxAttempts = () => Number(process.env.MAX_DISPATCH_ATTEMPTS) || 5;

const timers = new Map(); // offerId -> Timeout
const running = new Set(); // booking ids currently inside startDispatch

let io = null;
function init(ioInstance) {
  io = ioInstance;
  notification.init(ioInstance);
}
const emitTo = (room, event, payload) => { if (io) io.to(room).emit(event, payload); };

function clearTimer(offerId) {
  const key = String(offerId);
  if (timers.has(key)) {
    clearTimeout(timers.get(key));
    timers.delete(key);
  }
}

function armTimer(offerId, ms) {
  clearTimer(offerId);
  const t = setTimeout(() => {
    timers.delete(String(offerId));
    expireOffer(offerId).catch((e) => console.error('[dispatch] expire failed:', e));
  }, Math.max(0, ms));
  if (t.unref) t.unref();
  timers.set(String(offerId), t);
}

const logOutcome = (bookingId, driverId, outcome) =>
  Booking.updateOne({ _id: bookingId }, { $push: { offerHistory: { driver: driverId, outcome, at: new Date() } } });

async function failDispatch(booking) {
  await Booking.updateOne({ _id: booking._id }, { dispatchFailed: true });
  notification.notifyNoDriver(booking);
  return { started: false, reason: 'no_driver' };
}

/** Offers the booking to the next-nearest untried driver. Safe to call repeatedly. */
async function startDispatch(bookingId) {
  const key = String(bookingId);
  if (running.has(key)) return { started: false, reason: 'busy' };
  running.add(key);
  try {
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.assignedDriver || !OPEN.includes(booking.status)) {
      return { started: false, reason: 'not_dispatchable' };
    }
    if (await JobOffer.exists({ booking: booking._id, status: 'pending' })) {
      return { started: false, reason: 'offer_pending' };
    }

    const tried = booking.offerHistory.filter((h) => h.outcome === 'offered').map((h) => h.driver);
    const max = maxAttempts();

    let radiusKm = Number(process.env.DISPATCH_RADIUS_KM) || 25;
    let escalatedNow = false;

    if (tried.length >= max) {
      if (tried.length === max) escalatedNow = true;
      radiusKm = radiusKm * 2;
    }
    if (tried.length >= max * 2) return failDispatch(booking);

    let [driver] = await assignment.findNearestDrivers(booking.pickupCoords, { 
      excludeIds: tried, 
      limit: 1, 
      serviceType: booking.serviceType,
      radiusKm 
    });

    if (!driver && tried.length < max) {
      escalatedNow = true;
      radiusKm = radiusKm * 2;
      const res = await assignment.findNearestDrivers(booking.pickupCoords, { 
        excludeIds: tried, 
        limit: 1, 
        serviceType: booking.serviceType,
        radiusKm 
      });
      driver = res[0];
    }

    if (!driver) return failDispatch(booking);

    if (escalatedNow) {
      emitTo('admin', 'dispatch:escalated', { 
        bookingNumber: booking.bookingNumber, 
        message: 'Search radius widened due to lack of drivers.' 
      });
    }

    const expiresAt = new Date(Date.now() + timeoutSeconds(booking.priority) * 1000);
    const offer = await JobOffer.create({
      booking: booking._id,
      driver: driver._id,
      attempt: tried.length + 1,
      distanceMeters: driver.distanceMeters ?? undefined,
      expiresAt,
    });
    await Booking.updateOne(
      { _id: booking._id },
      { dispatchFailed: false, $push: { offerHistory: { driver: driver._id, outcome: 'offered', at: new Date() } } }
    );
    armTimer(offer._id, expiresAt.getTime() - Date.now());
    await notification.notifyDriverOffer(driver, offer, booking);
    return { started: true, offerId: offer._id, driverId: driver._id };
  } finally {
    running.delete(key);
  }
}

/** Timer fired (or recovered after restart): mark expired, try the next driver. */
async function expireOffer(offerId) {
  const offer = await JobOffer.findOneAndUpdate(
    { _id: offerId, status: 'pending' },
    { status: 'expired', respondedAt: new Date() },
    { new: true }
  );
  if (!offer) return null; // already accepted / rejected / cancelled
  clearTimer(offerId);
  await logOutcome(offer.booking, offer.driver, 'expired');
  emitTo(`driver:${offer.driver}`, 'offer:expired', { offerId: String(offer._id) });
  await startDispatch(offer.booking);
  return offer;
}

/** Driver accepts. Resolves to { booking, driver } or throws a 409 AppError. */
async function acceptOffer(offerId, driverId) {
  const offer = await JobOffer.findOneAndUpdate(
    { _id: offerId, driver: driverId, status: 'pending', expiresAt: { $gt: new Date() } },
    { status: 'accepted', respondedAt: new Date() },
    { new: true }
  );
  if (!offer) throw new AppError('This job offer has expired or was already handled', 409);
  clearTimer(offerId);

  const driver = await assignment.reserveDriver(driverId, offer.booking);
  if (!driver) {
    await JobOffer.updateOne({ _id: offer._id }, { status: 'cancelled' });
    await startDispatch(offer.booking);
    throw new AppError('You cannot accept a job while offline or busy with another job', 409);
  }

  const booking = await Booking.findOneAndUpdate(
    { _id: offer.booking, assignedDriver: null, status: { $in: OPEN } },
    {
      assignedDriver: driver._id,
      status: 'Assigned',
      assignedAt: new Date(),
      remark: 'Driver assigned',
      dispatchFailed: false,
      $push: { offerHistory: { driver: driver._id, outcome: 'accepted', at: new Date() } },
    },
    { new: true }
  );
  if (!booking) {
    // Admin assigned someone else, or the customer cancelled, while the driver was tapping Accept
    await assignment.releaseDriver(driver._id);
    await JobOffer.updateOne({ _id: offer._id }, { status: 'cancelled' });
    throw new AppError('This booking is no longer available', 409);
  }

  await cancelOffersForDriver(driver._id); // they are busy now; hand their other offers on
  await notification.announceStatus(
    booking,
    'Assigned',
    `${driver.name} is on the job and will head to you shortly`,
    { role: 'driver', id: driver._id, name: driver.name }
  );
  return { booking, driver };
}

/** Driver rejects. The next-nearest driver is tried straight away. */
async function rejectOffer(offerId, driverId) {
  const offer = await JobOffer.findOneAndUpdate(
    { _id: offerId, driver: driverId, status: 'pending' },
    { status: 'rejected', respondedAt: new Date() },
    { new: true }
  );
  if (!offer) throw new AppError('This job offer has expired or was already handled', 409);
  clearTimer(offerId);
  await logOutcome(offer.booking, offer.driver, 'rejected');
  await startDispatch(offer.booking);
  return offer;
}

/** Cancels every open offer of a booking (admin assigned manually, or booking cancelled). */
async function cancelOffersForBooking(bookingId) {
  const open = await JobOffer.find({ booking: bookingId, status: 'pending' });
  await Promise.all(
    open.map(async (o) => {
      const updated = await JobOffer.findOneAndUpdate(
        { _id: o._id, status: 'pending' },
        { status: 'cancelled', respondedAt: new Date() }
      );
      if (!updated) return;
      clearTimer(o._id);
      emitTo(`driver:${o.driver}`, 'offer:cancelled', { offerId: String(o._id) });
    })
  );
}

/**
 * Cancels a driver's pending offers and re-dispatches those bookings.
 * Used when the driver becomes busy or goes offline.
 */
async function cancelOffersForDriver(driverId) {
  const open = await JobOffer.find({ driver: driverId, status: 'pending' });
  await Promise.all(
    open.map(async (o) => {
      const updated = await JobOffer.findOneAndUpdate(
        { _id: o._id, status: 'pending' },
        { status: 'cancelled', respondedAt: new Date() }
      );
      if (!updated) return;
      clearTimer(o._id);
      emitTo(`driver:${driverId}`, 'offer:cancelled', { offerId: String(o._id) });
      await startDispatch(o.booking);
    })
  );
}

/** Admin picks a driver by hand (also the fallback when dispatch failed). */
async function assignManually(bookingId, driverId, updatedBy = { role: 'admin' }) {
  const driver = await Driver.findOne({ _id: driverId, isVerified: true }).select('-password');
  if (!driver) throw new AppError('Driver not found or not verified', 404);

  const reserved = await assignment.reserveDriver(driverId, bookingId, { requireOnline: false });
  if (!reserved) throw new AppError('That driver is busy with another job', 409);

  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, assignedDriver: null, status: { $in: OPEN } },
    {
      assignedDriver: driverId,
      status: 'Assigned',
      assignedAt: new Date(),
      remark: 'Driver assigned by admin',
      dispatchFailed: false,
      $push: { offerHistory: { driver: driverId, outcome: 'accepted', at: new Date() } },
    },
    { new: true }
  );
  if (!booking) {
    await assignment.releaseDriver(driverId);
    throw new AppError('Booking is already assigned or closed', 409);
  }

  await cancelOffersForBooking(booking._id);
  await cancelOffersForDriver(driverId);
  await notification.announceStatus(booking, 'Assigned', `${driver.name} has been assigned to you`, updatedBy);
  emitTo(`driver:${driverId}`, 'job:assigned', { bookingNumber: booking.bookingNumber });
  return { booking, driver };
}

/** Call once at boot: re-arms timers for offers that were pending when the server stopped. */
async function recoverPendingOffers() {
  const pending = await JobOffer.find({ status: 'pending' });
  for (const offer of pending) {
    const ms = offer.expiresAt.getTime() - Date.now();
    if (ms <= 0) {
      // eslint-disable-next-line no-await-in-loop
      await expireOffer(offer._id);
    } else {
      armTimer(offer._id, ms);
    }
  }

  // Bookings created just before a crash that never got an offer
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const stuck = await Booking.find({
    status: 'Pending', assignedDriver: null, dispatchFailed: false, createdAt: { $gte: since },
  }).select('_id');
  for (const b of stuck) {
    // eslint-disable-next-line no-await-in-loop
    await startDispatch(b._id);
  }
  return { rearmed: pending.length, redispatched: stuck.length };
}

module.exports = {
  init, startDispatch, acceptOffer, rejectOffer, expireOffer,
  cancelOffersForBooking, cancelOffersForDriver, assignManually, recoverPendingOffers,
};
