const router = require('express').Router();
const c = require('../controllers/share.controller');
const { shareLimiter } = require('../middleware/rateLimit');

// Public, no login. The link is created with POST /api/bookings/:bookingNumber/share.
router.get('/:token', shareLimiter, c.getShared);

module.exports = router;
