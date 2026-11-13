const crypto = require('crypto');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const razorpay = require('../services/razorpayService');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { generateReceipt } = require('../services/receiptService');

if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
  console.error('Payment controller error: RAZORPAY_WEBHOOK_SECRET is missing');
}
if (!process.env.FRONTEND_URL) {
  console.error('Payment controller error: FRONTEND_URL is missing');
}

// ============ ADJUST TO MATCH YOUR BOOKING MODEL (STEPS.md, step 3) ============
const F = {
  number: 'bookingNumber',   // field holding the booking number
  phone: 'phone',            // field holding the customer phone
  paid: 'paymentStatus',     // field that will be set to 'paid'
  fare: (b) => b.fare || b.finalFare || b.estimatedFare || b.totalFare,
};
// ===============================================================================

const findBooking = (bookingNumber, phone) =>
  Booking.findOne({ [F.number]: bookingNumber, [F.phone]: phone });

const markPaid = async (req, { orderId, paymentId, signature, method, bookingNumber, amount }) => {
  // 1. Locate payment record if exists
  let payment = null;
  if (orderId) {
    payment = await Payment.findOne({ razorpayOrderId: orderId });
  } else if (paymentId) {
    payment = await Payment.findOne({ razorpayPaymentId: paymentId });
  }

  // 2. Locate booking
  let booking = null;
  if (bookingNumber) {
    booking = await Booking.findOne({ [F.number]: Number(bookingNumber) });
  } else if (payment && payment.bookingId) {
    booking = await Booking.findById(payment.bookingId);
  }

  if (!booking && !payment) return null;
  if (!booking && payment) {
    booking = await Booking.findOne({ [F.number]: Number(payment.bookingNumber) });
  }
  if (!booking) return payment;

  // RULE: A paid booking must never be changed again!
  const isAlreadyPaid = booking.paymentStatus === 'paid' || booking[F.paid] === 'paid';
  if (isAlreadyPaid) {
    if (payment && payment.status !== 'paid') {
      payment.status = 'paid';
      if (paymentId && !payment.razorpayPaymentId) payment.razorpayPaymentId = paymentId;
      if (method && !payment.method) payment.method = method;
      await payment.save();
    }
    return payment || { status: 'paid', booking };
  }

  // Final values
  const finalMethod = method || booking.paymentMethod || 'online';
  const finalAmount = amount || (payment && payment.amount) || Number(F.fare(booking)) || booking.amount || booking.fare || 0;
  const paidAt = new Date();

  // Atomically update booking only if not already paid
  const updatedBooking = await Booking.findOneAndUpdate(
    { _id: booking._id, paymentStatus: { $ne: 'paid' } },
    {
      [F.paid]: 'paid',
      paymentMethod: finalMethod,
      paymentStatus: 'paid',
      paymentId: paymentId || booking.paymentId || '',
      orderId: orderId || booking.orderId || '',
      paidAt,
      amount: finalAmount,
    },
    { new: true }
  );

  if (!updatedBooking) {
    // Concurrently updated to paid by another handler
    return payment || { status: 'paid', booking };
  }

  // Save or update payment document
  if (!payment) {
    payment = await Payment.findOne({ bookingNumber: String(booking.bookingNumber) });
  }

  if (payment) {
    payment.status = 'paid';
    if (paymentId) payment.razorpayPaymentId = paymentId;
    if (orderId && !payment.razorpayOrderId) payment.razorpayOrderId = orderId;
    if (signature) payment.razorpaySignature = signature;
    if (finalMethod) payment.method = finalMethod;
    payment.paidAt = payment.paidAt || paidAt;
    payment.amount = finalAmount;
    await payment.save();
  } else {
    payment = await Payment.create({
      bookingId: booking._id,
      bookingNumber: String(booking.bookingNumber),
      customerPhone: booking.phone,
      amount: finalAmount,
      method: finalMethod,
      status: 'paid',
      razorpayPaymentId: paymentId || '',
      razorpayOrderId: orderId || '',
      razorpaySignature: signature || '',
      paidAt,
    });
  }

  const io = req && req.app && typeof req.app.get === 'function' ? req.app.get('io') : null;
  if (io) {
    io.emit('payment:received', {
      bookingNumber: booking.bookingNumber,
      amount: finalAmount,
      paymentId: paymentId || '',
      method: finalMethod,
    });
    io.emit('booking:updated', {
      bookingNumber: booking.bookingNumber,
      paymentStatus: 'paid',
      paymentMethod: finalMethod,
    });
  }

  return payment || { status: 'paid', booking: updatedBooking };
};

