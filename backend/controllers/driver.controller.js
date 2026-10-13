/**
 * Drivers.
 *
 * Admin (role admin):
 *   GET    /api/drivers                 list + search + filters
 *   POST   /api/drivers                 add driver
 *   GET    /api/drivers/:id
 *   PUT    /api/drivers/:id             edit
 *   PATCH  /api/drivers/:id/verify      { isVerified }
 *   DELETE /api/drivers/:id
 *
 * Driver (role driver) - declare these BEFORE "/:id" in the router:
 *   GET   /api/drivers/me/profile
 *   PATCH /api/drivers/me/online        { isOnline }
 *   PATCH /api/drivers/me/password      { currentPassword, newPassword }
 *   POST  /api/drivers/me/location      { lat, lng }            (REST fallback for the socket)
 *   GET   /api/drivers/me/active        current job with customer contact
 *   GET   /api/drivers/me/jobs          history with ratings
 *   GET   /api/drivers/me/offers        open offers
 *   POST  /api/drivers/me/offers/:offerId/accept|reject         (REST fallback for the socket)
 */
const Driver = require('../models/Driver');
const Booking = require('../models/Booking');
const JobOffer = require('../models/JobOffer');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { toPoint, fromPoint } = require('../utils/geo');
const dispatch = require('../services/dispatch.service');
const { buildOfferPayload } = require('../services/notification.service');
const { escapeRegex } = require('./booking.controller').helpers;

const pageParams = (req) => ({
  page: Math.max(1, Number.parseInt(req.query.page, 10) || 1),
  limit: Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20)),
});

const driverFields = (b) => {
  const out = {};
  ['name', 'mobile', 'email', 'address'].forEach((k) => { if (b[k] !== undefined) out[k] = b[k]; });
  if (b.vehicleType !== undefined) out['vehicle.type'] = b.vehicleType;
  if (b.vehicleNumber !== undefined) out['vehicle.number'] = b.vehicleNumber;
  return out;
};

// ---------- Admin ----------
exports.listDrivers = asyncHandler(async (req, res) => {
  const { q, online, verified } = req.query;
  const { page, limit } = pageParams(req);
  const filter = {};
  if (online === 'true' || online === 'false') filter.isOnline = online === 'true';
  if (verified === 'true' || verified === 'false') filter.verificationStatus = verified === 'true' ? 'verified' : { $ne: 'verified' };
  if (req.query.verificationStatus) filter.verificationStatus = req.query.verificationStatus;
  if (q && String(q).trim()) {
    const rx = new RegExp(escapeRegex(String(q).trim().slice(0, 60)), 'i');
    filter.$or = [{ name: rx }, { driverId: rx }, { mobile: rx }, { email: rx }];
  }
  const [data, total] = await Promise.all([
    Driver.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Driver.countDocuments(filter),
  ]);
  res.json({ success: true, data, page, pages: Math.ceil(total / limit) || 1, total });
});

exports.createDriver = asyncHandler(async (req, res) => {
  const b = req.body;
  const driver = await Driver.create({
    driverId: b.driverId,
    password: b.password,
    ...Object.fromEntries(Object.entries(driverFields(b)).filter(([k]) => !k.includes('.'))),
    vehicle: { type: b.vehicleType, number: b.vehicleNumber },
    verificationStatus: 'verified', // an admin adding a driver is the verification
  });
  res.status(201).json({ success: true, data: driver });
});

exports.getDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) throw new AppError('Driver not found', 404);
  res.json({ success: true, data: driver });
});

exports.updateDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) throw new AppError('Driver not found', 404);

  driver.set(driverFields(req.body));
  if (req.body.password) driver.password = req.body.password; // hashed by the model's pre-save hook
  await driver.save();
  res.json({ success: true, data: driver });
});

exports.verifyDriver = asyncHandler(async (req, res) => {
  const { status, rejectionReason } = req.body; // status can be 'verified' or 'rejected'
  const isVerified = status === 'verified';
  const driver = await Driver.findByIdAndUpdate(
    req.params.id,
    { 
      verificationStatus: status || 'verified',
      rejectionReason: rejectionReason || null,
      ...(!isVerified && { isOnline: false }) 
    },
    { new: true }
  );
  if (!driver) throw new AppError('Driver not found', 404);
  if (!isVerified) await dispatch.cancelOffersForDriver(driver._id);
  res.json({ success: true, data: driver });
});

exports.deleteDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) throw new AppError('Driver not found', 404);
  if (driver.currentBooking) throw new AppError('This driver is on a job. Finish or reassign it first.', 409);
  await dispatch.cancelOffersForDriver(driver._id);
  await driver.deleteOne();
  res.json({ success: true, message: 'Driver deleted' });
});

// ---------- Driver (self) ----------
exports.myProfile = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.user.id);
  if (!driver) throw new AppError('Account no longer exists', 401);
  res.json({ success: true, data: driver });
});

