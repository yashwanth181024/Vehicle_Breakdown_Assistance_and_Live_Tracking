const router = require('express').Router();
const c = require('../controllers/chat.controller');
const { protect, ROLES } = require('../middleware/auth');
const v = require('../middleware/validate');
const { shareLimiter } = require('../middleware/rateLimit');

// Customer: { bookingNumber, phone }. Live messaging itself runs over Socket.IO.
router.post('/history', shareLimiter, v.trackRules, c.customerHistory);

// Admin (read) or the assigned driver
router.get('/:bookingNumber', protect(ROLES.ADMIN, ROLES.DRIVER), v.bookingNumberParam, c.staffHistory);

module.exports = router;
