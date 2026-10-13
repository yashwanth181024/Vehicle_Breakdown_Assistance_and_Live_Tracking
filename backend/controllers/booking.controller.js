/**
 * Bookings.
 *   POST  /api/bookings                         create (public, rate limited)
 *   POST  /api/bookings/track                   customer tracks: { bookingNumber, phone }
 *   POST  /api/bookings/:bookingNumber/cancel   customer cancels: { phone, reason }
 *   POST  /api/bookings/:bookingNumber/rating   customer rates: { phone, rating, feedback }
 *   GET   /api/bookings                         admin: list, search, filter (urgent first)
 *   GET   /api/bookings/:bookingNumber          admin or the assigned driver
 *   PATCH /api/bookings/:bookingNumber/status   admin or the assigned driver
 */
const Booking = require('../models/Booking');
const Driver = require('../models/Driver');
const Tracking = require('../models/Tracking');
const Pricing = require('../models/Pricing');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { generateUniqueBookingNumber } = require('../utils/bookingNumber');
const PDFDocument = require('pdfkit');
const { toPoint, fromPoint } = require('../utils/geo');
const dispatch = require('../services/dispatch.service');
const assignment = require('../services/assignment.service');
const notification = require('../services/notification.service');
const tokenService = require('../services/token.service');

// ---------- Shared helpers (also used by the share, route and chat controllers) ----------
const last10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);
const OWNER_ERROR = 'Booking not found, or the phone number does not match';
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Finds a booking and checks that the phone number belongs to it. Same error for both failures. */
async function findOwnedBooking(bookingNumber, phone, { populateDriver = false } = {}) {
  const n = Number.parseInt(bookingNumber, 10);
  if (!Number.isInteger(n) || last10(phone).length !== 10) throw new AppError(OWNER_ERROR, 404);
  const query = Booking.findOne({ bookingNumber: n });
  if (populateDriver) query.populate('assignedDriver', 'driverId name mobile vehicle rating location');
  const booking = await query;
  if (!booking || last10(booking.phone) !== last10(phone)) throw new AppError(OWNER_ERROR, 404);
  return booking;
}

/**
 * What a customer (or, with forShare, a family member holding the link) may see.
 * Share viewers never get phone numbers, email, diagnosis or the plate.
 */
function publicBooking(booking, { forShare = false } = {}) {
  const d = booking.assignedDriver && booking.assignedDriver.name ? booking.assignedDriver : null;
  return {
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    serviceType: booking.serviceType,
    severity: booking.severity,
    pickupLocation: booking.pickupLocation,
    pickup: fromPoint(booking.pickupCoords),
    destination: booking.destination,
    destinationCoords: fromPoint(booking.destinationCoords),
    remark: booking.remark,
    createdAt: booking.createdAt,
    assignedAt: booking.assignedAt,
    completedAt: booking.completedAt,
    canChat: !forShare && ['Assigned', 'On The Way'].includes(booking.status),
    ...(!forShare && {
      name: booking.name,
      vehicleType: booking.vehicleType,
      vehicleNumber: booking.vehicleNumber,
      rating: booking.rating,
    }),
    driver: d
      ? {
          name: d.name,
          vehicle: d.vehicle,
          rating: d.rating,
          location: fromPoint(d.location),
          ...(!forShare && { mobile: d.mobile }),
        }
      : null,
  };
}

const timelineOf = async (bookingId) =>
  (await Tracking.find({ booking: bookingId }).sort({ createdAt: 1 }).lean()).map((t) => ({
    status: t.status, remark: t.remark, at: t.createdAt,
  }));

// ---------- Triage ----------
const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical'];
const BASE_SEVERITY = { 'Accident Recovery': 'critical', Lockout: 'low', 'Fuel Delivery': 'low' };
const CRITICAL_WORDS = /\b(fire|smoke|smoking|injur\w*|trapped|unconscious|overturned|rolled over)\b/i;
const HIGH_WORDS = /\b(accident|crash\w*|collision|highway|expressway|flood\w*|night|alone|child|baby|ghat)\b/i;

