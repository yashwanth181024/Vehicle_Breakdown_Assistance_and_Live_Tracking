const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const Payment = require('../models/Payment');

/**
 * Generates a unified PDF receipt containing full booking & payment details.
 */
async function generateReceipt(booking, res, { syncOrderFn = null, req = null } = {}) {
  const bookingNumber = String(booking.bookingNumber);

  // Sync any pending orders if syncOrderFn is provided
  if (typeof syncOrderFn === 'function') {
    try {
      const createdPayments = await Payment.find({
        bookingNumber,
        status: 'created',
        razorpayOrderId: { $exists: true, $ne: null },
      });
      for (const p of createdPayments) {
        await syncOrderFn(p, req);
      }
    } catch (e) {
      console.error('Error syncing order before receipt:', e.message || e);
    }
  }

  const payment = await Payment.findOne({ bookingNumber, status: 'paid' });
  const isPaid = Boolean(payment || booking.paymentStatus === 'paid');
  const fare = Number(booking.fare || booking.amount || (payment && payment.amount) || 0);

  const frontendUrl = process.env.FRONTEND_URL || '';
  const payUrl = `${frontendUrl}/pay/${bookingNumber}?phone=${encodeURIComponent(booking.phone || '')}`;

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=receipt-${bookingNumber}.pdf`);
  doc.pipe(res);

  // Header
  doc.fontSize(20).text('Vehicle Breakdown Assistant', { align: 'center' });
  doc.fontSize(11).text('24x7 Emergency Roadside Assistance & Live Tracking', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(14).text('Service & Payment Receipt', { align: 'center', underline: true });
  doc.moveDown(1.5);

  // Booking Details Section
  doc.fontSize(13).text('Booking Details', { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(11);
  doc.text(`Booking Number: #${booking.bookingNumber}`);
  const dateStr = booking.completedAt
    ? new Date(booking.completedAt).toLocaleString('en-IN')
    : new Date(booking.createdAt).toLocaleString('en-IN');
  doc.text(`Booking Date: ${dateStr}`);
  doc.text(`Customer Name: ${booking.name || '-'}`);
  doc.text(`Customer Phone: ${booking.phone || '-'}`);
  doc.text(`Service Type: ${booking.serviceType || '-'}`);
  const vehicleStr = `${booking.vehicleType || '-'}${booking.vehicleNumber ? ` (${booking.vehicleNumber})` : ''}`;
  doc.text(`Vehicle: ${vehicleStr}`);
  doc.text(`Pickup Location: ${booking.pickupLocation || '-'}`);
  if (booking.destination) {
    doc.text(`Destination: ${booking.destination}`);
  }
  doc.text(`Job Status: ${booking.status || '-'}`);
  doc.moveDown(1.2);

  // Payment Details Section
  doc.fontSize(13).text('Payment Details', { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(11);
  doc.text(`Amount: Rs. ${fare.toFixed(2)}`);

  const paymentStatusText = isPaid
    ? 'PAID'
    : (booking.paymentStatus === 'pending' || booking.paymentMethod === 'cash')
    ? 'CASH PENDING'
    : 'UNPAID';
  doc.text(`Payment Status: ${paymentStatusText}`);

  const paymentMethodText = booking.paymentMethod === 'cash'
    ? 'Cash to Driver'
    : (payment && payment.method)
    ? `Online (${payment.method})`
    : booking.paymentMethod === 'online'
    ? 'Online'
    : (isPaid ? 'Paid' : 'Not selected yet');
  doc.text(`Payment Method: ${paymentMethodText}`);

  if (isPaid) {
    const txnId = (payment && payment.razorpayPaymentId) || booking.paymentId || 'Cash Collection';
    doc.text(`Transaction / Payment ID: ${txnId}`);
    const paidTime = (payment && payment.paidAt) || booking.paidAt || booking.updatedAt;
    doc.text(`Paid At: ${new Date(paidTime).toLocaleString('en-IN')}`);
  } else {
    try {
      const qr = await QRCode.toBuffer(payUrl, { width: 180 });
      doc.moveDown(0.8).text('Scan to pay online:').moveDown(0.4).image(qr, { width: 130 })
        .moveDown(0.4).fontSize(9).text(payUrl);
    } catch (qrErr) {
      console.error('QR code generation error:', qrErr.message);
    }
  }

  doc.moveDown(2);
  doc.fontSize(10).text('Thank you for choosing Vehicle Breakdown Assistant.', { align: 'center' });

  doc.end();
}

module.exports = { generateReceipt };

