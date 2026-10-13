const router = require('express').Router();
const c = require('../controllers/admin.controller');
const { protect, ROLES } = require('../middleware/auth');
const v = require('../middleware/validate');

// Public: About us / Contact us content for the website
router.get('/pages/:type', c.getPage);

// Everything below needs an admin login
router.use(protect(ROLES.ADMIN));

router.put('/pages/:type', v.pageUpdateRules, c.updatePage);
router.put('/profile', v.adminProfileRules, c.updateProfile);
router.put('/password', v.changePasswordRules, c.changePassword);

router.get('/live-drivers', c.liveDrivers);
router.get('/bookings/:bookingNumber/candidates', v.bookingNumberParam, c.candidates);
router.post('/bookings/:bookingNumber/assign', v.bookingNumberParam, c.assignDriver);

router.get('/pricing', c.getPricings);
router.put('/pricing/:serviceType', c.updatePricing);

module.exports = router;
