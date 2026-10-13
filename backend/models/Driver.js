const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// GeoJSON point. `default: undefined` on the field below keeps drivers without a
// known location out of the 2dsphere index instead of storing an invalid point.
const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
      validate: {
        validator: (v) =>
          Array.isArray(v) && v.length === 2 &&
          v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90,
        message: 'coordinates must be [lng, lat]',
      },
    },
  },
  { _id: false }
);

const driverSchema = new mongoose.Schema(
  {
    // Login ID, same idea as the old DriverID (e.g. "vams123")
    driverId: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    mobile: { type: String, required: true, trim: true, match: [/^\d{10}$/, 'Mobile number must be 10 digits'] },
    email: { type: String, trim: true, lowercase: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
    address: { type: String, trim: true, maxlength: 500 },
    password: { type: String, required: true, minlength: 6, select: false },

    vehicle: {
      type: { type: String, trim: true }, // tow truck, mechanic bike, etc.
      number: { type: String, trim: true, uppercase: true },
    },
    serviceTypes: { type: [String], default: [] },
    documents: {
      type: [{
        name: { type: String, required: true },
        url: { type: String, required: true },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
      }],
      default: []
    },

    // --- Dispatch state ---
    isOnline: { type: Boolean, default: false }, // driver switched "go online"
    isAvailable: { type: Boolean, default: true }, // false while on an active job
    verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' }, // admin approves before jobs are offered
    rejectionReason: { type: String, default: null },
    currentBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },

    // --- Live location ---
    location: { type: pointSchema, default: undefined },
    locationUpdatedAt: { type: Date },

    // --- Reputation ---
    rating: {
      avg: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0, min: 0 },
    },
    completedJobs: { type: Number, default: 0 },
  },
  { timestamps: true }
);

driverSchema.index({ location: '2dsphere' });
driverSchema.index({ isOnline: 1, isAvailable: 1, verificationStatus: 1 });

driverSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

driverSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

/** Adds a customer rating and recalculates the running average. */
driverSchema.methods.addRating = function addRating(stars) {
  const total = this.rating.avg * this.rating.count + stars;
  this.rating.count += 1;
  this.rating.avg = Math.round((total / this.rating.count) * 10) / 10;
  return this.save();
};

driverSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model('Driver', driverSchema);