const SERVICE_KEYWORDS = [
  { type: 'Battery Jump-start', regex: /\b(battery|jump|won't start|doesn't start|crank|alternator)\b/i },
  { type: 'Flat Tyre', regex: /\b(tyre|tire|flat|puncture|burst|air)\b/i },
  { type: 'Fuel Delivery', regex: /\b(fuel|gas|petrol|diesel|empty)\b/i },
  { type: 'Lockout', regex: /\b(lock\w*|key|keys|locked out)\b/i },
  { type: 'Engine Problem', regex: /\b(engine|heat|hot|coolant|leak\w*|oil|won't start|noise)\b/i },
  { type: 'Accident Recovery', regex: /\b(accident|crash\w*|collision|hit|smash)\b/i },
];

/** Urgency and service type ranking from description. */
function triageBooking({ serviceType, description = '', hint }) {
  let finalService = serviceType;
  if (!finalService || finalService === 'Other') {
    const match = SERVICE_KEYWORDS.find((k) => k.regex.test(description));
    if (match) finalService = match.type;
    else finalService = 'Other';
  }

  let level = BASE_SEVERITY[finalService] || 'medium';
  if (CRITICAL_WORDS.test(description)) level = 'critical';
  else if (HIGH_WORDS.test(description) && SEVERITY_ORDER.indexOf(level) < 2) level = 'high';
  if (SEVERITY_ORDER.includes(hint) && SEVERITY_ORDER.indexOf(hint) > SEVERITY_ORDER.indexOf(level)) level = hint;
  
  const priority = level === 'critical' ? 'critical' : 'normal';

  return { serviceType: finalService, severity: level, priority };
}

// ---------- Status changes ----------
const TRANSITIONS = {
  Pending: ['Approved', 'Rejected', 'Cancelled', 'False Alarm'],
  Approved: ['Rejected', 'Cancelled', 'False Alarm'],
  Assigned: ['On The Way', 'Completed', 'Cancelled', 'False Alarm'],
  'On The Way': ['Completed', 'Cancelled', 'False Alarm'],
};
const DRIVER_MAY = { Assigned: ['On The Way'], 'On The Way': ['Completed'] };
const CUSTOMER_MAY = ['Pending', 'Approved', 'Assigned'];
const CLOSING = ['Completed', 'Rejected', 'Cancelled', 'False Alarm'];
const DEFAULT_REMARK = {
  Approved: 'Your request has been approved',
  'On The Way': 'The driver is on the way',
  Completed: 'Job completed. Thank you for choosing us',
  Rejected: 'Your request could not be accepted',
  Cancelled: 'Booking cancelled',
  'False Alarm': 'SOS was marked as a false alarm',
};

/**
 * The one place a booking's status changes. Checks who may do it, applies it atomically,
 * frees the driver, cancels open offers, ends the share link, and notifies everyone.
 * @param {{role:'admin'|'driver'|'customer', id?:string, name?:string}} by
 */
async function applyStatus(bookingNumber, newStatus, { remark, cancelReason, by }) {
  const booking = await Booking.findOne({ bookingNumber });
  if (!booking) throw new AppError('Booking not found', 404);

  if (!(TRANSITIONS[booking.status] || []).includes(newStatus)) {
    throw new AppError(`A ${booking.status} booking cannot be changed to ${newStatus}`, 400);
  }
  if (by.role === 'driver') {
    if (String(booking.assignedDriver) !== String(by.id)) throw new AppError('This job is not assigned to you', 403);
    if (!(DRIVER_MAY[booking.status] || []).includes(newStatus)) {
      throw new AppError(`You cannot mark this job as ${newStatus}`, 403);
    }
  }
  if (by.role === 'customer' && !CUSTOMER_MAY.includes(booking.status)) {
    throw new AppError('The driver is already on the way. Please call the driver to cancel.', 409);
  }
  if (newStatus === 'Rejected' && !remark) throw new AppError('Please give a reason for rejecting', 400);

  const set = { status: newStatus, remark: remark || DEFAULT_REMARK[newStatus] };
  if (newStatus === 'Completed') {
    set.completedAt = new Date();
    const pricing = await Pricing.findOne({ serviceType: booking.serviceType });
    if (pricing) {
      set.fare = pricing.basePrice + (pricing.perKmRate * (booking.distanceKm || 0));
    }
  }
  if (['Cancelled', 'Rejected'].includes(newStatus)) set.cancelReason = cancelReason || remark || undefined;

  // Only succeeds if nobody changed the status since we read it
  const updated = await Booking.findOneAndUpdate({ _id: booking._id, status: booking.status }, set, { new: true });
  if (!updated) throw new AppError('This booking was just updated by someone else. Please refresh.', 409);

  if (CLOSING.includes(newStatus)) {
    await dispatch.cancelOffersForBooking(updated._id);
    if (updated.assignedDriver) {
      await assignment.releaseDriver(updated.assignedDriver, { completedJob: newStatus === 'Completed' });
      if (newStatus !== 'Completed' && by.role !== 'driver') {
        notification.emitTo(`driver:${updated.assignedDriver}`, 'job:cancelled', { bookingNumber });
      }
    }
    await tokenService.expireShareToken(updated._id);
  }

  await notification.announceStatus(updated, newStatus, set.remark, by);
  return updated;
}

// ---------- Handlers ----------
const pickDiagnosis = (d) => {
  if (!d || typeof d !== 'object') return undefined;
  const photoOk = typeof d.photoUrl === 'string' && /^\/uploads\/diagnosis\/[\w.-]+$/.test(d.photoUrl);
  return {
    problem: String(d.problem || '').slice(0, 300),
    suggestedService: d.suggestedService,
    confidence: d.confidence,
    advice: String(d.advice || '').slice(0, 400),
    photoUrl: photoOk ? d.photoUrl : undefined,
  };
};

exports.createBooking = asyncHandler(async (req, res) => {
  const b = req.body;

  // One active request per phone number stops duplicate and spam bookings
  const open = await Booking.findOne({
    phone: b.phone,
    status: { $in: ['Pending', 'Approved', 'Assigned', 'On The Way'] },
  }).select('bookingNumber').lean();
  if (open) {
    throw new AppError(
      `You already have an active request (#${open.bookingNumber}). Please track or cancel it first.`,
      409,
      { bookingNumber: open.bookingNumber }
    );
  }

  const diagnosis = pickDiagnosis(b.diagnosis);
  const triage = triageBooking({ serviceType: b.serviceType, description: b.description, hint: b.diagnosisSeverity });
  
  const booking = await Booking.create({
    bookingNumber: await generateUniqueBookingNumber(Booking),
    name: b.name,
    email: b.email || undefined,
    phone: b.phone,
    vehicleType: b.vehicleType,
    vehicleNumber: b.vehicleNumber,
    serviceType: triage.serviceType,
    description: b.description,
    pickupLocation: b.pickupLocation,
    pickupCoords: toPoint(b.pickupLat, b.pickupLng),
    destination: b.destination,
    destinationCoords: toPoint(b.destinationLat, b.destinationLng),
    pickupDate: b.pickupDate,
    pickupTime: b.pickupTime,
    diagnosis,
    severity: triage.severity,
    priority: triage.priority,
    distanceKm: b.distanceKm || 0,
    emergencyContacts: Array.isArray(b.emergencyContacts) ? b.emergencyContacts.slice(0, 2) : [],
    remark: 'Request received',
  });

  await notification.announceStatus(booking, 'Pending', 'Request received', { role: 'customer', name: booking.name }, { notifyCustomer: false });

  // Confirmation messages and driver search must never make the booking itself fail
  notification.notifyNewBooking(booking).catch((e) => console.error('[booking] notify failed:', e.message));
  dispatch.startDispatch(booking._id).catch((e) => console.error('[booking] dispatch failed:', e.message));

  res.status(201).json({
    success: true,
    data: {
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      severity: booking.severity,
      trackUrl: notification.trackUrl(booking),
    },
  });
});

exports.trackBooking = asyncHandler(async (req, res) => {
  const booking = await findOwnedBooking(req.body.bookingNumber, req.body.phone, { populateDriver: true });
  res.json({
    success: true,
    data: { booking: publicBooking(booking), timeline: await timelineOf(booking._id) },
  });
});

exports.cancelByCustomer = asyncHandler(async (req, res) => {
  const owned = await findOwnedBooking(req.params.bookingNumber, req.body.phone);
  const reason = String(req.body.reason || '').trim().slice(0, 300) || 'Cancelled by customer';
  const updated = await applyStatus(owned.bookingNumber, 'Cancelled', {
    remark: 'You cancelled this booking',
    cancelReason: reason,
    by: { role: 'customer', name: owned.name },
  });
  res.json({ success: true, data: { bookingNumber: updated.bookingNumber, status: updated.status } });
});

exports.rateBooking = asyncHandler(async (req, res) => {
  const owned = await findOwnedBooking(req.params.bookingNumber, req.body.phone);
  const stars = Number(req.body.rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new AppError('Rating must be 1 to 5 stars', 400);
  if (owned.status !== 'Completed') throw new AppError('You can rate a job once it is completed', 400);

  // rating: {$exists:false} makes sure one booking can only be rated once, even with double clicks
  const booking = await Booking.findOneAndUpdate(
    { _id: owned._id, rating: { $exists: false } },
    { rating: stars, feedback: String(req.body.feedback || '').trim().slice(0, 500) || undefined },
    { new: true }
  );
  if (!booking) throw new AppError('This job has already been rated', 409);

  const driver = booking.assignedDriver && (await Driver.findById(booking.assignedDriver));
  if (driver) await driver.addRating(stars);
  res.json({ success: true, data: { rating: booking.rating } });
});

exports.listBookings = asyncHandler(async (req, res) => {
  const { status, severity, q, from, to } = req.query;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));

  const match = {};
  if (Booking.STATUSES.includes(status)) match.status = status;
  if (Booking.SEVERITIES.includes(severity)) match.severity = severity;
  if (from || to) {
    match.createdAt = {
      ...(from && { $gte: new Date(from) }),
      ...(to && { $lte: new Date(to) }),
    };
  }
  if (q && String(q).trim()) {
    const term = String(q).trim().slice(0, 60);
    const rx = new RegExp(escapeRegex(term), 'i');
    match.$or = [{ name: rx }, { phone: rx }, { pickupLocation: rx }, ...(/^\d+$/.test(term) ? [{ bookingNumber: Number(term) }] : [])];
  }

  // Waiting-for-a-driver first, then most urgent, then newest
  const [result] = await Booking.aggregate([
    { $match: match },
    { $project: { shareToken: 0, shareTokenExpiresAt: 0 } },
    {
      $addFields: {
        waiting: { $cond: [{ $in: ['$status', ['Pending', 'Approved']] }, 1, 0] },
        severityRank: {
          $switch: {
            branches: [
              { case: { $eq: ['$severity', 'critical'] }, then: 4 },
              { case: { $eq: ['$severity', 'high'] }, then: 3 },
              { case: { $eq: ['$severity', 'low'] }, then: 1 },
            ],
            default: 2,
          },
        },
      },
    },
    { $sort: { waiting: -1, severityRank: -1, createdAt: -1 } },
    {
      $facet: {
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          { $lookup: { from: 'drivers', localField: 'assignedDriver', foreignField: '_id', as: 'driver' } },
          { $addFields: { driver: { $arrayElemAt: [{ $map: { input: '$driver', as: 'd', in: { _id: '$$d._id', driverId: '$$d.driverId', name: '$$d.name', mobile: '$$d.mobile' } } }, 0] } } },
          { $project: { waiting: 0 } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);

  const total = result.total[0] ? result.total[0].n : 0;
  res.json({ success: true, data: result.data, page, pages: Math.ceil(total / limit) || 1, total });
});

exports.getBooking = asyncHandler(async (req, res) => {
  const n = Number.parseInt(req.params.bookingNumber, 10);
  const booking = await Booking.findOne({ bookingNumber: n }).populate('assignedDriver', 'driverId name mobile vehicle rating location');
  if (!booking) throw new AppError('Booking not found', 404);
  if (req.user.role === 'driver') {
    const assigned = booking.assignedDriver && String(booking.assignedDriver._id) === String(req.user.id);
    if (!assigned) throw new AppError('This job is not assigned to you', 403);
  }
  const offers = req.user.role === 'admin' ? booking.offerHistory : undefined;
  res.json({
    success: true,
    data: { booking, timeline: await timelineOf(booking._id), offerHistory: offers },
  });
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const n = Number.parseInt(req.params.bookingNumber, 10);
  const by = { role: req.user.role, id: req.user.id };
  const updated = await applyStatus(n, req.body.status, {
    remark: req.body.remark,
    cancelReason: req.body.cancelReason,
    by,
  });
  res.json({ success: true, data: { bookingNumber: updated.bookingNumber, status: updated.status } });
});

exports.triagePreview = asyncHandler(async (req, res) => {
  const { description, serviceType, diagnosisSeverity } = req.body;
  const result = triageBooking({ serviceType, description, hint: diagnosisSeverity });
  res.json({ success: true, data: result });
});

exports.getFareEstimate = asyncHandler(async (req, res) => {
  const { serviceType, distanceKm } = req.body;
  let sType = serviceType;
  if (!sType || sType === 'Other') {
     const triage = triageBooking({ serviceType, description: req.body.description });
     sType = triage.serviceType;
  }
  const pricing = await Pricing.findOne({ serviceType: sType });
  if (!pricing) {
    return res.json({ success: true, data: { estimatedFare: null, message: 'Pricing not configured for this service type' } });
  }
  
  const distance = Math.max(0, Number(distanceKm) || 0);
  const estimatedFare = pricing.basePrice + (pricing.perKmRate * distance);
  
  res.json({ 
    success: true, 
    data: { 
      serviceType: sType,
      basePrice: pricing.basePrice,
      perKmRate: pricing.perKmRate,
      distanceKm: distance,
      estimatedFare 
    } 
  });
});

exports.createSOS = asyncHandler(async (req, res) => {
  const b = req.body;
  
  const open = await Booking.findOne({
    phone: b.phone,
    status: { $in: ['Pending', 'Approved', 'Assigned', 'On The Way'] },
  }).select('bookingNumber').lean();
  
  if (open) {
    throw new AppError(
      `You already have an active request (#${open.bookingNumber}). Please track or cancel it first.`,
      409,
      { bookingNumber: open.bookingNumber }
    );
  }

  const booking = await Booking.create({
    bookingNumber: await generateUniqueBookingNumber(Booking),
    name: b.name || 'SOS User',
    phone: b.phone,
    serviceType: 'Ambulance',
    description: 'EMERGENCY SOS',
    pickupLocation: b.pickupLocation || 'Unknown Location',
    pickupCoords: toPoint(b.pickupLat, b.pickupLng),
    severity: 'critical',
    priority: 'critical',
    emergencyContacts: Array.isArray(b.emergencyContacts) ? b.emergencyContacts.slice(0, 2) : [],
    remark: 'SOS Alert triggered',
  });

  await notification.announceStatus(booking, 'Pending', 'SOS Alert triggered', { role: 'customer', name: booking.name }, { notifyCustomer: false });
  notification.notifyNewBooking(booking).catch((e) => console.error('[booking] notify failed:', e.message));
  dispatch.startDispatch(booking._id).catch((e) => console.error('[booking] dispatch failed:', e.message));

  res.status(201).json({
    success: true,
    data: {
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      severity: booking.severity,
      trackUrl: notification.trackUrl(booking),
    },
  });
});

exports.downloadReceipt = asyncHandler(async (req, res) => {
  const owned = await findOwnedBooking(req.params.bookingNumber, req.query.phone || '');
  if (owned.status !== 'Completed') throw new AppError('Receipt is only available for completed bookings', 400);

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=receipt-${owned.bookingNumber}.pdf`);
  doc.pipe(res);

  doc.fontSize(20).text('Vehicle Breakdown Assistant', { align: 'center' });
  doc.fontSize(12).text('24x7 Roadside Assistance', { align: 'center' });
  doc.moveDown();
  doc.fontSize(16).text('Receipt', { align: 'center' });
  doc.moveDown(2);

  doc.fontSize(12);
  doc.text(`Booking Number: #${owned.bookingNumber}`);
  doc.text(`Date: ${owned.completedAt ? owned.completedAt.toLocaleDateString() : owned.createdAt.toLocaleDateString()}`);
  doc.text(`Customer Name: ${owned.name}`);
  doc.text(`Phone: ${owned.phone}`);
  doc.moveDown();
  
  doc.text(`Service Type: ${owned.serviceType}`);
  doc.text(`Vehicle: ${owned.vehicleType} ${owned.vehicleNumber ? `(${owned.vehicleNumber})` : ''}`);
  doc.text(`Location: ${owned.pickupLocation}`);
  doc.moveDown();

  doc.text(`Status: ${owned.status}`);
  doc.text(`Total Fare: INR ${owned.fare || 0}`, { underline: true });
  
  doc.moveDown(4);
  doc.fontSize(10).text('Thank you for using our services.', { align: 'center' });

  doc.end();
});

exports.helpers = { last10, findOwnedBooking, publicBooking, timelineOf, applyStatus, triageBooking, escapeRegex };
