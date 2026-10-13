const mongoose = require('mongoose');

const STATUSES = ['Pending', 'Approved', 'Assigned', 'On The Way', 'Completed', 'Rejected', 'Cancelled', 'False Alarm'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const SERVICE_TYPES = [
  'Towing', 'Flat Tyre', 'Battery Jump-start', 'Fuel Delivery',
  'Engine Problem', 'Lockout', 'Accident Recovery', 'Ambulance', 'Other',
];

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false }
);

// One entry per driver the dispatcher tried
const offerHistorySchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
    outcome: { type: String, enum: ['offered', 'accepted', 'rejected', 'expired'], required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: { type: Number, required: true, unique: true, index: true },

    // --- Customer ---
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
    phone: { type: String, required: true, trim: true, match: [/^\d{10}$/, 'Phone number must be 10 digits'] },
    emergencyContacts: { type: [String], default: [] },

    // --- Vehicle & problem ---
    vehicleType: { type: String, trim: true, maxlength: 60 },
    vehicleNumber: { type: String, trim: true, uppercase: true, maxlength: 20 },
    serviceType: { type: String, enum: SERVICE_TYPES, default: 'Other' },
    description: { type: String, trim: true, maxlength: 1000 },

    // --- Location ---
    pickupLocation: { type: String, required: true, trim: true, maxlength: 300 },
    pickupCoords: { type: pointSchema, default: undefined },
    destination: { type: String, trim: true, maxlength: 300 },
    destinationCoords: { type: pointSchema, default: undefined },

    pickupDate: { type: String, trim: true },
    pickupTime: { type: String, trim: true },

    // --- Workflow ---
    status: { type: String, enum: STATUSES, default: 'Pending', index: true },
    priority: { type: String, enum: ['normal', 'critical'], default: 'normal', index: true },
    remark: { type: String, trim: true, maxlength: 300 },
    cancelReason: { type: String, trim: true, maxlength: 300 },
    assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null, index: true },
    assignedAt: { type: Date },
    completedAt: { type: Date },
    offerHistory: { type: [offerHistorySchema], default: [] },
    dispatchFailed: { type: Boolean, default: false }, // true when no driver accepted
    fare: { type: Number },
    distanceKm: { type: Number, default: 0 },

    // --- Severity (accident / highway jobs rank first in the admin queue) ---
    severity: { type: String, enum: SEVERITIES, default: 'medium', index: true },

    // --- AI photo diagnosis ---
    diagnosis: {
      problem: String,
      suggestedService: { type: String, enum: SERVICE_TYPES },
      confidence: { type: Number, min: 0, max: 1 },
      advice: String,
      photoUrl: String,
    },

    // --- Public share link ---
    shareToken: { type: String, unique: true, sparse: true, select: false },
    shareTokenExpiresAt: { type: Date, select: false },

    // --- Customer feedback ---
    rating: { type: Number, min: 1, max: 5 },
    feedback: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

bookingSchema.index({ pickupCoords: '2dsphere' }, { sparse: true });
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ phone: 1, createdAt: -1 });

bookingSchema.statics.STATUSES = STATUSES;
bookingSchema.statics.SEVERITIES = SEVERITIES;
bookingSchema.statics.SERVICE_TYPES = SERVICE_TYPES;

/** True once the job is finished one way or another. */
bookingSchema.methods.isClosed = function isClosed() {
  return ['Completed', 'Rejected', 'Cancelled'].includes(this.status);
};

module.exports = mongoose.model('Booking', bookingSchema);
