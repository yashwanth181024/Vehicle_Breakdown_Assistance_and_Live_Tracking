import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
import {
  API,
  createOrder,
  verifyPayment,
  loadRazorpay,
  receiptUrl,
  createQrCode,
  fetchQrStatus,
  fetchUpiLink,
} from '../utils/paymentApi';
import './payment.css';

export default function PaymentPage() {
  const { bookingNumber } = useParams();
  const [params] = useSearchParams();
  const [phone, setPhone] = useState(params.get('phone') || '');
  const [mode, setMode] = useState(params.get('mode') === 'qr' ? 'qr' : 'online');
  const [status, setStatus] = useState('idle'); // idle | loading | paid | error
  const [message, setMessage] = useState('');
  const [fare, setFare] = useState(null);

  // QR state
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [qrExpired, setQrExpired] = useState(false);
  const pollRef = useRef(null);

  // Live Socket update when server confirms payment
  useEffect(() => {
    const socket = io(API);
    socket.on('payment:received', (d) => {
      if (String(d.bookingNumber) === String(bookingNumber)) {
        setStatus('paid');
        setMessage('');
      }
    });
    return () => socket.disconnect();
  }, [bookingNumber]);

  // Check initial payment status on load or when phone changes
  useEffect(() => {
    if (!bookingNumber) return;
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10) {
      if (phone.length > 0) {
        setMessage('Please enter a valid 10-digit mobile number.');
      }
      return;
    }
    fetch(`${API}/api/payments/status/${bookingNumber}?phone=${encodeURIComponent(phone)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setMessage(d.message || 'Booking not found or phone number does not match.');
          return;
        }
        setMessage('');
        if (d && (d.status === 'paid' || d.paid)) setStatus('paid');
        if (d && d.fare) setFare(d.fare);
      })
      .catch(() => {
        setMessage('Could not connect to payment service.');
      });
  }, [bookingNumber, phone]);

  // Razorpay Checkout Modal
  const payOnline = async () => {
    if (phone.replace(/\D/g, '').length < 10) {
      setMessage('Enter the 10-digit mobile number used for this booking');
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
        name: 'Vehicle Breakdown Assistant',
        description: `Booking #${bookingNumber}`,
        prefill: { contact: phone },
        theme: { color: '#0d4f9e' },
        handler: async (r) => {
          try {
            await verifyPayment(r);
            setStatus('paid');
          } catch (e) {
            setStatus('error');
            setMessage(e.message || 'Payment verification failed');
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
      setMessage(e.message || 'Payment creation failed');
    }
  };

  // QR Generation
  const generateQr = useCallback(async () => {
    if (phone.replace(/\D/g, '').length < 10) {
      setMessage('Enter the 10-digit mobile number used for this booking');
      return;
    }
    setQrLoading(true);
    setQrExpired(false);
    setMessage('');
    try {
      const res = await createQrCode(bookingNumber, phone);
      if (res.fallback) {
        // Fallback manual UPI QR
        const upiRes = await fetchUpiLink(bookingNumber, phone);
        const dataUrl = await QRCode.toDataURL(upiRes.upiLink || '', { width: 220, margin: 2 });
        setQrData({
          qrId: 'fallback',
          image_url: dataUrl,
          amount: upiRes.amount,
          fallback: true,
          upiLink: upiRes.upiLink,
        });
        setTimeLeft(15 * 60);
      } else if (res.success) {
        let imageUrl = res.image_url;
        if (!imageUrl && res.image_content) {
          imageUrl = await QRCode.toDataURL(res.image_content, { width: 220, margin: 2 });
        }
        setQrData({
          qrId: res.qrId,
          image_url: imageUrl,
          amount: res.amount,
          fallback: false,
          expiry: res.expiry,
        });
        const secondsRemaining = res.expiry
          ? Math.max(0, Math.floor((new Date(res.expiry).getTime() - Date.now()) / 1000))
          : 15 * 60;
        setTimeLeft(secondsRemaining);
      } else {
        setMessage(res.message || 'Could not generate QR code');
      }
    } catch (err) {
      // If error, attempt UPI link fallback
      try {
        const upiRes = await fetchUpiLink(bookingNumber, phone);
        const dataUrl = await QRCode.toDataURL(upiRes.upiLink || '', { width: 220, margin: 2 });
        setQrData({
          qrId: 'fallback',
          image_url: dataUrl,
          amount: upiRes.amount,
          fallback: true,
          upiLink: upiRes.upiLink,
        });
        setTimeLeft(15 * 60);
      } catch (fallbackErr) {
        setMessage(err.message || 'Could not generate QR code');
      }
    } finally {
      setQrLoading(false);
    }
  }, [bookingNumber, phone]);

  // Generate QR code when user switches to QR mode and phone is valid
  useEffect(() => {
    if (mode === 'qr' && !qrData && phone.replace(/\D/g, '').length >= 10 && status !== 'paid') {
      generateQr();
    }
  }, [mode, qrData, phone, status, generateQr]);

  // Countdown timer for QR expiry
  useEffect(() => {
    if (!qrData || qrExpired || status === 'paid' || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setQrExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [qrData, qrExpired, status, timeLeft]);

  // Status polling for QR payment
  useEffect(() => {
    if (mode !== 'qr' || !qrData || qrExpired || status === 'paid') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await fetchQrStatus(qrData.qrId, bookingNumber, phone);
        if (res && (res.paid || res.status === 'paid')) {
          setStatus('paid');
          setMessage('');
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (res && res.status === 'expired') {
          setQrExpired(true);
        }
      } catch (e) {
        // Silent poll error
      }
    };

    pollRef.current = setInterval(checkStatus, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [mode, qrData, qrExpired, status, bookingNumber, phone]);

  const formatCountdown = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
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
            <div className="pay-tabs">
              <button
                type="button"
                className={`pay-tab ${mode === 'online' ? 'active' : ''}`}
                onClick={() => setMode('online')}
              >
                💳 Card / Netbanking
              </button>
              <button
                type="button"
                className={`pay-tab ${mode === 'qr' ? 'active' : ''}`}
                onClick={() => {
                  setMode('qr');
                  if (!qrData && phone.replace(/\D/g, '').length >= 10) generateQr();
                }}
              >
                📱 Pay by Scan QR
              </button>
            </div>

            <label htmlFor="pay-phone">Phone number used for booking</label>
            <input
              id="pay-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
              maxLength={15}
            />

            {mode === 'online' ? (
              <>
                {fare && <p className="pay-fare">Amount: Rs. {fare}</p>}
                <button className="pay-btn" onClick={payOnline} disabled={status === 'loading'}>
                  {status === 'loading' ? 'Please wait...' : 'Pay now'}
                </button>
                <p className="pay-note">Supports Credit/Debit cards, Netbanking and Wallets.</p>
              </>
            ) : (
              <div style={{ marginTop: 8 }}>
                {phone.replace(/\D/g, '').length < 10 ? (
                  <p className="pay-note">Enter your 10-digit phone number above to display the QR code.</p>
                ) : qrLoading ? (
                  <div className="qr-box">
                    <p className="muted small">Generating secure UPI QR code…</p>
                  </div>
                ) : qrData ? (
                  <div className="qr-box">
                    {qrData.fallback ? (
                      <span className="qr-badge">Pay via UPI (manual confirmation)</span>
                    ) : (
                      <span className="qr-badge" style={{ background: '#dcfce7', color: '#166534' }}>Instant Auto-Confirmation</span>
                    )}

                    <img className="qr-img" src={qrData.image_url} alt="Scan QR to Pay" />

                    <div className="pay-fare">Amount: ₹{qrData.amount || fare}</div>

                    {!qrExpired ? (
                      <>
                        <div className="qr-timer">Expires in: {formatCountdown(timeLeft)}</div>
                        <p className="pay-note">
                          {qrData.fallback
                            ? 'Scan with any UPI app. Driver or admin will confirm payment receipt.'
                            : 'Scan with any UPI app (Google Pay, PhonePe, Paytm, BHIM).'}
                        </p>
                      </>
                    ) : (
                      <div>
                        <p className="pay-error" style={{ margin: '6px 0' }}>QR code expired</p>
                        <button type="button" className="btn btn-sm btn-primary" onClick={generateQr}>
                          Regenerate QR
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button type="button" className="btn btn-sm btn-signal btn-block" onClick={generateQr}>
                    Generate QR Code
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {message && <p className="pay-error">{message}</p>}

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link
            to={`/track/${bookingNumber}?phone=${encodeURIComponent(phone)}`}
            style={{ color: '#0d4f9e', fontSize: '0.9rem', textDecoration: 'none' }}
          >
            ← Back to Tracking
          </Link>
        </div>
      </div>
    </div>
  );
}
