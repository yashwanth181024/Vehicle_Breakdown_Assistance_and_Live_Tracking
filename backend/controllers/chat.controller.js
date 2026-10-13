/**
 * REST access to chat history, so the page can show earlier messages on load.
 * Sending and live delivery happen over Socket.IO (sockets/chat.socket.js).
 *   POST /api/chat/history   customer: { bookingNumber, phone }
 *   GET  /api/chat/:bookingNumber   admin or the assigned driver
 */
const Booking = require('../models/Booking');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { getHistory } = require('../sockets/chat.socket');
const { findOwnedBooking } = require('./booking.controller').helpers;

exports.customerHistory = asyncHandler(async (req, res) => {
  const booking = await findOwnedBooking(req.body.bookingNumber, req.body.phone);
  res.json({ success: true, data: await getHistory(booking._id) });
});

exports.staffHistory = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ bookingNumber: Number.parseInt(req.params.bookingNumber, 10) }).select('_id assignedDriver');
  if (!booking) throw new AppError('Booking not found', 404);
  if (req.user.role === 'driver' && String(booking.assignedDriver) !== String(req.user.id)) {
    throw new AppError('This job is not assigned to you', 403);
  }
  res.json({ success: true, data: await getHistory(booking._id) });
});
