const router = require('express').Router();
const c = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');
const { loginRules } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');

// POST /api/auth/admin/login   POST /api/auth/driver/login   GET /api/auth/me
router.post('/admin/login', authLimiter, loginRules, c.adminLogin);
router.post('/driver/login', authLimiter, loginRules, c.driverLogin);
router.get('/me', protect(), c.me);

module.exports = router;
