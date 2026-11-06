const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  bookingNumber: { type: String, required: true, index: true },
  customerPhone: String,
  amount: { type: Number, required: true }, // rupees
  currency: { type: String, default: 'INR' },
  method: String,
  razorpayOrderId: { type: String, index: true },
  razorpayPaymentId: String,
  razorpaySignature: String,
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
  paidAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
