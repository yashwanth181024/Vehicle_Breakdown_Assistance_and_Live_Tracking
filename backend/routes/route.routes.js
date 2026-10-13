const router = require('express').Router();
const c = require('../controllers/route.controller');
const { protect, ROLES } = require('../middleware/auth');
const { trackRules } = require('../middleware/validate');
const { pollLimiter } = require('../middleware/rateLimit');

router.post('/booking', pollLimiter, trackRules, c.forCustomer); // customer: { bookingNumber, phone }
router.get('/share/:token', pollLimiter, c.forShare); // share-link viewer
router.get('/job', protect(ROLES.DRIVER), c.forDriver); // driver's active job

module.exports = router;