exports.uploadDocument = asyncHandler(async (req, res) => {
  const name = req.body.name;
  if (!name) throw new AppError('Document name is required', 400);
  if (!req.file) throw new AppError('File is required', 400);

  const url = `/uploads/documents/${req.file.filename}`;

  const driver = await Driver.findById(req.user.id);
  if (!driver) throw new AppError('Account no longer exists', 401);

  driver.documents.push({ name, url, status: 'pending' });
  driver.verificationStatus = 'pending'; // Requires re-verification
  await driver.save();
  res.json({ success: true, data: driver });
});

exports.setOnline = asyncHandler(async (req, res) => {
  const { isOnline } = req.body;
  if (typeof isOnline !== 'boolean') throw new AppError('isOnline must be true or false', 400);

  const driver = await Driver.findById(req.user.id);
  if (!driver) throw new AppError('Account no longer exists', 401);

  if (isOnline && driver.verificationStatus !== 'verified') {
    throw new AppError('Your account is waiting for admin approval before you can take jobs', 403);
  }
  if (!isOnline && driver.currentBooking) {
    throw new AppError('Finish your current job before going offline', 409);
  }

  driver.isOnline = isOnline;
  await driver.save();
  if (!isOnline) await dispatch.cancelOffersForDriver(driver._id); // hand open offers to the next driver
  res.json({ success: true, data: driver });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.user.id).select('+password');
  if (!driver || !(await driver.comparePassword(req.body.currentPassword))) {
    throw new AppError('Current password is incorrect', 400);
  }
  driver.password = req.body.newPassword;
  await driver.save();
  res.json({ success: true, message: 'Password updated' });
});

exports.updateLocation = asyncHandler(async (req, res) => {
  const point = toPoint(req.body.lat, req.body.lng);
  if (!point) throw new AppError('Invalid coordinates', 400);
  await Driver.updateOne({ _id: req.user.id }, { location: point, locationUpdatedAt: new Date() });
  res.json({ success: true });
});

exports.activeJob = asyncHandler(async (req, res) => {
  const driver = await Driver.findById(req.user.id).select('currentBooking');
  const booking = driver && driver.currentBooking
    ? await Booking.findOne({ _id: driver.currentBooking, status: { $in: ['Assigned', 'On The Way'] } })
    : null;
  if (!booking) return res.json({ success: true, data: null });

  // The driver needs the customer's contact; nothing else private is included
  return res.json({
    success: true,
    data: {
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      customer: { name: booking.name, phone: booking.phone },
      serviceType: booking.serviceType,
      severity: booking.severity,
      description: booking.description,
      vehicleType: booking.vehicleType,
      vehicleNumber: booking.vehicleNumber,
      pickupLocation: booking.pickupLocation,
      pickup: fromPoint(booking.pickupCoords),
      destination: booking.destination,
      destinationCoords: fromPoint(booking.destinationCoords),
      assignedAt: booking.assignedAt,
    },
  });
});

exports.myJobs = asyncHandler(async (req, res) => {
  const { page, limit } = pageParams(req);
  const filter = { assignedDriver: req.user.id, ...(Booking.STATUSES.includes(req.query.status) && { status: req.query.status }) };
  const [rows, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .select('bookingNumber name serviceType status pickupLocation createdAt assignedAt completedAt rating feedback')
      .lean(),
    Booking.countDocuments(filter),
  ]);
  res.json({ success: true, data: rows, page, pages: Math.ceil(total / limit) || 1, total });
});

exports.myEarnings = asyncHandler(async (req, res) => {
  const mongoose = require('mongoose');
  const driverId = req.user.id;
  const [stats] = await Booking.aggregate([
    { $match: { assignedDriver: new mongoose.Types.ObjectId(driverId), status: 'Completed' } },
    { $group: {
      _id: null,
      completedJobs: { $sum: 1 },
      totalEarned: { $sum: '$fare' },
      avgRating: { $avg: '$rating' }
    }}
  ]);

  const data = stats ? {
    completedJobs: stats.completedJobs,
    totalEarned: stats.totalEarned || 0,
    avgRating: stats.avgRating ? Math.round(stats.avgRating * 10) / 10 : null
  } : { completedJobs: 0, totalEarned: 0, avgRating: null };

  res.json({ success: true, data });
});

exports.myOffers = asyncHandler(async (req, res) => {
  const offers = await JobOffer.find({ driver: req.user.id, status: 'pending', expiresAt: { $gt: new Date() } }).populate('booking');
  res.json({ success: true, data: offers.filter((o) => o.booking).map((o) => buildOfferPayload(o, o.booking)) });
});

exports.acceptOffer = asyncHandler(async (req, res) => {
  const { booking } = await dispatch.acceptOffer(req.params.offerId, req.user.id);
  const io = req.app.get('io');
  if (io) io.in(`driver:${req.user.id}`).socketsJoin([`booking:${booking.bookingNumber}`, `chat:${booking.bookingNumber}`]);
  res.json({ success: true, data: { bookingNumber: booking.bookingNumber } });
});

exports.rejectOffer = asyncHandler(async (req, res) => {
  await dispatch.rejectOffer(req.params.offerId, req.user.id);
  res.json({ success: true });
});
