const crypto = require('crypto');

/** 9-digit numeric booking number, same style as the original PHP project. */
function generateBookingNumber() {
  return crypto.randomInt(100000000, 1000000000);
}

/**
 * Generates a booking number that is not already in use.
 * @param {import('mongoose').Model} BookingModel
 */
async function generateUniqueBookingNumber(BookingModel) {
  for (let i = 0; i < 10; i += 1) {
    const candidate = generateBookingNumber();
    // eslint-disable-next-line no-await-in-loop
    const exists = await BookingModel.exists({ bookingNumber: candidate });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate a unique booking number');
}

module.exports = { generateBookingNumber, generateUniqueBookingNumber };
