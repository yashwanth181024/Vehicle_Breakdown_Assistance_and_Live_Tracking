/**
 * End-to-end check of the running backend, without a frontend.
 * Walks one breakdown from booking to completion using the real database:
 *   book -> nearest driver gets the offer -> reject -> next driver gets it -> accept
 *   -> location + route/ETA -> share link -> On The Way -> Completed -> rating -> admin views
 *
 * Needs: the server running (npm run dev) and the demo data seeded with:  npm run seed -- --online
 * Run:   npm run smoke            (or: node scripts/smoke-test.js http://localhost:5055)
 *
 * It creates one test booking (name "Smoke Test"). Delete it from the admin page afterwards if you like.
 */
const BASE = (process.argv[2] || process.env.API_URL || 'http://localhost:5055').replace(/\/$/, '');
const ADMIN = { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS || 'Admin@123' };
const DRIVER_PASSWORD = 'Driver@123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}${detail !== undefined ? '\n        -> ' + JSON.stringify(detail) : ''}`); }
  return condition;
}

async function api(method, path, { body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json, data: json.data };
}

/** Polls every driver's open offers until one of them has one. */
async function waitForOffer(drivers, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const d of drivers) {
      const r = await api('GET', '/api/drivers/me/offers', { token: d.token });
      if (r.data && r.data.length) return { driver: d, offer: r.data[0] };
    }
    await sleep(500);
  }
  return null;
}

