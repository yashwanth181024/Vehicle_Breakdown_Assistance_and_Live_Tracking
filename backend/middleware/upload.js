const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { AppError } = require('./errorHandler');

const DOC_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'documents');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const DOC_ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };

fs.mkdirSync(DOC_UPLOAD_DIR, { recursive: true });

const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOC_UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${DOC_ALLOWED[file.mimetype]}`),
});

const docFileFilter = (_req, file, cb) => {
  if (DOC_ALLOWED[file.mimetype]) return cb(null, true);
  return cb(new AppError('Only JPG, PNG or PDF files are allowed', 400));
};

const uploadDoc = multer({ storage: docStorage, fileFilter: docFileFilter, limits: { fileSize: MAX_SIZE, files: 1 } });

/** Single document in the form field "document". */
const uploadDocument = uploadDoc.single('document');

module.exports = { uploadDocument, DOC_UPLOAD_DIR, MAX_SIZE };

