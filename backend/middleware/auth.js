const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');

const ROLES = { ADMIN: 'admin', DRIVER: 'driver' };

function getSecret() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return process.env.JWT_SECRET;
}

/** Creates a token for an admin or driver. */
function signToken({ id, role }) {
  return jwt.sign({ id, role }, getSecret(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

/** Verifies a token and returns { id, role }. Throws on invalid or expired tokens. */
function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

/**
 * Requires a valid JWT. Optionally restricts to specific roles:
 *   router.get('/x', protect(ROLES.ADMIN), handler)
 */
const protect = (...roles) => (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next(new AppError('Please log in to continue', 401));

  try {
    const payload = verifyToken(token);
    if (roles.length && !roles.includes(payload.role)) {
      return next(new AppError('You do not have permission to do this', 403));
    }
    req.user = { id: payload.id, role: payload.role };
    return next();
  } catch (err) {
    return next(err); // errorHandler maps JWT errors to 401
  }
};

/** Attaches req.user when a valid token is present, but never blocks the request. */
const optionalAuth = (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = verifyToken(token);
      req.user = { id: payload.id, role: payload.role };
    } catch (_) {
      /* ignore invalid token on public routes */
    }
  }
  next();
};

module.exports = { ROLES, signToken, verifyToken, protect, optionalAuth };