const syncOrder = async (payment, req = null) => {
  try {
    if (!payment || payment.status !== 'created' || !payment.razorpayOrderId) {
      return payment;
    }
    const order = await razorpay.orders.fetch(payment.razorpayOrderId);
    if (order && order.status === 'paid') {
      const paymentsRes = await razorpay.orders.fetchPayments(payment.razorpayOrderId);
      const items = (paymentsRes && paymentsRes.items) || (Array.isArray(paymentsRes) ? paymentsRes : []);
      const captured = items.find((p) => p.captured || p.status === 'captured') || items[0];
      if (captured) {
        return await markPaid(req, {
          orderId: payment.razorpayOrderId,
          paymentId: captured.id,
          signature: '',
          method: captured.method,
        });
      }
    }
  } catch (err) {
    console.error('syncOrder error:', err.message || err);
  }
  return payment;
};

exports.createOrder = async (req, res) => {
  try {
    const { bookingNumber, phone } = req.body;
    if (!bookingNumber || !phone) {
      return res.status(400).json({ message: 'Booking number and phone are required' });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      const missingVars = [];
      if (!process.env.RAZORPAY_KEY_ID) missingVars.push('RAZORPAY_KEY_ID');
      if (!process.env.RAZORPAY_KEY_SECRET) missingVars.push('RAZORPAY_KEY_SECRET');
      console.error(`createOrder error: Missing environment variable(s): ${missingVars.join(', ')}`);
      return res.status(500).json({
        message: `Payment gateway is not configured: Missing ${missingVars.join(', ')}`,
      });
    }

    const booking = await findBooking(bookingNumber, phone);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking[F.paid] === 'paid' || booking.paymentStatus === 'paid') return res.status(400).json({ message: 'Already paid' });
    if (['Cancelled', 'Rejected'].includes(booking.status)) {
      return res.status(400).json({ message: `Cannot pay for a ${booking.status.toLowerCase()} booking` });
    }

    // If an existing order for this booking was already paid on Razorpay, sync and abort
    const existingOrders = await Payment.find({
      bookingNumber: String(bookingNumber),
      status: 'created',
      razorpayOrderId: { $exists: true, $ne: null },
    });
    for (const p of existingOrders) {
      const synced = await syncOrder(p, req);
      if (synced && synced.status === 'paid') {
        return res.status(400).json({ message: 'Already paid' });
      }
    }
    const refreshedBooking = await Booking.findById(booking._id).select(`${F.paid} paymentStatus`);
    if (refreshedBooking && (refreshedBooking[F.paid] === 'paid' || refreshedBooking.paymentStatus === 'paid')) {
      return res.status(400).json({ message: 'Already paid' });
    }

    let fare = Number(F.fare(booking));
    if (!fare || fare <= 0) {
      const Pricing = require('../models/Pricing');
      const pricing = await Pricing.findOne({ serviceType: booking.serviceType });
      if (pricing) {
        fare = pricing.basePrice + (pricing.perKmRate * (booking.distanceKm || 0));
        booking.fare = fare;
        booking.amount = fare;
        await booking.save();
      }
    }
    if (!fare || fare <= 0) return res.status(400).json({ message: 'Fare not available yet' });

    const order = await razorpay.orders.create({
      amount: Math.round(fare * 100),
      currency: 'INR',
      receipt: String(bookingNumber).slice(0, 40),
    });
    await Payment.create({
      bookingId: booking._id,
      bookingNumber: String(bookingNumber),
      customerPhone: phone,
      amount: fare,
      razorpayOrderId: order.id,
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      fare,
    });
  } catch (e) {
    console.error('createOrder', e);
    res.status(500).json({ message: e.message || 'Could not create order' });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing fields' });
    }
    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('verifyPayment error: RAZORPAY_KEY_SECRET is missing');
      return res.status(500).json({ message: 'Payment gateway secret is not configured' });
    }
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(razorpay_signature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    let method;
    try {
      const rzpPayment = await razorpay.payments.fetch(razorpay_payment_id);
      method = rzpPayment && rzpPayment.method;
    } catch (err) {
      console.error('Error fetching razorpay payment:', err);
    }

    const payment = await markPaid(req, {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      method,
    });

    if (payment && method && payment.method !== method) {
      payment.method = method;
      await payment.save();
    }

    res.json({ success: true, payment });
  } catch (e) {
    console.error('verify', e);
    res.status(500).json({ message: 'Verification failed' });
  }
};

