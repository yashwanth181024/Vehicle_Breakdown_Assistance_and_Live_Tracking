const rateLimit = require('express-rate-limit');

const skipInTests = () => process.env.NODE_ENV === 'test';

const make = (windowMinutes, max, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipInTests,
    message: { success: false, message },
  });

/** Applied to every /api route. */
const apiLimiter = make(15, 300, 'Too many requests, please slow down');

/** Login attempts: protects against password guessing. */
const authLimiter = make(15, 10, 'Too many login attempts, try again in 15 minutes');

/** New bookings: stops spam requests from one IP. */
const bookingLimiter = make(60, 10, 'Too many booking requests from this device, try again later');

/** Anything where a customer proves a booking with a phone number, or opens a share link: stops guessing. */
const shareLimiter = make(15, 60, 'Too many requests');

/** Map pages refresh the route and ETA every ~20 s, so they need more room than shareLimiter. */
const pollLimiter = make(15, 200, 'Too many requests');

module.exports = { apiLimiter, authLimiter, bookingLimiter, shareLimiter, pollLimiter };
