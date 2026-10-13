/**
 * Share-tracking link.
 *   POST /api/bookings/:bookingNumber/share   customer: { phone } -> creates the link
 *   GET  /api/share/:token                    PUBLIC, no login: read-only tracking data
 *
 * A share viewer sees status, the driver's first details and live position.
 * No phone numbers, email, diagnosis photo or chat.
 */
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const tokenService = require('../services/token.service');
const { buildWaShareUrl, trackingLinkText } = require('../utils/shareText');
const { getRoute } = require('../services/routing.service');
const { fromPoint } = require('../utils/geo');
const { findOwnedBooking, publicBooking, timelineOf } = require('./booking.controller').helpers;

const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '');

exports.createShareLink = asyncHandler(async (req, res) => {
  const booking = await findOwnedBooking(req.params.bookingNumber, req.body.phone);
  if (['Completed', 'Rejected', 'Cancelled'].includes(booking.status)) {
    throw new AppError('This booking is finished, so it can no longer be shared', 400);
  }
  const token = await tokenService.createShareToken(booking); // creating a new link cancels the old one
  const url = `${clientUrl()}/share/${token}`;
  res.status(201).json({
    success: true,
    data: { url, whatsappUrl: buildWaShareUrl(trackingLinkText(booking, url)) },
  });
});

exports.getShared = asyncHandler(async (req, res) => {
  const booking = await tokenService.resolveShareToken(req.params.token);
  if (!booking) throw new AppError('This tracking link is invalid or has expired', 404);

  const view = publicBooking(booking, { forShare: true });
  const driverLoc = booking.assignedDriver ? fromPoint(booking.assignedDriver.location) : null;
  const pickup = fromPoint(booking.pickupCoords);
  const live = ['Assigned', 'On The Way'].includes(booking.status);
  const eta = live && driverLoc && pickup ? await getRoute(driverLoc, pickup) : null;

  res.json({ success: true, data: { booking: view, timeline: await timelineOf(booking._id), eta } });
});
