const mongoose = require('mongoose');

const pricingSchema = new mongoose.Schema(
  {
    serviceType: { type: String, required: true, unique: true },
    basePrice: { type: Number, required: true, default: 500, min: 0 },
    perKmRate: { type: Number, required: true, default: 20, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Pricing', pricingSchema);
