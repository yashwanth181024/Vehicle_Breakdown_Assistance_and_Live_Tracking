export const API = (import.meta.env.VITE_SOCKET_URL || (import.meta.env.VITE_API_URL || 'http://localhost:5055').replace(/\/api\/?$/, '')).replace(/\/$/, '');

async function post(path, body) {
  const res = await fetch(`${API}/api/payments${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export const createOrder = (bookingNumber, phone) => post('/create-order', { bookingNumber, phone });
export const verifyPayment = (payload) => post('/verify', payload);
export const setCashMethod = (bookingNumber, phone) => post('/cash', { bookingNumber, phone });
export const receiptUrl = (bookingNumber, phone) =>
  `${API}/api/payments/receipt/${encodeURIComponent(bookingNumber)}?phone=${encodeURIComponent(phone)}`;

export function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error('Could not load Razorpay'));
    document.body.appendChild(s);
  });
}
