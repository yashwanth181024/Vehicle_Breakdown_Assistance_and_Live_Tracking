/**
 * Share-link tokens.
 * The raw token goes only into the URL. The database keeps its SHA-256 hash,
 * so a leaked database cannot be used to open anyone's tracking page.
 *
 * Lifetime: valid while the job is open. When the job ends it stays valid for
 * SHARE_TOKEN_GRACE_HOURS (default 1) and then stops working. A hard cap of 48 h
 * from creation applies either way.
 */
const crypto = require('crypto');
const Booking = require('../models/Booking');

const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Creates (or rotates) the share token for a booking and returns the raw token. */
async function createShareToken(booking) {
  const token = crypto.randomBytes(24).toString('base64url');
  await Booking.updateOne(
    { _id: booking._id },
    { shareToken: hash(token), $unset: { shareTokenExpiresAt: 1 } }
  );
  return token;
}

/** Looks up a booking by raw token. Resolves to the booking or null if invalid / expired. */
async function resolveShareToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const booking = await Booking.findOne({ shareToken: hash(token) })
    .select('+shareToken +shareTokenExpiresAt')
    .populate('assignedDriver', 'name mobile vehicle rating location');
  if (!booking) return null;

  const now = Date.now();
  if (booking.shareTokenExpiresAt && booking.shareTokenExpiresAt.getTime() <= now) return null;
  if (now - booking.createdAt.getTime() > MAX_AGE_MS) return null;
  return booking;
}

/** Call when a job completes or is cancelled: the link dies after the grace period. */
function expireShareToken(bookingId, graceHours = Number(process.env.SHARE_TOKEN_GRACE_HOURS) || 1) {
  return Booking.updateOne(
    { _id: bookingId, shareToken: { $exists: true } },
    { shareTokenExpiresAt: new Date(Date.now() + graceHours * 60 * 60 * 1000) }
  );
}

module.exports = { createShareToken, resolveShareToken, expireShareToken, hash };
