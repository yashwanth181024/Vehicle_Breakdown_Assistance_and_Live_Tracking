/**
 * Admin-only actions that don't belong to bookings or drivers directly.
 *   PUT  /api/admin/profile                              name, mobile, email
 *   PUT  /api/admin/password                             { currentPassword, newPassword }
 *   GET  /api/admin/pages/:type          (PUBLIC)        about us / contact us content
 *   PUT  /api/admin/pages/:type                          edit that content
 *   GET  /api/admin/bookings/:bookingNumber/candidates   drivers who could take this job
 *   POST /api/admin/bookings/:bookingNumber/assign       { driverId }
 *   GET  /api/admin/live-drivers                         drivers on the map
 */
const Admin = require('../models/Admin');
const Driver = require('../models/Driver');
const Booking = require('../models/Booking');
const Page = require('../models/Page');
const Pricing = require('../models/Pricing');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { fromPoint, haversineMeters, metersToKm } = require('../utils/geo');
const dispatch = require('../services/dispatch.service');

const PAGE_TYPES = ['aboutus', 'contactus'];
const stripTags = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

exports.updateProfile = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.user.id);
  if (!admin) throw new AppError('Account no longer exists', 401);
  ['name', 'mobile', 'email'].forEach((k) => { if (req.body[k] !== undefined) admin[k] = req.body[k]; });
  await admin.save();
  res.json({ success: true, data: admin });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.user.id).select('+password');
  if (!admin || !(await admin.comparePassword(req.body.currentPassword))) {
    throw new AppError('Current password is incorrect', 400);
  }
  admin.password = req.body.newPassword;
  await admin.save();
  res.json({ success: true, message: 'Password updated' });
});

// ---------- Pages ----------
exports.getPage = asyncHandler(async (req, res) => {
  if (!PAGE_TYPES.includes(req.params.type)) throw new AppError('Unknown page', 404);
  const page = await Page.findOne({ pageType: req.params.type });
  if (!page) throw new AppError('Page content has not been added yet', 404);
  res.json({ success: true, data: page });
});

exports.updatePage = asyncHandler(async (req, res) => {
  if (!PAGE_TYPES.includes(req.params.type)) throw new AppError('Unknown page', 404);
  const update = {};
  ['title', 'email', 'mobile', 'timing'].forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  // Plain text only: tags are stripped so stored content can never carry a script
  if (req.body.description !== undefined) update.description = stripTags(req.body.description);

  const page = await Page.findOneAndUpdate(
    { pageType: req.params.type },
    { $set: update, $setOnInsert: { pageType: req.params.type, ...(update.title ? {} : { title: req.params.type === 'aboutus' ? 'About Us' : 'Contact Us' }) } },
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ success: true, data: page });
});

// ---------- Assigning ----------
exports.candidates = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ bookingNumber: Number.parseInt(req.params.bookingNumber, 10) }).lean();
  if (!booking) throw new AppError('Booking not found', 404);

  const pickup = fromPoint(booking.pickupCoords);
  const drivers = await Driver.find({ verificationStatus: 'verified', isAvailable: true }).select('driverId name mobile vehicle rating isOnline location').lean();

  const rows = drivers
    .map((d) => {
      const loc = fromPoint(d.location);
      const distanceKm = pickup && loc ? metersToKm(haversineMeters(pickup, loc)) : null;
      return { _id: d._id, driverId: d.driverId, name: d.name, mobile: d.mobile, vehicle: d.vehicle, rating: d.rating, isOnline: d.isOnline, distanceKm };
    })
    // online first, then nearest; drivers with no known location go last
    .sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

  res.json({ success: true, data: rows });
});

exports.assignDriver = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ bookingNumber: Number.parseInt(req.params.bookingNumber, 10) }).select('_id bookingNumber');
  if (!booking) throw new AppError('Booking not found', 404);
  if (!req.body.driverId) throw new AppError('Choose a driver', 400);

  const { booking: updated, driver } = await dispatch.assignManually(
    booking._id, req.body.driverId, { role: 'admin', id: req.user.id }
  );

  // The driver's open tabs start following this job straight away
  const io = req.app.get('io');
  if (io) io.in(`driver:${driver._id}`).socketsJoin([`booking:${updated.bookingNumber}`, `chat:${updated.bookingNumber}`]);

  res.json({ success: true, data: { bookingNumber: updated.bookingNumber, status: updated.status, driver: { name: driver.name } } });
});

exports.liveDrivers = asyncHandler(async (_req, res) => {
  const drivers = await Driver.find({ verificationStatus: 'verified', location: { $exists: true } })
    .select('driverId name isOnline isAvailable location locationUpdatedAt currentBooking')
    .lean();
  res.json({
    success: true,
    data: drivers.map((d) => ({
      id: d._id, driverId: d.driverId, name: d.name, isOnline: d.isOnline, isBusy: !d.isAvailable,
      ...fromPoint(d.location), updatedAt: d.locationUpdatedAt,
    })),
  });
});

// ---------- Pricing ----------
exports.getPricings = asyncHandler(async (req, res) => {
  const pricings = await Pricing.find().sort({ serviceType: 1 });
  res.json({ success: true, data: pricings });
});

exports.updatePricing = asyncHandler(async (req, res) => {
  const { serviceType } = req.params;
  const { basePrice, perKmRate } = req.body;
  const pricing = await Pricing.findOneAndUpdate(
    { serviceType },
    { basePrice: Number(basePrice), perKmRate: Number(perKmRate) },
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ success: true, data: pricing });
});