// req.body is a raw Buffer (express.raw in the route file)
exports.webhook = async (req, res) => {
  try {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      console.error('webhook error: RAZORPAY_WEBHOOK_SECRET is missing');
      return res.status(500).send('Webhook secret is not configured');
    }

    const sig = req.headers['x-razorpay-signature'];
    if (!sig || typeof sig !== 'string') {
      return res.status(400).send('Missing signature header');
    }

    const bodyBuffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(bodyBuffer)
      .digest('hex');

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(bodyBuffer.toString('utf8'));
    } catch (parseErr) {
      return res.status(400).send('Invalid JSON payload');
    }

    if (event.event === 'payment.captured' || event.event === 'qr_code.credited') {
      const paymentEntity = event.payload && event.payload.payment && event.payload.payment.entity;
      const qrEntity = event.payload && event.payload.qr_code && event.payload.qr_code.entity;
      const p = paymentEntity || qrEntity;

      if (p) {
        if (paymentEntity && paymentEntity.order_id) {
          await markPaid(req, {
            orderId: paymentEntity.order_id,
            paymentId: paymentEntity.id,
            signature: sig,
            method: paymentEntity.method || 'online',
            amount: paymentEntity.amount ? paymentEntity.amount / 100 : undefined,
          });
        } else {
          const bookingNum =
            (paymentEntity && paymentEntity.notes && paymentEntity.notes.bookingNumber) ||
            (qrEntity && qrEntity.notes && qrEntity.notes.bookingNumber);
          const paymentId = (paymentEntity && paymentEntity.id) || (qrEntity && qrEntity.id) || '';
          const amount =
            (paymentEntity && paymentEntity.amount ? paymentEntity.amount / 100 : undefined) ||
            (qrEntity && qrEntity.payments_amount_received ? qrEntity.payments_amount_received / 100 : undefined);

          if (bookingNum) {
            await markPaid(req, {
              bookingNumber: bookingNum,
              paymentId,
              signature: sig,
              method: 'qr',
              amount,
            });
          }
        }
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('webhook', e);
    res.status(500).send('Webhook error');
  }
};

exports.receipt = async (req, res) => {
  try {
    const { bookingNumber } = req.params;
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ message: 'Phone query parameter is required' });
    }
    const booking = await findBooking(bookingNumber, phone);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    await generateReceipt(booking, res, { syncOrderFn: syncOrder, req });
  } catch (e) {
    console.error('receipt', e);
    res.status(500).json({ message: 'Could not generate receipt' });
  }
};

exports.status = async (req, res) => {
  try {
    const { bookingNumber } = req.params;
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ message: 'Phone query parameter is required' });
    }
    const booking = await findBooking(bookingNumber, phone);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // Sync any created orders for this booking
    const createdPayments = await Payment.find({
      bookingNumber: String(bookingNumber),
      status: 'created',
      razorpayOrderId: { $exists: true, $ne: null },
    });
    for (const p of createdPayments) {
      await syncOrder(p, req);
    }

    const payment = await Payment.findOne({ bookingNumber: String(bookingNumber), status: 'paid' });
    const isPaid = Boolean(payment || booking[F.paid] === 'paid' || booking.paymentStatus === 'paid');

    res.json({
      status: isPaid ? 'paid' : (booking.paymentStatus === 'pending' ? 'pending' : 'unpaid'),
      paid: isPaid,
      fare: Number(F.fare(booking)) || 0,
      method: booking.paymentMethod || (payment ? (payment.method || null) : null),
      paidAt: booking.paidAt || (payment ? (payment.paidAt || null) : null),
    });
  } catch (e) {
    console.error('status', e);
    res.status(500).json({ message: 'Could not fetch payment status' });
  }
};

