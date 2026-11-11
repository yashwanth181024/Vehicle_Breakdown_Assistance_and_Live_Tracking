import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { API, createOrder, verifyPayment, loadRazorpay, receiptUrl } from '../utils/paymentApi';
import './payment.css';

export default function PaymentPage() {
  const { bookingNumber } = useParams();
  const [params] = useSearchParams();
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [status, setStatus] = useState('idle'); // idle | loading | paid | error
  const [message, setMessage] = useState('');
  const [fare, setFare] = useState(null);

  // live update when the server confirms payment
  useEffect(() => {
    const socket = io(API);
    socket.on('payment:received', (d) => {
      if (String(d.bookingNumber) === String(bookingNumber)) setStatus('paid');
    });
    return () => socket.disconnect();
  }, [bookingNumber]);

  // check initial status on load when phone has at least 10 digits
  useEffect(() => {
    if (!bookingNumber || phone.replace(/\D/g, '').length < 10) return;
    fetch(`${API}/api/payments/status/${bookingNumber}?phone=${encodeURIComponent(phone)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && (d.status === 'paid' || d.paid)) setStatus('paid');
        if (d && d.fare) setFare(d.fare);
      })
      .catch(() => {});
  }, [bookingNumber, phone]);

  const pay = async () => {
    if (phone.replace(/\D/g, '').length < 10) {
      setMessage('Enter the phone number used for the booking');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const order = await createOrder(bookingNumber, phone);
      setFare(order.fare);
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Breakdown Assistant',
        description: `Booking #${bookingNumber}`,
        prefill: { contact: phone },
        theme: { color: '#0d4f9e' },
        handler: async (r) => {
          try {
            await verifyPayment(r);
            setStatus('paid');
          } catch (e) {
            setStatus('error');
            setMessage(e.message);
          }
        },
        modal: { ondismiss: () => setStatus((s) => (s === 'paid' ? s : 'idle')) },
      });
      rzp.on('payment.failed', (resp) => {
        setStatus('error');
        setMessage(resp.error?.description || 'Payment failed');
      });
      rzp.open();
    } catch (e) {
      setStatus('error');
      setMessage(e.message);
    }
  };

  return (
    <div className="pay-wrap">
      <div className="pay-card">
        <h1>Pay for your booking</h1>
        <p className="pay-sub">Booking #{bookingNumber}</p>

        {status === 'paid' ? (
          <>
            <div className="pay-ok">Payment received. Thank you!</div>
            <a className="pay-btn" href={receiptUrl(bookingNumber, phone)} target="_blank" rel="noreferrer">
              Download receipt
            </a>
          </>
        ) : (
          <>
            <label htmlFor="pay-phone">Phone number used for booking</label>
            <input
              id="pay-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
            />
            {fare && <p className="pay-fare">Amount: Rs. {fare}</p>}
            <button className="pay-btn" onClick={pay} disabled={status === 'loading'}>
              {status === 'loading' ? 'Please wait...' : 'Pay now'}
            </button>
            <p className="pay-note">UPI, cards and net banking supported.</p>
          </>
        )}
        {message && <p className="pay-error">{message}</p>}
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link to={`/track/${bookingNumber}?phone=${encodeURIComponent(phone)}`} style={{ color: '#0d4f9e', fontSize: '0.9rem', textDecoration: 'none' }}>
            ← Back to Tracking
          </Link>
        </div>
      </div>
    </div>
  );
}
