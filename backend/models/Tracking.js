const mongoose = require('mongoose');

/**
 * Status timeline for a booking (replaces the old tbltracking table).
 * One document is written every time the status changes.
 */
const trackingSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    bookingNumber: { type: Number, required: true, index: true },
    status: { type: String, required: true, trim: true },
    remark: { type: String, trim: true, maxlength: 300 },
    updatedBy: {
      role: { type: String, enum: ['system', 'customer', 'driver', 'admin'], default: 'system' },
      id: { type: mongoose.Schema.Types.ObjectId },
      name: { type: String },
    },
    // Optional snapshot of where the driver was at this step
    location: {
      type: new mongoose.Schema(
        {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number] },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

trackingSchema.index({ bookingNumber: 1, createdAt: 1 });

module.exports = mongoose.model('Tracking', trackingSchema);