exports.exportExcel = async (req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 }).lean();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Payments');
    ws.columns = [
      { header: 'Booking No', key: 'bookingNumber', width: 18 },
      { header: 'Customer Phone', key: 'customerPhone', width: 16 },
      { header: 'Amount (INR)', key: 'amount', width: 14 },
      { header: 'Method', key: 'method', width: 12 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Transaction ID', key: 'razorpayPaymentId', width: 26 },
      { header: 'Paid At', key: 'paidAt', width: 22 },
    ];
    ws.getRow(1).font = { bold: true };
    payments.forEach((p) => ws.addRow(p));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=payments.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error('export', e);
    res.status(500).json({ message: 'Export failed' });
  }
};

exports.stats = async (req, res) => {
  try {
    // Sync 'created' payments from the last 7 days (max 10)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCreated = await Payment.find({
      status: 'created',
      razorpayOrderId: { $exists: true, $ne: null },
      createdAt: { $gte: sevenDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(10);

    await Promise.allSettled(recentCreated.map((p) => syncOrder(p, req)));

    const paid = await Payment.find({ status: 'paid' }).lean();
    const paidBookingNumbers = [];
    paid.forEach((p) => {
      paidBookingNumbers.push(String(p.bookingNumber));
      if (!Number.isNaN(Number(p.bookingNumber))) {
        paidBookingNumbers.push(Number(p.bookingNumber));
      }
    });

    const paidBookingsFromDb = await Booking.find({ [F.paid]: 'paid' }).select('bookingNumber').lean();
    paidBookingsFromDb.forEach((b) => {
      paidBookingNumbers.push(String(b.bookingNumber));
      if (!Number.isNaN(Number(b.bookingNumber))) {
        paidBookingNumbers.push(Number(b.bookingNumber));
      }
    });

    const pendingBookings = await Payment.distinct('bookingNumber', {
      status: 'created',
      bookingNumber: { $nin: paidBookingNumbers },
    });

    res.json({
      totalRevenue: paid.reduce((s, p) => s + p.amount, 0),
      paidCount: paid.length,
      pendingCount: pendingBookings.length,
    });
  } catch (e) {
    res.status(500).json({ message: 'Stats failed' });
  }
};

exports.setCashMethod = async (req, res) => {
  try {
    const { bookingNumber, phone } = req.body;
    if (!bookingNumber || !phone) {
      return res.status(400).json({ message: 'Booking number and phone are required' });
    }
    const booking = await findBooking(bookingNumber, phone);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.paymentStatus === 'paid' || booking[F.paid] === 'paid') {
      return res.status(400).json({ message: 'Already paid' });
    }
    if (['Cancelled', 'Rejected'].includes(booking.status)) {
      return res.status(400).json({ message: `Cannot set payment for a ${booking.status.toLowerCase()} booking` });
    }

    booking.paymentMethod = 'cash';
    booking.paymentStatus = 'pending';
    await booking.save();

    const io = req.app && typeof req.app.get === 'function' ? req.app.get('io') : null;
    if (io) {
      io.emit('booking:updated', {
        bookingNumber: booking.bookingNumber,
        paymentMethod: 'cash',
        paymentStatus: 'pending',
      });
    }

    res.json({
      success: true,
      message: 'Cash payment selected',
      bookingNumber: booking.bookingNumber,
      paymentMethod: 'cash',
      paymentStatus: 'pending',
    });
  } catch (err) {
    console.error('setCashMethod error:', err);
    res.status(500).json({ message: 'Could not set cash payment' });
  }
};

exports.markCashPaid = async (req, res) => {
  try {
    const { bookingNumber, method } = req.body;
    if (!bookingNumber) {
      return res.status(400).json({ message: 'Booking number is required' });
    }
    const booking = await Booking.findOne({ bookingNumber: Number(bookingNumber) });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (req.user && req.user.role === 'driver') {
      if (!booking.assignedDriver || String(booking.assignedDriver) !== String(req.user.id)) {
        return res.status(403).json({ message: 'Not authorized for this booking' });
      }
    }

    if (booking.paymentStatus === 'paid' || booking[F.paid] === 'paid') {
      return res.status(400).json({ message: 'Booking is already paid' });
    }

    const finalMethod = (method === 'qr' || booking.paymentMethod === 'qr') ? 'qr' : 'cash';
    const amount = Number(F.fare(booking)) || booking.amount || booking.fare || 0;

    await markPaid(req, {
      bookingNumber: booking.bookingNumber,
      paymentId: finalMethod === 'qr' ? 'UPI_MANUAL' : 'CASH_COLLECTED',
      method: finalMethod,
      amount,
    });

    const updatedBooking = await Booking.findOne({ bookingNumber: Number(bookingNumber) });

    res.json({
      success: true,
      message: finalMethod === 'qr' ? 'UPI payment recorded' : 'Cash payment recorded',
      bookingNumber: updatedBooking ? updatedBooking.bookingNumber : booking.bookingNumber,
      paymentStatus: 'paid',
      paymentMethod: finalMethod,
      amount: (updatedBooking && (updatedBooking.amount || updatedBooking.fare)) || amount,
      paidAt: (updatedBooking && updatedBooking.paidAt) || new Date(),
    });
  } catch (err) {
    console.error('markCashPaid error:', err);
    res.status(500).json({ message: 'Could not record cash payment' });
  }
};

