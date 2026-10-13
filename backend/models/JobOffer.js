const mongoose = require('mongoose');

/**
 * A single offer of a booking to a single driver.
 * The dispatcher creates one at a time; if it is rejected or expires,
 * the next-nearest driver gets a new JobOffer.
 */
const jobOfferSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },
    attempt: { type: Number, default: 1 }, // 1st, 2nd, 3rd driver tried
    distanceMeters: { type: Number }, // driver -> customer at offer time
    expiresAt: { type: Date, required: true },
    respondedAt: { type: Date },
  },
  { timestamps: true }
);

// Fast lookup for "does this driver have an open offer?" and for the expiry sweep
jobOfferSchema.index({ driver: 1, status: 1 });
jobOfferSchema.index({ status: 1, expiresAt: 1 });
// A driver can never get two offers for the same booking
jobOfferSchema.index({ booking: 1, driver: 1 }, { unique: true });

jobOfferSchema.methods.isExpired = function isExpired() {
  return this.expiresAt.getTime() <= Date.now();
};

module.exports = mongoose.model('JobOffer', jobOfferSchema);
