const express = require('express');
const c = require('../controllers/paymentController');
const { protect, ROLES } = require('../middleware/auth');

const adminGuard = protect(ROLES.ADMIN);
const router = express.Router();

router.post('/webhook', express.raw({ type: 'application/json' }), c.webhook);
router.post('/create-order', express.json(), c.createOrder);
router.post('/verify', express.json(), c.verifyPayment);
router.get('/status/:bookingNumber', c.status);
router.get('/:bookingNumber/status', c.status);
router.get('/receipt/:bookingNumber', c.receipt);
router.get('/export', adminGuard, c.exportExcel);
router.get('/stats', adminGuard, c.stats);

module.exports = router;