exports.health = (_req, res) => {
  const keyConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID.trim());
  const secretConfigured = Boolean(process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_KEY_SECRET.trim());
  const webhookSecretConfigured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET.trim());
  const frontendUrlConfigured = Boolean(process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim());

  res.json({
    ok: true,
    configured: keyConfigured && secretConfigured,
    keyConfigured,
    secretConfigured,
    webhookSecretConfigured,
    frontendUrlConfigured,
  });
};

exports.createQrCode = async (req, res) => {
  try {
    const { bookingNumber, phone } = req.body;
    if (!bookingNumber || !phone) {
      return res.status(400).json({ message: 'Booking number and phone are required' });
    }

    const booking = await findBooking(bookingNumber, phone);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.paymentStatus === 'paid' || booking[F.paid] === 'paid') {
      return res.status(400).json({ message: 'Already paid' });
    }
    if (['Cancelled', 'Rejected'].includes(booking.status)) {
      return res.status(400).json({ message: `Cannot pay for a ${booking.status.toLowerCase()} booking` });
    }

    let amount = Number(F.fare(booking));
    if (!amount || amount <= 0) {
      const Pricing = require('../models/Pricing');
      const pricing = await Pricing.findOne({ serviceType: booking.serviceType });
      if (pricing) {
        amount = pricing.basePrice + (pricing.perKmRate * (booking.distanceKm || 0));
        booking.fare = amount;
        booking.amount = amount;
        await booking.save();
      }
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Fare not available yet' });
    }

    // Check if Razorpay keys are configured
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.json({
        fallback: true,
        message: 'Razorpay keys not configured. Falling back to UPI manual payment.',
        amount,
      });
    }

    try {
      // 15 minutes expiry (max allowed in Razorpay single_use is up to 2 hours)
      const closeBy = Math.floor(Date.now() / 1000) + (15 * 60);
      const qr = await razorpay.qrCode.create({
        type: 'upi_qr',
        name: `Booking ${bookingNumber}`.slice(0, 40),
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: Math.round(amount * 100),
        description: `Payment for booking #${bookingNumber}`.slice(0, 255),
        close_by: closeBy,
        notes: { bookingNumber: String(bookingNumber) },
      });

      const qrExpiresAt = new Date(closeBy * 1000);
      const qrImageUrl = qr.image_url || qr.image_content || '';

      booking.qrId = qr.id;
      booking.qrExpiresAt = qrExpiresAt;
      booking.qrImageUrl = qrImageUrl;
      booking.paymentMethod = 'qr';
      await booking.save();

      return res.json({
        success: true,
        qrId: qr.id,
        image_url: qrImageUrl,
        image_content: qr.image_content,
        amount,
        expiry: qrExpiresAt,
      });
    } catch (rzpErr) {
      console.error('Razorpay QR Code creation error:', rzpErr.message || rzpErr);
      return res.json({
        fallback: true,
        message: 'Razorpay UPI QR code is not available on this account.',
        amount,
      });
    }
  } catch (err) {
    console.error('createQrCode error:', err);
    res.status(500).json({ message: 'Could not create QR code' });
  }
};

