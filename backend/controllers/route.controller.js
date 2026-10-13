/**
 * Route line + ETA from the driver to the customer, for the tracking map.
 *   POST /api/route/booking      customer: { bookingNumber, phone }
 *   GET  /api/route/share/:token PUBLIC: for share-link viewers
 *   GET  /api/route/job          driver: route to the customer for the active job
 *
 * All return { route: { distanceMeters, durationSeconds, etaMinutes, path:[[lat,lng]...], approximate,
 *                       driverLocation, pickup } } or { route: null } when there is nothing to route yet.
 */
const Booking = require('../models/Booking');
const Driver = require('../models/Driver');
const { asyncHandler } = require('../middleware/errorHandler');
const { getRoute } = require('../services/routing.service');
const tokenService = require('../services/token.service');
const { fromPoint } = require('../utils/geo');
const { findOwnedBooking } = require('./booking.controller').helpers;

/** Driver -> pickup, only while the job is live. */
async function routeFor(booking, driverLocation) {
  const pickup = fromPoint(booking.pickupCoords);
  if (!['Assigned', 'On The Way'].includes(booking.status) || !driverLocation || !pickup) return null;
  const route = await getRoute(driverLocation, pickup);
  return { ...route, driverLocation, pickup };
}

exports.forCustomer = asyncHandler(async (req, res) => {
  const booking = await findOwnedBooking(req.body.bookingNumber, req.body.phone, { populateDriver: true });
  const loc = booking.assignedDriver ? fromPoint(booking.assignedDriver.location) : null;
  res.json({ success: true, data: { route: await routeFor(booking, loc) } });
});

exports.forShare = asyncHandler(async (req, res) => {
  const booking = await tokenService.resolveShareToken(req.params.token);
  if (!booking) return res.status(404).json({ success: false, message: 'This tracking link is invalid or has expired' });
  const loc = booking.assignedDriver ? fromPoint(booking.assignedDriver.location) : null;
  return res.json({ success: true, data: { route: await routeFor(booking, loc) } });
});

exports.forDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.user.id).select('currentBooking location');
  const booking = driver && driver.currentBooking ? await Booking.findById(driver.currentBooking) : null;
  if (!booking) return res.json({ success: true, data: { route: null } });
  return res.json({ success: true, data: { route: await routeFor(booking, fromPoint(driver.location)) } });
});
