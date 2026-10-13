/** Shared lists and small formatting helpers, so every page shows things the same way. */

export const SERVICE_TYPES = [
  'Towing',
  'Flat Tyre',
  'Battery Jump Start',
  'Fuel Delivery',
  'Engine Problem',
  'Lockout',
  'Accident Recovery',
  'Other',
];

export const VEHICLE_TYPES = ['Car', 'Bike', 'Scooter', 'Auto Rickshaw', 'Van', 'Truck', 'Bus', 'Other'];

export const STATUSES = ['Pending', 'Approved', 'Assigned', 'On The Way', 'Completed', 'Rejected', 'Cancelled'];

/** Statuses after which nothing more can happen to a booking. */
export const CLOSED = ['Completed', 'Rejected', 'Cancelled'];

/** "On The Way" becomes "badge badge-ontheway", matching the CSS. */
export const statusClass = (status) => `badge badge-${String(status || '').toLowerCase().replace(/\s+/g, '')}`;

export function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${formatTime(d)}`;
}

export const km = (meters) => (meters == null ? '' : `${(meters / 1000).toFixed(1)} km`);

export const isPhone = (value) => /^[6-9]\d{9}$/.test(String(value || '').replace(/\D/g, '').slice(-10));
export const cleanPhone = (value) => String(value || '').replace(/\D/g, '').slice(-10);
