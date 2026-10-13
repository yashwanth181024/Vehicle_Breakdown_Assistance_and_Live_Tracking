/**
 * Driver side of dispatch.
 *
 * Server -> driver (emitted by dispatch.service / notification.service)
 *   offer:new       { offerId, bookingNumber, pickup, distanceKm, expiresAt, timeoutSeconds, ... }
 *   offer:expired   { offerId }
 *   offer:cancelled { offerId }
 *   job:assigned    { bookingNumber }          (admin assigned the driver by hand)
 *
 * Driver -> server (with ack)
 *   offer:accept { offerId }  -> { ok, bookingNumber } | { ok:false, message }
 *   offer:reject { offerId }  -> { ok } | { ok:false, message }
 */
const mongoose = require('mongoose');
const JobOffer = require('../models/JobOffer');
const dispatch = require('../services/dispatch.service');
const { buildOfferPayload } = require('../services/notification.service');

const ackOf = (fn) => (typeof fn === 'function' ? fn : () => {});

function register(io, socket) {
  if (socket.data.role !== 'driver') return;

  socket.on('offer:accept', async (payload, ack) => {
    const reply = ackOf(ack);
    try {
      const offerId = payload && payload.offerId;
      if (!mongoose.isValidObjectId(offerId)) return reply({ ok: false, message: 'Invalid offer' });

      const { booking } = await dispatch.acceptOffer(offerId, socket.data.id);
      const n = booking.bookingNumber;

      // Every open tab of this driver follows the job: status, location and chat
      io.in(`driver:${socket.data.id}`).socketsJoin([`booking:${n}`, `chat:${n}`]);
      socket.data.activeBooking = { n, at: Date.now() };
      return reply({ ok: true, bookingNumber: n });
    } catch (err) {
      return reply({ ok: false, message: err.statusCode ? err.message : 'Could not accept the job' });
    }
  });

  socket.on('offer:reject', async (payload, ack) => {
    const reply = ackOf(ack);
    try {
      const offerId = payload && payload.offerId;
      if (!mongoose.isValidObjectId(offerId)) return reply({ ok: false, message: 'Invalid offer' });
      await dispatch.rejectOffer(offerId, socket.data.id);
      return reply({ ok: true });
    } catch (err) {
      return reply({ ok: false, message: err.statusCode ? err.message : 'Could not reject the job' });
    }
  });
}

/** Re-sends offers that are still open, for a driver who just (re)connected or refreshed. */
async function sendPendingOffers(socket) {
  const offers = await JobOffer.find({
    driver: socket.data.id,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).populate('booking');

  offers.forEach((offer) => {
    if (offer.booking) socket.emit('offer:new', buildOfferPayload(offer, offer.booking));
  });
}

module.exports = { register, sendPendingOffers };
