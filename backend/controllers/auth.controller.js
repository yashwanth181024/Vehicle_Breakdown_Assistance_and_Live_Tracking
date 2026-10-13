/**
 * Login for admins and drivers.
 *   POST /api/auth/admin/login   { username, password }
 *   POST /api/auth/driver/login  { username (driver ID), password }
 *   GET  /api/auth/me            (any logged-in user)
 */
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const Driver = require('../models/Driver');
const { signToken, ROLES } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// Compared against when the username does not exist, so response time does not reveal valid usernames
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function login(res, doc, password, role) {
  const valid = doc ? await doc.comparePassword(password) : (await bcrypt.compare(password, DUMMY_HASH), false);
  if (!valid) throw new AppError('Invalid username or password', 401);

  const token = signToken({ id: doc._id, role });
  res.json({ success: true, data: { token, role, user: doc.toJSON() } });
}

exports.adminLogin = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const admin = await Admin.findOne({ username: String(username).toLowerCase().trim() }).select('+password');
  await login(res, admin, password, ROLES.ADMIN);
});

exports.driverLogin = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const driver = await Driver.findOne({ driverId: String(username).toLowerCase().trim() }).select('+password');
  await login(res, driver, password, ROLES.DRIVER);
});

exports.me = asyncHandler(async (req, res) => {
  const Model = req.user.role === ROLES.ADMIN ? Admin : Driver;
  const user = await Model.findById(req.user.id);
  if (!user) throw new AppError('Account no longer exists', 401);
  res.json({ success: true, data: { role: req.user.role, user } });
});
