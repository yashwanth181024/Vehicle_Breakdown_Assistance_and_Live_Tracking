const crypto = require('crypto');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const razorpay = require('../services/razorpayService');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');

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

const markPaid = async (req, { orderId, paymentId, signature, method }) => {
  const payment = await Payment.findOne({ razorpayOrderId: orderId });
  if (!payment) return null;
  if (payment.status === 'paid') {
    if (method && !payment.method) {
      payment.method = method;
      await payment.save();
    }
    return payment; // idempotent
  }
  payment.status = 'paid';
  payment.razorpayPaymentId = paymentId;
  payment.razorpaySignature = signature || '';
  if (method) payment.method = method;
  payment.paidAt = new Date();
  await payment.save();
  await Booking.findByIdAndUpdate(payment.bookingId, { [F.paid]: 'paid' });
  const io = req && req.app && typeof req.app.get === 'function' ? req.app.get('io') : null;
  if (io) {
    io.emit('payment:received', {
      bookingNumber: payment.bookingNumber,
      amount: payment.amount,
      paymentId,
    });
  }
  return payment;
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
    if (booking[F.paid] === 'paid') return res.status(400).json({ message: 'Already paid' });

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
    const refreshedBooking = await Booking.findById(booking._id).select(F.paid);
    if (refreshedBooking && refreshedBooking[F.paid] === 'paid') {
      return res.status(400).json({ message: 'Already paid' });
    }

    const fare = Number(F.fare(booking));
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
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(req.body)
      .digest('hex');
    if (sig !== expected) return res.status(400).send('Invalid signature');
    const event = JSON.parse(req.body.toString());
    if (event.event === 'payment.captured') {
      const p = event.payload.payment.entity;
      await markPaid(req, { orderId: p.order_id, paymentId: p.id, signature: sig, method: p.method });
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
    const booking = await findBooking(bookingNumber, phone);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // Sync any created orders for this booking before building the receipt
    const createdPayments = await Payment.find({
      bookingNumber: String(bookingNumber),
      status: 'created',
      razorpayOrderId: { $exists: true, $ne: null },
    });
    for (const p of createdPayments) {
      await syncOrder(p, req);
    }

    const payment = await Payment.findOne({ bookingNumber: String(bookingNumber), status: 'paid' });
    const fare = Number(F.fare(booking)) || 0;
    if (!process.env.FRONTEND_URL) {
      console.error('receipt error: FRONTEND_URL is missing');
    }
    const payUrl = `${process.env.FRONTEND_URL || ''}/pay/${bookingNumber}`;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=receipt-${bookingNumber}.pdf`);
    doc.pipe(res);

    doc.fontSize(20).text('Breakdown Assistant - Receipt', { align: 'center' }).moveDown();
    doc.fontSize(12)
      .text(`Booking No: ${bookingNumber}`)
      .text(`Customer phone: ${phone}`)
      .text(`Amount: Rs. ${fare.toFixed(2)}`)
      .text(`Status: ${payment ? 'PAID' : 'UNPAID'}`);

    if (payment) {
      doc.text(`Transaction ID: ${payment.razorpayPaymentId}`)
        .text(`Method: ${payment.method || '-'}`)
        .text(`Paid at: ${payment.paidAt.toLocaleString('en-IN')}`);
    } else {
      const qr = await QRCode.toBuffer(payUrl, { width: 220 });
      doc.moveDown().text('Scan to pay:').moveDown(0.5).image(qr, { width: 150 })
        .moveDown().fontSize(9).text(payUrl);
    }
    doc.end();
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
    const isPaid = Boolean(payment || booking[F.paid] === 'paid');

    res.json({
      status: isPaid ? 'paid' : 'unpaid',
      paid: isPaid,
      fare: Number(F.fare(booking)) || 0,
      method: payment ? (payment.method || null) : null,
      paidAt: payment ? (payment.paidAt || null) : null,
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

exports.syncOrder = syncOrder;
