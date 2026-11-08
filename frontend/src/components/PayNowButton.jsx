import { Link } from 'react-router-dom';
import '../pages/payment.css';

// Usage: <PayNowButton booking={booking} />
// Shows only when the job is completed and unpaid. Adjust field names if yours differ.
export default function PayNowButton({ booking }) {
  if (!booking) return null;
  if (booking.paymentStatus === 'paid') return <span className="pay-ok">Paid</span>;
  const completed = String(booking.status || '').toLowerCase() === 'completed';
  if (!completed) return null;
  const phone = booking.customerPhone || booking.phone || '';
  return (
    <Link className="pay-btn" to={`/pay/${booking.bookingNumber}?phone=${encodeURIComponent(phone)}`}>
      Pay now
    </Link>
  );
}
