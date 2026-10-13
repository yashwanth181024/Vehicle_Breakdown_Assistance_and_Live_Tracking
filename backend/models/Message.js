const mongoose = require('mongoose');

/** Chat message between the customer and the assigned driver. */
const messageSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    bookingNumber: { type: Number, required: true, index: true },
    senderRole: { type: String, enum: ['customer', 'driver', 'system'], required: true },
    senderName: { type: String, trim: true, maxlength: 120 },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ booking: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
