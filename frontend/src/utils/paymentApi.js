import { API_URL, SOCKET_URL } from '../api/axios';

export const API = SOCKET_URL || (API_URL ? API_URL.replace(/\/api\/?$/, '') : '');

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
export const createQrCode = (bookingNumber, phone) => post('/qr/create', { bookingNumber, phone });

export async function fetchQrStatus(qrId, bookingNumber, phone) {
  const res = await fetch(`${API}/api/payments/qr/status/${encodeURIComponent(qrId)}?bookingNumber=${encodeURIComponent(bookingNumber)}&phone=${encodeURIComponent(phone)}`);
  return await res.json().catch(() => ({}));
}

export async function fetchUpiLink(bookingNumber, phone) {
  const res = await fetch(`${API}/api/payments/upi-link?bookingNumber=${encodeURIComponent(bookingNumber)}&phone=${encodeURIComponent(phone)}`);
  return await res.json().catch(() => ({}));
}

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
