const express = require('express');
const c = require('../controllers/paymentController');
const { protect, ROLES } = require('../middleware/auth');

const adminGuard = protect(ROLES.ADMIN);
const staffGuard = protect(ROLES.DRIVER, ROLES.ADMIN);
const router = express.Router();

router.get('/health', c.health);
router.post('/webhook', express.raw({ type: '*/*' }), c.webhook);
router.post('/create-order', express.json(), c.createOrder);
router.post('/verify', express.json(), c.verifyPayment);
router.post('/qr/create', express.json(), c.createQrCode);
router.get('/qr/status/:qrId', c.qrStatus);
router.get('/upi-link', c.getUpiLink);
router.post('/cash', express.json(), c.setCashMethod);
router.post('/mark-cash-paid', staffGuard, express.json(), c.markCashPaid);
router.get('/status/:bookingNumber', c.status);
router.get('/:bookingNumber/status', c.status);
router.get('/receipt/:bookingNumber', c.receipt);
router.get('/export', adminGuard, c.exportExcel);
router.get('/stats', adminGuard, c.stats);

module.exports = router;
