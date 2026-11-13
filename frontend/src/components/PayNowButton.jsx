import { Link } from 'react-router-dom';
import '../pages/payment.css';

// Usage: <PayNowButton booking={booking} />
// Shows for any active booking that is not paid, cancelled, or rejected.
export default function PayNowButton({ booking }) {
  if (!booking) return null;
  if (booking.paymentStatus === 'paid') return <span className="pay-ok">Paid</span>;

  const status = String(booking.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'rejected') return null;

  const phone = booking.customerPhone || booking.phone || '';
  return (
    <Link className="pay-btn" to={`/pay/${booking.bookingNumber}?phone=${encodeURIComponent(phone)}`}>
      Pay online
    </Link>
  );
}
