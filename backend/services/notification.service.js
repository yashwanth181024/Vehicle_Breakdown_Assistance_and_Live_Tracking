/**
 * One place for everything that tells somebody something:
 *   - Socket.IO events to the admin, the driver and the tracking page
 *   - an entry in the tracking timeline
 *
 * Socket rooms (created in sockets/index.js):
 *   admin                    every logged-in admin
 *   driver:<driverMongoId>   one driver
 *   booking:<bookingNumber>  customer tracking page + assigned driver + admin watching
 *
 * Events emitted from here:
 *   admin   -> admin:alert   { type, bookingNumber, severity, message }
 *   admin   -> booking:updated { bookingNumber, status }
 *   booking -> booking:status  { bookingNumber, status, remark, at, updatedBy }
 *   driver  -> offer:new       { offerId, bookingNumber, ... }
 */
const Tracking = require('../models/Tracking');
const { fromPoint, metersToKm } = require('../utils/geo');

let io = null;
const init = (ioInstance) => { io = ioInstance; };
const emitTo = (room, event, payload) => { if (io) io.to(room).emit(event, payload); };

const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');
const trackUrl = (booking) => `${clientUrl()}/track?bookingNumber=${booking.bookingNumber}`;

/** Booking just created: confirm to the customer and ring the admin. */
async function notifyNewBooking(booking) {
  const severe = ['high', 'critical'].includes(booking.severity);
  emitTo('admin', 'admin:alert', {
    type: severe ? 'sos' : 'new_booking',
    bookingNumber: booking.bookingNumber,
    severity: booking.severity,
    message: `${severe ? 'URGENT: ' : ''}New ${booking.serviceType} request #${booking.bookingNumber} at ${booking.pickupLocation}`,
  });
  emitTo('admin', 'booking:updated', { bookingNumber: booking.bookingNumber, status: booking.status });
  return { success: true };
}

/**
 * Records a status change and pushes it live.
 * The caller must already have saved the new status on the booking.
 */
async function announceStatus(booking, status, remark, updatedBy = { role: 'system' }, { notifyCustomer } = {}) {
  const entry = await Tracking.create({
    booking: booking._id,
    bookingNumber: booking.bookingNumber,
    status,
    remark,
    updatedBy,
  });

  const payload = {
    bookingNumber: booking.bookingNumber,
    status,
    remark,
    at: entry.createdAt,
    updatedBy: updatedBy.role,
  };
  emitTo(`booking:${booking.bookingNumber}`, 'booking:status', payload);
  emitTo('admin', 'booking:updated', { bookingNumber: booking.bookingNumber, status });

  return entry;
}

/** The data a driver's app needs to show the offer modal and countdown. */
function buildOfferPayload(offer, booking) {
  return {
    offerId: String(offer._id),
    bookingNumber: booking.bookingNumber,
    customerName: booking.name,
    serviceType: booking.serviceType,
    severity: booking.severity,
    pickupLocation: booking.pickupLocation,
    pickup: fromPoint(booking.pickupCoords),
    distanceKm: offer.distanceMeters != null ? metersToKm(offer.distanceMeters) : null,
    expiresAt: offer.expiresAt,
    timeoutSeconds: Math.max(1, Math.round((new Date(offer.expiresAt).getTime() - Date.now()) / 1000)),
  };
}

/** Pushes a job offer to a driver via Socket.IO. */
async function notifyDriverOffer(driver, offer, booking) {
  const payload = buildOfferPayload(offer, booking);
  const room = `driver:${driver._id}`;
  emitTo(room, 'offer:new', payload);
}

/** Nobody accepted: tell the admin so they can assign manually. */
function notifyNoDriver(booking) {
  emitTo('admin', 'admin:alert', {
    type: 'no_driver',
    bookingNumber: booking.bookingNumber,
    severity: booking.severity,
    message: `No driver accepted booking #${booking.bookingNumber}. Please assign one manually.`,
  });
  emitTo('admin', 'booking:updated', { bookingNumber: booking.bookingNumber, status: booking.status });
}

module.exports = {
  init, emitTo, trackUrl,
  notifyNewBooking, announceStatus, buildOfferPayload, notifyDriverOffer, notifyNoDriver,
};
