const mongoose = require('mongoose');

/** Editable "About us" and "Contact us" content (replaces the old tblpage table). */
const pageSchema = new mongoose.Schema(
  {
    pageType: { type: String, required: true, unique: true, enum: ['aboutus', 'contactus'] },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true }, // plain text or sanitised HTML
    email: { type: String, trim: true, lowercase: true },
    mobile: { type: String, trim: true },
    timing: { type: String, trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Page', pageSchema);
