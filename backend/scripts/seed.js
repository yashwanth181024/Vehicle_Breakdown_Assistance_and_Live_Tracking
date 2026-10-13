/**
 * Seeds the database with what the app needs on day one.
 *
 *   npm run seed                 admin account, 3 demo drivers, About / Contact pages
 *   npm run seed -- --online     also puts the demo drivers online (handy for testing dispatch)
 *   npm run seed -- --reset      wipes ALL collections first (refused when NODE_ENV=production)
 *
 * Safe to run again: anything that already exists is left alone.
 * Admin login comes from SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD in .env.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const connectDB = require('../config/db');
const Admin = require('../models/Admin');
const Driver = require('../models/Driver');
const Booking = require('../models/Booking');
const Tracking = require('../models/Tracking');
const Page = require('../models/Page');
const JobOffer = require('../models/JobOffer');
const Message = require('../models/Message');
const Pricing = require('../models/Pricing');
const { toPoint } = require('../utils/geo');

const args = new Set(process.argv.slice(2));
const DEMO_PASSWORD = 'Driver@123';

// Demo drivers spread around Bengaluru so "nearest driver" has something to choose between
const DEMO_DRIVERS = [
  { driverId: 'drv001', name: 'Ravi Kumar', mobile: '9876500001', email: 'ravi@example.com', address: 'Indiranagar, Bengaluru', vehicle: { type: 'Tow truck', number: 'KA01AB1001' }, serviceTypes: ['Towing', 'Flat Tyre', 'Accident Recovery'], lat: 12.9784, lng: 77.6408 },
  { driverId: 'drv002', name: 'Suresh Gowda', mobile: '9876500002', email: 'suresh@example.com', address: 'Jayanagar, Bengaluru', vehicle: { type: 'Mechanic bike', number: 'KA02CD2002' }, serviceTypes: ['Engine Problem', 'Flat Tyre', 'Battery Jump-start'], lat: 12.925, lng: 77.5938 },
  { driverId: 'drv003', name: 'Imran Pasha', mobile: '9876500003', email: 'imran@example.com', address: 'Yelahanka, Bengaluru', vehicle: { type: 'Service van', number: 'KA03EF3003' }, serviceTypes: ['Fuel Delivery', 'Lockout', 'Ambulance', 'Other'], lat: 13.1007, lng: 77.5963 },
];

const PAGES = [
  {
    pageType: 'aboutus',
    title: 'About Us',
    description:
      'We offer a 24x7 roadside assistance service for any mechanical or electrical breakdown or traffic accident. ' +
      'Book help in a few taps (or by voice), and the nearest available driver is sent to you. ' +
      'If your vehicle cannot be driven, we will tow it to the nearest workshop or to the authorities.',
  },
  {
    pageType: 'contactus',
    title: 'Contact Us',
    description: '890, Sector 62, Gyan Sarovar, GAIL, Noida (Delhi/NCR)',
    email: 'info@example.com',
    mobile: '7896541236',
    timing: '10:30 am to 7:30 pm',
  },
];

const PRICINGS = [
  { serviceType: 'Towing', basePrice: 1500, perKmRate: 30 },
  { serviceType: 'Flat Tyre', basePrice: 400, perKmRate: 0 },
  { serviceType: 'Battery Jump-start', basePrice: 350, perKmRate: 0 },
  { serviceType: 'Fuel Delivery', basePrice: 200, perKmRate: 0 },
  { serviceType: 'Engine Problem', basePrice: 800, perKmRate: 15 },
  { serviceType: 'Lockout', basePrice: 300, perKmRate: 0 },
  { serviceType: 'Accident Recovery', basePrice: 2500, perKmRate: 50 },
  { serviceType: 'Ambulance', basePrice: 0, perKmRate: 0 },
  { serviceType: 'Other', basePrice: 500, perKmRate: 10 },
];

async function seedAdmin() {
  const username = (process.env.SEED_ADMIN_USERNAME || 'admin').toLowerCase();
  if (await Admin.exists({ username })) return `admin "${username}" already exists`;
  await Admin.create({
    name: 'Admin',
    username,
    email: 'admin@example.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
  });
  return `created admin "${username}"`;
}

async function seedDrivers() {
  const out = [];
  for (const d of DEMO_DRIVERS) {
    if (await Driver.exists({ driverId: d.driverId })) { out.push(`${d.driverId} exists`); continue; }
    await Driver.create({
      driverId: d.driverId, name: d.name, mobile: d.mobile, email: d.email, address: d.address,
      vehicle: d.vehicle, serviceTypes: d.serviceTypes, password: DEMO_PASSWORD,
      verificationStatus: 'verified',
      isOnline: args.has('--online'),
      location: toPoint(d.lat, d.lng),
      locationUpdatedAt: new Date(),
    });
    out.push(`${d.driverId} created`);
  }
  if (args.has('--online')) {
    await Driver.updateMany({ driverId: { $in: DEMO_DRIVERS.map((d) => d.driverId) } }, { isOnline: true });
  }
  return out.join(', ');
}

async function seedPages() {
  const out = [];
  for (const p of PAGES) {
    const created = await Page.updateOne({ pageType: p.pageType }, { $setOnInsert: p }, { upsert: true });
    out.push(`${p.pageType} ${created.upsertedCount ? 'created' : 'exists'}`);
  }
  return out.join(', ');
}

async function seedPricings() {
  const out = [];
  for (const p of PRICINGS) {
    const created = await Pricing.updateOne({ serviceType: p.serviceType }, { $setOnInsert: p }, { upsert: true });
    out.push(`${p.serviceType} ${created.upsertedCount ? 'created' : 'exists'}`);
  }
  return out.length ? out.length + ' priced' : '';
}

async function main() {
  if (args.has('--reset') && process.env.NODE_ENV === 'production') {
    console.error('Refusing to --reset while NODE_ENV=production.');
    process.exit(1);
  }
  await connectDB();

  if (args.has('--reset')) {
    await Promise.all([Admin, Driver, Booking, Tracking, Page, JobOffer, Message, Pricing].map((m) => m.deleteMany({})));
    console.log('All collections cleared.');
  }

  // Make sure indexes (especially the 2dsphere ones used for nearest-driver search) exist
  await Promise.all([Admin, Driver, Booking, Tracking, Page, JobOffer, Message].map((m) => m.init()));

  console.log('Admin :', await seedAdmin());
  console.log('Drivers:', await seedDrivers());
  console.log('Pages  :', await seedPages());
  console.log('Pricing:', await seedPricings());
  console.log(`\nAdmin login : ${(process.env.SEED_ADMIN_USERNAME || 'admin').toLowerCase()} / ${process.env.SEED_ADMIN_PASSWORD ? '(your SEED_ADMIN_PASSWORD)' : 'Admin@123'}`);
  console.log(`Driver login: drv001, drv002, drv003 / ${DEMO_PASSWORD}`);
  console.log('Change these passwords before putting the app online.');
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { DEMO_DRIVERS, PAGES };