exports.qrStatus = async (req, res) => {
  try {
    const { qrId } = req.params;
    const { bookingNumber, phone } = req.query;
    if (!bookingNumber || !phone) {
      return res.status(400).json({ message: 'Booking number and phone are required' });
    }

    const booking = await findBooking(bookingNumber, phone);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // Verify that the qrId belongs to this booking
    const reqQrId = String(qrId || '').trim();
    const bookingQrId = booking.qrId ? String(booking.qrId).trim() : null;

    if (reqQrId !== 'fallback') {
      if (!bookingQrId || bookingQrId !== reqQrId) {
        return res.status(400).json({ message: 'QR ID does not belong to this booking' });
      }
    } else {
      if (bookingQrId && bookingQrId !== 'fallback') {
        return res.status(400).json({ message: 'QR ID does not belong to this booking' });
      }
    }

    const isPaid = Boolean(booking.paymentStatus === 'paid' || booking[F.paid] === 'paid');
    if (isPaid) {
      return res.json({
        status: 'paid',
        paid: true,
        amount: booking.fare || booking.amount,
        method: booking.paymentMethod || 'qr',
        paidAt: booking.paidAt,
      });
    }

    // If QR code was generated via Razorpay
    if (qrId && qrId !== 'fallback' && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      try {
        const qr = await razorpay.qrCode.fetch(qrId);
        if (qr && qr.payments_count_received > 0) {
          const paymentsRes = await razorpay.qrCode.fetchAllPayments(qrId);
          const items = (paymentsRes && paymentsRes.items) || (Array.isArray(paymentsRes) ? paymentsRes : []);
          const captured = items.find((p) => p.status === 'captured') || items[0];

          if (captured && (captured.status === 'captured' || captured.captured)) {
            const expectedPaise = Math.round((booking.fare || booking.amount || 0) * 100);
            if (captured.amount >= expectedPaise) {
              await markPaid(req, {
                bookingNumber: booking.bookingNumber,
                paymentId: captured.id,
                method: 'qr',
                amount: captured.amount ? captured.amount / 100 : (booking.fare || booking.amount),
              });

              const updatedBooking = await Booking.findOne({ bookingNumber: Number(bookingNumber) });
              return res.json({
                status: 'paid',
                paid: true,
                amount: updatedBooking ? (updatedBooking.fare || updatedBooking.amount) : (booking.fare || booking.amount),
                method: updatedBooking ? (updatedBooking.paymentMethod || 'qr') : 'qr',
                paidAt: updatedBooking ? updatedBooking.paidAt : new Date(),
              });
            }
          }
        }
      } catch (e) {
        console.error('qrStatus Razorpay fetch error:', e.message || e);
      }
    }

    const isExpired = booking.qrExpiresAt && new Date() > new Date(booking.qrExpiresAt);
    return res.json({
      status: isExpired ? 'expired' : (booking.paymentStatus === 'pending' ? 'pending' : 'unpaid'),
      paid: false,
      amount: booking.fare || booking.amount,
      method: booking.paymentMethod || null,
      paidAt: null,
    });
  } catch (err) {
    console.error('qrStatus error:', err);
    res.status(500).json({ message: 'Could not fetch QR status' });
  }
};

exports.getUpiLink = async (req, res) => {
  try {
    const { bookingNumber, phone } = req.query;
    if (!bookingNumber || !phone) {
      return res.status(400).json({ message: 'Booking number and phone are required' });
    }

    const booking = await findBooking(bookingNumber, phone);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    let amount = Number(F.fare(booking));
    if (!amount || amount <= 0) {
      const Pricing = require('../models/Pricing');
      const pricing = await Pricing.findOne({ serviceType: booking.serviceType });
      if (pricing) {
        amount = pricing.basePrice + (pricing.perKmRate * (booking.distanceKm || 0));
        booking.fare = amount;
        booking.amount = amount;
      }
    }

    const upiId = process.env.UPI_ID || 'breakdownassistant@upi';
    const payeeName = process.env.UPI_PAYEE_NAME || 'Vehicle Breakdown Assistant';
    const note = `Booking #${bookingNumber}`;
    const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${(amount || 0).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;

    booking.paymentMethod = 'qr';
    booking.paymentStatus = 'pending';
    await booking.save();

    res.json({
      success: true,
      upiLink,
      amount: amount || 0,
      upiId,
      payeeName,
      bookingNumber: booking.bookingNumber,
    });
  } catch (err) {
    console.error('getUpiLink error:', err);
    res.status(500).json({ message: 'Could not generate UPI link' });
  }
};

exports.syncOrder = syncOrder;
