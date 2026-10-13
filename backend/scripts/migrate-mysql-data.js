/**
 * Imports data from the original PHP project's MySQL dump (vehassitancemsdb.sql).
 * Reads the .sql file directly, so MySQL does not need to be installed.
 *
 *   npm run migrate:mysql -- "../SQL File/vehassitancemsdb.sql" --dry-run   check only, writes nothing
 *   npm run migrate:mysql -- "../SQL File/vehassitancemsdb.sql"             import
 *
 * What comes across: drivers, bookings, tracking history, About / Contact pages.
 * What does not:
 *   - passwords (the old ones are unsalted MD5). Migrated drivers get a random temporary password,
 *     written to scripts/migrated-credentials.csv (keep it private, then delete it).
 *   - the old admin account. Use `npm run seed` for the admin.
 *   - rows that fail validation, mainly test data with phone numbers shorter than 10 digits.
 *     They are listed at the end.
 * Safe to run twice: anything already imported is skipped.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------- SQL dump parser
/** Reads a quoted MySQL string starting at s[i] === "'". Returns [value, indexAfterClosingQuote]. */
function readString(s, i) {
  const ESC = { 0: '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a' };
  let out = '';
  i += 1;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      const next = s[i + 1];
      out += Object.prototype.hasOwnProperty.call(ESC, next) ? ESC[next] : next;
      i += 2;
    } else if (ch === "'") {
      if (s[i + 1] === "'") { out += "'"; i += 2; } else return [out, i + 1];
    } else {
      out += ch;
      i += 1;
    }
  }
  throw new Error('Unterminated string in SQL dump');
}

/** Parses "(1, 'a', NULL), (2, 'b', 3);" starting at index i. Returns { rows, next }. */
function readTuples(s, i) {
  const rows = [];
  for (;;) {
    while (/\s/.test(s[i])) i += 1;
    if (s[i] !== '(') throw new Error(`Expected "(" at ${i}`);
    i += 1;
    const row = [];
    for (;;) {
      while (/\s/.test(s[i])) i += 1;
      if (s[i] === "'") {
        const [val, next] = readString(s, i);
        row.push(val);
        i = next;
      } else {
        let j = i;
        while (j < s.length && s[j] !== ',' && s[j] !== ')') j += 1;
        const raw = s.slice(i, j).trim();
        row.push(/^null$/i.test(raw) ? null : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw);
        i = j;
      }
      while (/\s/.test(s[i])) i += 1;
      if (s[i] === ',') { i += 1; continue; }
      if (s[i] === ')') { i += 1; break; }
      throw new Error(`Unexpected "${s[i]}" at ${i}`);
    }
    rows.push(row);
    while (/\s/.test(s[i])) i += 1;
    if (s[i] === ',') { i += 1; continue; }
    if (s[i] === ';') return { rows, next: i + 1 };
    throw new Error(`Expected "," or ";" after row at ${i}`);
  }
}

