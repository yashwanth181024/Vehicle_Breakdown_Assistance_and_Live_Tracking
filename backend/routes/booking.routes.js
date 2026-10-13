const router = require('express').Router();
const booking = require('../controllers/booking.controller');
const share = require('../controllers/share.controller');
const { protect, ROLES } = require('../middleware/auth');
const v = require('../middleware/validate');
const { bookingLimiter, shareLimiter } = require('../middleware/rateLimit');

// ----- Customer (no login; phone number proves ownership) -----
router.post('/', bookingLimiter, v.bookingRules, booking.createBooking);
router.post('/sos', bookingLimiter, booking.createSOS);
router.post('/triage', bookingLimiter, booking.triagePreview);
router.post('/fare-estimate', bookingLimiter, booking.getFareEstimate);
router.post('/track', shareLimiter, v.trackRules, booking.trackBooking);
router.post('/:bookingNumber/cancel', shareLimiter, v.bookingNumberParam, booking.cancelByCustomer);
router.post('/:bookingNumber/rating', shareLimiter, v.bookingNumberParam, booking.rateBooking);
router.post('/:bookingNumber/share', shareLimiter, v.bookingNumberParam, share.createShareLink);
router.get('/:bookingNumber/receipt', shareLimiter, v.bookingNumberParam, booking.downloadReceipt);

// ----- Staff -----
router.get('/', protect(ROLES.ADMIN), booking.listBookings);
router.get('/:bookingNumber', protect(ROLES.ADMIN, ROLES.DRIVER), v.bookingNumberParam, booking.getBooking);
router.patch(
  '/:bookingNumber/status',
  protect(ROLES.ADMIN, ROLES.DRIVER),
  v.bookingNumberParam,
  v.statusUpdateRules,
  booking.updateStatus
);

module.exports = router;
