const Booking = require('../models/Booking');
const Driver = require('../models/Driver');

const TZ = 'Asia/Kolkata';
const DAY = 24 * 60 * 60 * 1000;

/** Parses ?from=&to= (ISO dates). Defaults to the last 30 days; `to` includes the whole day. */
function parseRange(from, to) {
  const end = to ? new Date(to) : new Date();
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(to))) end.setUTCHours(23, 59, 59, 999);
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * DAY);
  return { start, end };
}

const inRange = ({ start, end }) => ({ createdAt: { $gte: start, $lte: end } });

/** Dashboard cards. */
async function summary() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [byStatus, today, avgTime, driverCounts, dispatch] = await Promise.all([
    Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Booking.countDocuments({ createdAt: { $gte: startOfToday } }),
    Booking.aggregate([
      { $match: { status: 'Completed', assignedAt: { $exists: true }, completedAt: { $exists: true } } },
      { $group: { 
          _id: null, 
          avgJobMs: { $avg: { $subtract: ['$completedAt', '$assignedAt'] } },
          avgResponseMs: { $avg: { $subtract: ['$assignedAt', '$createdAt'] } }
      } },
    ]),
    Driver.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          online: { $sum: { $cond: ['$isOnline', 1, 0] } },
          busy: { $sum: { $cond: [{ $eq: ['$isAvailable', false] }, 1, 0] } },
          unverified: { $sum: { $cond: ['$isVerified', 0, 1] } },
        },
      },
    ]),
    Booking.countDocuments({ dispatchFailed: true, assignedDriver: null, status: { $in: ['Pending', 'Approved'] } }),
  ]);

  const statuses = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  const total = byStatus.reduce((n, s) => n + s.count, 0);
  const d = driverCounts[0] || { total: 0, online: 0, busy: 0, unverified: 0 };

  return {
    totalBookings: total,
    today,
    statuses,
    needsAttention: dispatch, // dispatch failed, waiting for a manual assignment
    avgJobMinutes: avgTime[0] ? Math.round(avgTime[0].avgJobMs / 60000) : null,
    avgResponseMinutes: avgTime[0] ? Math.round(avgTime[0].avgResponseMs / 60000) : null,
    drivers: { total: d.total, online: d.online, busy: d.busy, unverified: d.unverified },
  };
}

/** Bookings per day. */
async function bookingsOverTime(from, to) {
  const range = parseRange(from, to);
  const rows = await Booking.aggregate([
    { $match: inRange(range) },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, count: r.count }));
}

/** Breakdown by service type, status and busiest hours. */
async function breakdowns(from, to) {
  const range = parseRange(from, to);
  const match = { $match: inRange(range) };
  const count = (field) => [match, { $group: { _id: field, count: { $sum: 1 } } }, { $sort: { count: -1 } }];

  const [byService, byStatus, byHour] = await Promise.all([
    Booking.aggregate(count('$serviceType')),
    Booking.aggregate(count('$status')),
    Booking.aggregate([
      match,
      { $group: { _id: { $hour: { date: '$createdAt', timezone: TZ } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const shape = (rows) => rows.map((r) => ({ label: r._id || 'Unknown', count: r.count }));
  return {
    byService: shape(byService),
    byStatus: shape(byStatus),
    byHour: byHour.map((r) => ({ hour: r._id, count: r.count })),
  };
}

/** Breakdown hotspots: pickup points rounded to a grid and counted. Powers the heatmap. */
async function heatmap({ from, to, precision = 3 } = {}) {
  const range = parseRange(from, to);
  const p = Math.min(5, Math.max(1, Number(precision) || 3)); // 3 decimals ≈ 110 m cells
  const rows = await Booking.aggregate([
    { $match: { ...inRange(range), 'pickupCoords.coordinates.1': { $exists: true } } },
    {
      $group: {
        _id: {
          lat: { $round: [{ $arrayElemAt: ['$pickupCoords.coordinates', 1] }, p] },
          lng: { $round: [{ $arrayElemAt: ['$pickupCoords.coordinates', 0] }, p] },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 2000 },
  ]);
  const points = rows.map((r) => ({ lat: r._id.lat, lng: r._id.lng, count: r.count }));
  return { points, max: points.length ? points[0].count : 0 };
}

/** Per-driver performance table. */
async function driverPerformance(from, to) {
  const range = parseRange(from, to);
  const rows = await Booking.aggregate([
    { $match: { ...inRange(range), assignedDriver: { $ne: null } } },
    {
      $group: {
        _id: '$assignedDriver',
        jobs: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } },
        avgRating: { $avg: '$rating' },
        avgJobMs: {
          $avg: { $cond: [{ $and: ['$assignedAt', '$completedAt'] }, { $subtract: ['$completedAt', '$assignedAt'] }, null] },
        },
      },
    },
    { $lookup: { from: 'drivers', localField: '_id', foreignField: '_id', as: 'driver' } },
    { $unwind: '$driver' },
    {
      $project: {
        _id: 0,
        driverId: '$driver.driverId',
        name: '$driver.name',
        mobile: '$driver.mobile',
        jobs: 1,
        completed: 1,
        cancelled: 1,
        avgRating: { $round: ['$avgRating', 1] },
        avgJobMinutes: { $round: [{ $divide: ['$avgJobMs', 60000] }, 0] },
      },
    },
    { $sort: { completed: -1 } },
  ]);
  return rows;
}

/** Dispatch quality: how often drivers say yes, and how many tries a job needs. */
async function dispatchStats(from, to) {
  const range = parseRange(from, to);
  const rows = await Booking.aggregate([
    { $match: inRange(range) },
    { $unwind: { path: '$offerHistory', preserveNullAndEmptyArrays: false } },
    { $group: { _id: '$offerHistory.outcome', count: { $sum: 1 } } },
  ]);
  const o = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const offered = o.offered || 0;
  const [failed, total] = await Promise.all([
    Booking.countDocuments({ ...inRange(range), dispatchFailed: true }),
    Booking.countDocuments(inRange(range)),
  ]);
  return {
    offersSent: offered,
    accepted: o.accepted || 0,
    rejected: o.rejected || 0,
    expired: o.expired || 0,
    acceptRate: offered ? Math.round(((o.accepted || 0) / offered) * 100) : null,
    avgOffersPerBooking: total ? Math.round((offered / total) * 10) / 10 : null,
    dispatchFailed: failed,
  };
}

/** Why bookings were cancelled or rejected. */
async function cancellationReasons(from, to) {
  const range = parseRange(from, to);
  const rows = await Booking.aggregate([
    { $match: { ...inRange(range), status: { $in: ['Cancelled', 'Rejected'] } } },
    { $group: { _id: { $ifNull: ['$cancelReason', '$remark'] }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]);
  return rows.map((r) => ({ reason: r._id || 'No reason given', count: r.count }));
}

/** Flat list of bookings between two dates, for the Reports page (replaces the old date report). */
async function reportBetweenDates({ from, to, status, driver } = {}) {
  const range = parseRange(from, to);
  const filter = { ...inRange(range), ...(status && { status }), ...(driver && { assignedDriver: driver }) };
  return Booking.find(filter)
    .sort({ createdAt: -1 })
    .limit(1000)
    .populate('assignedDriver', 'driverId name')
    .lean();
}

module.exports = {
  parseRange, summary, bookingsOverTime, breakdowns, heatmap,
  driverPerformance, dispatchStats, cancellationReasons, reportBetweenDates,
};