/** Returns { tablename: [ {Column: value, ...}, ... ] } for every INSERT statement in the dump. */
function parseSqlDump(sql) {
  const tables = {};
  const insert = /INSERT INTO `(\w+)`\s*\(([^)]*)\)\s*VALUES\s*/gi;
  let m;
  while ((m = insert.exec(sql))) {
    const cols = m[2].split(',').map((c) => c.replace(/[`\s]/g, ''));
    const { rows, next } = readTuples(sql, insert.lastIndex);
    insert.lastIndex = next;
    (tables[m[1].toLowerCase()] ||= []).push(...rows.map((r) => Object.fromEntries(cols.map((c, k) => [c, r[k]]))));
  }
  return tables;
}

// ---------------------------------------------------------------- row mapping
const toDate = (v) => (v ? new Date(String(v).replace(' ', 'T') + 'Z') : undefined);
const toText = (v) => (v === null || v === undefined || v === '' ? undefined : String(v));
const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const STATUS_MAP = { approved: 'Approved', 'on the way': 'On The Way', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled', canceled: 'Cancelled' };

const mapDriver = (r, password) => ({
  driverId: String(r.DriverID).toLowerCase(),
  name: toText(r.Name),
  mobile: toText(r.MobileNumber),
  email: toText(r.Email),
  address: toText(r.Address) && r.Address.replace(/\r?\n/g, ', '),
  password,
  isVerified: true,
  createdAt: toDate(r.JoiningDate),
});

/** driverIdToObjectId: Map from lower-case driverId to the Mongo _id (null in a dry run). */
function mapBooking(r, driverIdToObjectId = new Map()) {
  const status = STATUS_MAP[String(r.Status || '').trim().toLowerCase()] || 'Pending';
  const assigned = r.AssignTo ? driverIdToObjectId.get(String(r.AssignTo).toLowerCase()) : undefined;
  return {
    bookingNumber: r.BookingNumber,
    name: toText(r.Name),
    email: toText(r.Email),
    phone: toText(r.PhoneNumber),
    pickupLocation: toText(r.PickupLoc),
    destination: toText(r.Destination),
    pickupDate: toText(r.PickupDate),
    pickupTime: toText(r.PickupTime),
    remark: toText(r.Remark),
    status,
    serviceType: 'Other',
    severity: 'medium',
    assignedDriver: assigned,
    completedAt: status === 'Completed' ? toDate(r.UpdationDate) : undefined,
    createdAt: toDate(r.DateofRequest),
    updatedAt: toDate(r.UpdationDate),
  };
}

const mapPage = (r) => ({
  pageType: r.PageType,
  title: toText(r.PageTitle) || (r.PageType === 'aboutus' ? 'About Us' : 'Contact Us'),
  description: stripTags(r.PageDescription),
  email: toText(r.Email),
  mobile: toText(r.MobileNumber),
  timing: toText(r.Timing),
});

// ---------------------------------------------------------------- main
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: npm run migrate:mysql -- path/to/vehassitancemsdb.sql [--dry-run]');
    process.exit(1);
  }
  const tables = parseSqlDump(fs.readFileSync(path.resolve(file), 'utf8'));
  const count = (t) => (tables[t] || []).length;
  console.log(`Found: ${count('tbldriver')} drivers, ${count('tblbook')} bookings, ${count('tbltracking')} tracking rows, ${count('tblpage')} pages`);

  const Driver = require('../models/Driver');
  const Booking = require('../models/Booking');
  const Tracking = require('../models/Tracking');
  const Page = require('../models/Page');
  const skipped = [];
  const credentials = [];

  let mongoose;
  if (!dryRun) {
    mongoose = require('mongoose');
    await require('../config/db')();
    await Promise.all([Driver, Booking, Tracking, Page].map((m) => m.init()));
  }

  // ---- drivers
  const driverIds = new Map();
  let nd = 0;
  for (const r of tables.tbldriver || []) {
    const tempPassword = crypto.randomBytes(6).toString('base64url');
    const doc = new Driver(mapDriver(r, tempPassword));
    const err = doc.validateSync();
    if (err) { skipped.push(`driver ${r.DriverID}: ${Object.values(err.errors).map((e) => e.message).join('; ')}`); continue; }
    if (!dryRun) {
      const existing = await Driver.findOne({ driverId: doc.driverId }).select('_id');
      if (existing) { driverIds.set(doc.driverId, existing._id); continue; }
      await doc.save();
      driverIds.set(doc.driverId, doc._id);
      credentials.push(`${doc.driverId},${tempPassword}`);
    }
    nd += 1;
  }

  // ---- bookings
  const bookingIds = new Map();
  let nb = 0;
  for (const r of tables.tblbook || []) {
    const data = mapBooking(r, driverIds);
    const doc = new Booking(data);
    const err = doc.validateSync();
    if (err) { skipped.push(`booking ${r.BookingNumber}: ${Object.values(err.errors).map((e) => e.message).join('; ')}`); continue; }
    if (!dryRun) {
      const existing = await Booking.findOne({ bookingNumber: data.bookingNumber }).select('_id');
      if (existing) { bookingIds.set(data.bookingNumber, existing._id); continue; }
      await doc.save();
      bookingIds.set(data.bookingNumber, doc._id);
    }
    nb += 1;
  }

  // ---- tracking history
  let nt = 0;
  for (const r of tables.tbltracking || []) {
    if (!dryRun) {
      const booking = bookingIds.get(r.BookingNumber);
      if (!booking) { skipped.push(`tracking row ${r.ID}: booking ${r.BookingNumber} was not imported`); continue; }
      const at = toDate(r.UpdationDate);
      if (await Tracking.exists({ bookingNumber: r.BookingNumber, status: r.Status, createdAt: at })) continue;
      await Tracking.create({
        booking, bookingNumber: r.BookingNumber, status: toText(r.Status) || 'Pending',
        remark: toText(r.Remark), updatedBy: { role: 'system' }, createdAt: at,
      });
    }
    nt += 1;
  }

  // ---- pages
  let np = 0;
  for (const r of tables.tblpage || []) {
    const data = mapPage(r);
    if (!['aboutus', 'contactus'].includes(data.pageType)) continue;
    if (!dryRun) {
      const res = await Page.updateOne({ pageType: data.pageType }, { $setOnInsert: data }, { upsert: true });
      if (!res.upsertedCount) continue;
    }
    np += 1;
  }

  console.log(`${dryRun ? 'Would import' : 'Imported'}: ${nd} drivers, ${nb} bookings, ${nt} tracking rows, ${np} pages`);
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length}:`);
    skipped.forEach((s) => console.log('  - ' + s));
  }
  if (credentials.length) {
    const out = path.join(__dirname, 'migrated-credentials.csv');
    fs.writeFileSync(out, 'driverId,temporaryPassword\n' + credentials.join('\n') + '\n', { mode: 0o600 });
    console.log(`\nTemporary driver passwords written to ${out}. Hand them out, then delete the file.`);
  }
  if (mongoose) await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { parseSqlDump, readString, mapDriver, mapBooking, mapPage };