async function main() {
  console.log(`\nTesting ${BASE}\n`);

  console.log('Server and logins');
  let r;
  try { r = await api('GET', '/api/health'); } catch (e) {
    console.log(`  FAIL  Cannot reach ${BASE}. Is the server running (npm run dev) and is the port right?`);
    process.exit(1);
  }
  check('health endpoint', r.status === 200, r);

  r = await api('POST', '/api/auth/admin/login', { body: ADMIN });
  if (!check('admin login (run "npm run seed" first if this fails)', r.status === 200 && r.data && r.data.token, r.body)) process.exit(1);
  const adminToken = r.data.token;

  const drivers = [];
  for (const id of ['drv001', 'drv002', 'drv003']) {
    r = await api('POST', '/api/auth/driver/login', { body: { username: id, password: DRIVER_PASSWORD } });
    if (!check(`driver ${id} login`, r.status === 200 && r.data.token, r.body)) process.exit(1);
    const d = { id, token: r.data.token };
    const active = await api('GET', '/api/drivers/me/active', { token: d.token });
    if (active.data) { // a previous aborted run left this driver busy: cancel that job to free them
      await api('PATCH', `/api/bookings/${active.data.bookingNumber}/status`, { token: adminToken, body: { status: 'Cancelled', remark: 'smoke test cleanup' } });
    }
    const on = await api('PATCH', '/api/drivers/me/online', { token: d.token, body: { isOnline: true } });
    check(`driver ${id} online`, on.status === 200, on.body);
    drivers.push(d);
  }

  console.log('\nTriage and Fare Estimate');
  r = await api('POST', '/api/bookings/triage', { body: { description: 'my engine is smoking' } });
  check('triage identifies engine problem and critical priority', r.status === 200 && r.data.priority === 'critical' && r.data.serviceType === 'Engine Problem', r.body);

  r = await api('POST', '/api/bookings/fare-estimate', { body: { serviceType: 'Flat Tyre', distanceKm: 10 } });
  check('fare estimate returns correct amount', r.status === 200 && r.data.estimatedFare === 400, r.body);

  console.log('\nBooking and dispatch');
  const phone = '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  r = await api('POST', '/api/bookings', {
    body: {
      name: 'Smoke Test', phone, email: '', serviceType: 'Flat Tyre', description: 'stuck on the highway near Indiranagar',
      pickupLocation: 'Indiranagar, Bengaluru', pickupLat: 12.98, pickupLng: 77.645,
    },
  });
  if (!check('create booking (201)', r.status === 201, r.body)) process.exit(1);
  const n = r.data.bookingNumber;
  check('severity "high" worked out from the description', r.data.severity === 'high', r.data);

  r = await api('POST', '/api/bookings', { body: { name: 'Smoke Test', phone, pickupLocation: 'x' } });
  check('second active booking for the same phone is refused (409)', r.status === 409, r.body);

  console.log('\nSOS and False Alarm');
  r = await api('POST', '/api/bookings/sos', { body: { phone: '9000000000', pickupLocation: 'Test Location', pickupLat: 12.9, pickupLng: 77.6, emergencyContacts: ['9111111111'] } });
  check('create SOS booking', r.status === 201 && r.data.severity === 'critical', r.body);
  const sosBookingNumber = r.data.bookingNumber;
  r = await api('PATCH', `/api/bookings/${sosBookingNumber}/status`, { token: adminToken, body: { status: 'False Alarm', remark: 'Test false alarm' } });
  check('cancel SOS as False Alarm', r.status === 200, r.body);

  let got = await waitForOffer(drivers);
  check('nearest driver (drv001, Indiranagar) gets the offer first', got && got.driver.id === 'drv001', got && got.driver.id);
  if (!got) { console.log('\nNo driver received an offer. Did you run "npm run seed -- --online"?'); process.exit(1); }
  check('offer carries a distance and a countdown', got.offer.distanceKm !== null && got.offer.timeoutSeconds > 0, got.offer);

  r = await api('POST', `/api/drivers/me/offers/${got.offer.offerId}/reject`, { token: got.driver.token });
  check('drv001 rejects', r.status === 200, r.body);
  got = await waitForOffer(drivers);
  check('next-nearest driver (drv002, Jayanagar) gets it', got && got.driver.id === 'drv002', got && got.driver.id);
  if (!got) process.exit(1);

  r = await api('POST', `/api/drivers/me/offers/${got.offer.offerId}/accept`, { token: got.driver.token });
  check('drv002 accepts', r.status === 200, r.body);
  const driver = got.driver;

  console.log('\nTracking, route and share link');
  r = await api('POST', '/api/bookings/track', { body: { bookingNumber: n, phone } });
  check('customer sees status "Assigned" and the driver', r.data && r.data.booking.status === 'Assigned' && r.data.booking.driver.name, r.body);
  check('customer tracking is refused with a wrong phone (404)', (await api('POST', '/api/bookings/track', { body: { bookingNumber: n, phone: '1111111111' } })).status === 404);

  r = await api('POST', '/api/drivers/me/location', { token: driver.token, body: { lat: 12.95, lng: 77.62 } });
  check('driver sends location', r.status === 200, r.body);
  r = await api('POST', '/api/route/booking', { body: { bookingNumber: n, phone } });
  check('route + ETA returned', r.data && r.data.route && r.data.route.etaMinutes > 0, r.body);
  if (r.data && r.data.route) console.log(`        ETA ${r.data.route.etaMinutes} min, ${(r.data.route.distanceMeters / 1000).toFixed(1)} km${r.data.route.approximate ? ' (straight-line estimate: routing server unreachable)' : ''}`);

  r = await api('POST', `/api/bookings/${n}/share`, { body: { phone } });
  check('share link created', r.status === 201 && r.data.url, r.body);
  if (r.data && r.data.url) {
    const token = r.data.url.split('/share/')[1];
    const shared = await api('GET', `/api/share/${token}`);
    check('share link opens without login', shared.status === 200 && shared.data.booking.status === 'Assigned', shared.body);
    check('share view hides phone numbers', !JSON.stringify(shared.body).includes(phone), 'phone leaked');
  }

  console.log('\nFinishing the job');
  r = await api('PATCH', `/api/bookings/${n}/status`, { token: driver.token, body: { status: 'On The Way' } });
  check('driver: On The Way', r.status === 200, r.body);
  r = await api('PATCH', `/api/bookings/${n}/status`, { token: driver.token, body: { status: 'Completed' } });
  check('driver: Completed', r.status === 200, r.body);
  r = await api('POST', `/api/bookings/${n}/rating`, { body: { phone, rating: 5, feedback: 'smoke test' } });
  check('customer rates 5 stars', r.status === 200, r.body);

  r = await fetch(`${BASE}/api/bookings/${n}/receipt?phone=${phone}`);
  check('receipt download returns a PDF', r.status === 200 && r.headers.get('content-type') === 'application/pdf', r.status);
  r = await api('GET', '/api/drivers/me/profile', { token: driver.token });
  check('driver is free again and has 1 rating', r.data && r.data.isAvailable === true && r.data.rating.count >= 1, r.data);
  r = await api('GET', '/api/drivers/me/earnings', { token: driver.token });
  check('driver earnings show 1 completed job and correct fare', r.status === 200 && r.data.completedJobs >= 1 && r.data.totalEarned > 0, r.body);

  console.log('\nAdmin views');
  r = await api('GET', '/api/bookings?q=Smoke', { token: adminToken });
  check('admin list finds the booking', r.data && r.data.some((b) => b.bookingNumber === n), r.body);
  r = await api('GET', `/api/bookings/${n}`, { token: adminToken });
  check('admin detail shows the timeline and the 3 offer outcomes', r.data && r.data.timeline.length >= 3 && r.data.offerHistory.length >= 3, r.data && { timeline: r.data.timeline.length, history: r.data.offerHistory });
  r = await api('GET', '/api/analytics/summary', { token: adminToken });
  check('analytics summary', r.status === 200 && r.data.totalBookings >= 1, r.body);
  r = await api('GET', '/api/analytics/heatmap', { token: adminToken });
  check('heatmap has the pickup point', r.status === 200 && r.data.points.length >= 1, r.body);
  r = await api('GET', '/api/analytics/overview', { token: adminToken });
  check('analytics overview', r.status === 200 && r.data.dispatch.offersSent >= 2, r.body);

  console.log(`\n${failed ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED'}: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('\nUnexpected error:', e); process.exit(1); });
