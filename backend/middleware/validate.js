const { body, param, query, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

/** Runs after a rule array; turns validation failures into a 400 response. */
const validate = (req, _res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
  return next(new AppError(details[0].message, 400, details));
};

const phone = (field = 'phone') =>
  body(field).trim().matches(/^\d{10}$/).withMessage('Phone number must be 10 digits');

const latitude = (field, optional = true) => {
  const c = body(field);
  return (optional ? c.optional({ values: 'falsy' }) : c).isFloat({ min: -90, max: 90 }).withMessage(`${field} must be between -90 and 90`);
};
const longitude = (field, optional = true) => {
  const c = body(field);
  return (optional ? c.optional({ values: 'falsy' }) : c).isFloat({ min: -180, max: 180 }).withMessage(`${field} must be between -180 and 180`);
};

const SERVICE_TYPES = [
  'Towing', 'Flat Tyre', 'Battery Jump-start', 'Fuel Delivery',
  'Engine Problem', 'Lockout', 'Accident Recovery', 'Ambulance', 'Other',
];
const STATUSES = ['Approved', 'Assigned', 'On The Way', 'Completed', 'Rejected', 'Cancelled', 'False Alarm'];

// ---------- Rule sets ----------
const bookingRules = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  phone('phone'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Invalid email'),
  body('pickupLocation').trim().notEmpty().withMessage('Pickup location is required').isLength({ max: 300 }),
  body('serviceType').optional().isIn(SERVICE_TYPES).withMessage('Unknown service type'),
  body('vehicleType').optional().trim().isLength({ max: 60 }),
  body('vehicleNumber').optional().trim().isLength({ max: 20 }),
  body('description').optional().trim().isLength({ max: 1000 }),
  latitude('pickupLat'), longitude('pickupLng'),
  latitude('destinationLat'), longitude('destinationLng'),
  validate,
];

const loginRules = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

const driverCreateRules = [
  body('driverId').trim().notEmpty().withMessage('Driver ID is required').isLength({ max: 20 }),
  body('name').trim().notEmpty().withMessage('Name is required'),
  phone('mobile'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Invalid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate,
];

const driverUpdateRules = [
  body('name').optional().trim().notEmpty(),
  body('mobile').optional().trim().matches(/^\d{10}$/).withMessage('Mobile number must be 10 digits'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Invalid email'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  validate,
];

const adminProfileRules = [
  body('name').optional().trim().notEmpty(),
  body('mobile').optional().trim().matches(/^\d{10}$/).withMessage('Mobile number must be 10 digits'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Invalid email'),
  validate,
];

const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  validate,
];

const statusUpdateRules = [
  body('status').isIn(STATUSES).withMessage(`Status must be one of: ${STATUSES.join(', ')}`),
  body('remark').optional().trim().isLength({ max: 300 }),
  body('cancelReason').optional().trim().isLength({ max: 300 }),
  validate,
];

const locationUpdateRules = [latitude('lat', false), longitude('lng', false), validate];

const chatMessageRules = [
  body('text').trim().notEmpty().withMessage('Message cannot be empty').isLength({ max: 1000 }),
  validate,
];

const trackRules = [
  body('bookingNumber').isInt({ min: 1 }).withMessage('Enter a valid booking number'),
  validate,
];

const pageUpdateRules = [
  body('title').optional().trim().notEmpty(),
  body('description').optional().isString(),
  body('email').optional({ values: 'falsy' }).trim().isEmail(),
  body('mobile').optional({ values: 'falsy' }).trim().matches(/^\d{10}$/),
  body('timing').optional().trim().isLength({ max: 120 }),
  validate,
];

// ---------- Param / query helpers ----------
const mongoIdParam = (name = 'id') => [
  param(name).isMongoId().withMessage(`Invalid ${name}`),
  validate,
];
const bookingNumberParam = [
  param('bookingNumber').isInt({ min: 1 }).withMessage('Invalid booking number'),
  validate,
];
const dateRangeQuery = [
  query('from').optional().isISO8601().withMessage('from must be a date'),
  query('to').optional().isISO8601().withMessage('to must be a date'),
  validate,
];

module.exports = {
  validate,
  bookingRules, loginRules, driverCreateRules, driverUpdateRules, adminProfileRules,
  changePasswordRules, statusUpdateRules, locationUpdateRules, chatMessageRules,
  trackRules, pageUpdateRules, mongoIdParam, bookingNumberParam, dateRangeQuery,
  SERVICE_TYPES, STATUSES,
};
