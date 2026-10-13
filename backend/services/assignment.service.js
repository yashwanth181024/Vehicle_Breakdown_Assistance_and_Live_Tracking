const mongoose = require('mongoose');
const Driver = require('../models/Driver');

const DEFAULT_RADIUS_KM = () => Number(process.env.DISPATCH_RADIUS_KM) || 25;

/**
 * Finds eligible drivers nearest to a pickup point.
 * Eligible = online, verified, free, and not in excludeIds.
 * Each result carries distanceMeters (null when the booking has no coordinates).
 *
 * @param {{type:'Point',coordinates:[number,number]}|undefined} pickupCoords
 */
async function findNearestDrivers(pickupCoords, { excludeIds = [], limit = 1, radiusKm, serviceType } = {}) {
  const exclude = excludeIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const eligible = { isOnline: true, isAvailable: true, verificationStatus: 'verified', _id: { $nin: exclude } };
  if (serviceType) eligible.serviceTypes = serviceType;

  if (pickupCoords && Array.isArray(pickupCoords.coordinates) && pickupCoords.coordinates.length === 2) {
    const fetchLimit = Math.max(limit, 5);
    const drivers = await Driver.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [...pickupCoords.coordinates] },
          distanceField: 'distanceMeters',
          maxDistance: (radiusKm || DEFAULT_RADIUS_KM()) * 1000,
          spherical: true,
          query: eligible,
        },
      },
      { $limit: fetchLimit },
      { $project: { password: 0 } },
    ]);

    // Rating tie-breaker: bucket distance by 2km, sort by bucket ascending, then rating descending
    drivers.sort((a, b) => {
      const bucketA = Math.floor(a.distanceMeters / 2000);
      const bucketB = Math.floor(b.distanceMeters / 2000);
      if (bucketA === bucketB) {
        const rA = a.rating ? a.rating.avg : 0;
        const rB = b.rating ? b.rating.avg : 0;
        return rB - rA;
      }
      return bucketA - bucketB;
    });

    return drivers.slice(0, limit);
  }

  // No coordinates (customer typed an address only): fall back to any free driver,
  // most recently active first. The admin can still reassign manually.
  const drivers = await Driver.find(eligible)
    .sort({ locationUpdatedAt: -1 })
    .limit(limit)
    .select('-password')
    .lean();
  return drivers.map((d) => ({ ...d, distanceMeters: null }));
}

/** Marks a driver free again after a job ends or an assignment is undone. */
function releaseDriver(driverId, { completedJob = false } = {}) {
  return Driver.updateOne(
    { _id: driverId },
    { isAvailable: true, currentBooking: null, ...(completedJob && { $inc: { completedJobs: 1 } }) }
  );
}

/** Atomically reserves a driver. Resolves to null if they are no longer free. */
function reserveDriver(driverId, bookingId, { requireOnline = true } = {}) {
  return Driver.findOneAndUpdate(
    { _id: driverId, isAvailable: true, ...(requireOnline && { isOnline: true }) },
    { isAvailable: false, currentBooking: bookingId },
    { new: true }
  );
}

module.exports = { findNearestDrivers, releaseDriver, reserveDriver };
