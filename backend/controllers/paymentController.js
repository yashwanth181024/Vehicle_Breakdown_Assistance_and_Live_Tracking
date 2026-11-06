const crypto = require('crypto');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const razorpay = require('../services/razorpayService');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');

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
  if (payment.status === 'paid') return payment; // idempotent
  payment.status = 'paid';
  payment.razorpayPaymentId = paymentId;
  payment.razorpaySignature = signature;
  if (method) payment.method = method;
  payment.paidAt = new Date();
  await payment.save();
  await Booking.findByIdAndUpdate(payment.bookingId, { [F.paid]: 'paid' });
  const io = req.app.get('io');
  if (io) {
    io.emit('payment:received', {
      bookingNumber: payment.bookingNumber,
      amount: payment.amount,
      paymentId,
    });
  }
  return payment;
};

exports.createOrder = async (req, res) => {
  try {
    const { bookingNumber, phone } = req.body;
    if (!bookingNumber || !phone) {
      return res.status(400).json({ message: 'Booking number and phone are required' });
    }
    const booking = await findBooking(bookingNumber, phone);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking[F.paid] === 'paid') return res.status(400).json({ message: 'Already paid' });

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
    res.status(500).json({ message: 'Could not create order' });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Missing fields' });
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
    const payment = await markPaid(req, {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    res.json({ success: true, payment });
  } catch (e) {
    console.error('verify', e);
    res.status(500).json({ message: 'Verification failed' });
  }
};

// req.body is a raw Buffer (express.raw in the route file)
exports.webhook = async (req, res) => {
  try {
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

    const payment = await Payment.findOne({ bookingNumber: String(bookingNumber), status: 'paid' });
    const fare = Number(F.fare(booking)) || 0;
    const payUrl = `${process.env.FRONTEND_URL}/pay/${bookingNumber}`;

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
    const paid = await Payment.find({ status: 'paid' }).lean();
    res.json({
      totalRevenue: paid.reduce((s, p) => s + p.amount, 0),
      paidCount: paid.length,
      pendingCount: await Payment.countDocuments({ status: 'created' }),
    });
  } catch (e) {
    res.status(500).json({ message: 'Stats failed' });
  }
};
