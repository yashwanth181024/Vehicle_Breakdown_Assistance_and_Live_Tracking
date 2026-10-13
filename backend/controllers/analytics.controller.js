/**
 * Admin analytics. All accept ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: last 30 days).
 *   GET /api/analytics/summary          dashboard cards
 *   GET /api/analytics/overview         everything the Analytics page needs in one call
 *   GET /api/analytics/heatmap          breakdown hotspots   (?precision=1..5)
 *   GET /api/analytics/drivers          per-driver performance
 *   GET /api/analytics/report           bookings between dates (?status=&driver=)
 *   GET /api/analytics/report.csv       same, as a download
 */
const { asyncHandler } = require('../middleware/errorHandler');
const analytics = require('../services/analytics.service');

exports.summary = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await analytics.summary() });
});

exports.overview = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const [series, breakdowns, dispatch, reasons, drivers] = await Promise.all([
    analytics.bookingsOverTime(from, to),
    analytics.breakdowns(from, to),
    analytics.dispatchStats(from, to),
    analytics.cancellationReasons(from, to),
    analytics.driverPerformance(from, to),
  ]);
  res.json({ success: true, data: { series, ...breakdowns, dispatch, reasons, drivers } });
});

exports.heatmap = asyncHandler(async (req, res) => {
  const { from, to, precision } = req.query;
  res.json({ success: true, data: await analytics.heatmap({ from, to, precision }) });
});

exports.drivers = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await analytics.driverPerformance(req.query.from, req.query.to) });
});

exports.report = asyncHandler(async (req, res) => {
  const { from, to, status, driver } = req.query;
  const rows = await analytics.reportBetweenDates({ from, to, status, driver });
  res.json({ success: true, data: rows, total: rows.length });
});

/** Spreadsheet programs run text starting with = + - @ as a formula, so those cells get a leading quote. */
const csvCell = (v) => {
  let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

exports.reportCsv = asyncHandler(async (req, res) => {
  const { from, to, status, driver } = req.query;
  const rows = await analytics.reportBetweenDates({ from, to, status, driver });
  const header = ['Booking No', 'Date', 'Customer', 'Phone', 'Service', 'Severity', 'Status', 'Pickup', 'Driver', 'Remark / Reason', 'Rating'];
  const lines = rows.map((b) => [
    b.bookingNumber, b.createdAt, b.name, b.phone, b.serviceType, b.severity, b.status, b.pickupLocation,
    b.assignedDriver ? `${b.assignedDriver.name} (${b.assignedDriver.driverId})` : '',
    b.cancelReason || b.remark, b.rating,
  ].map(csvCell).join(','));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="bookings-report.csv"');
  res.send([header.join(','), ...lines].join('\n'));
});

exports.csvCell = csvCell;
