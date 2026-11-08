import { useEffect, useState } from 'react';
import { API } from '../utils/paymentApi';
import { getToken } from '../api/axios';
import '../pages/payment.css';

const getAdminToken = () => {
  const token = getToken();
  if (token) return token;
  try {
    const saved = JSON.parse(localStorage.getItem('vba_auth') || 'null');
    if (saved && saved.token) return saved.token;
  } catch {}
  return ['vba_auth', 'adminToken', 'token', 'authToken'].map((k) => localStorage.getItem(k)).find(Boolean) || null;
};

export default function AdminPaymentsPanel() {
  const [stats, setStats] = useState(null);

  const getHeaders = () => {
    const token = getAdminToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    fetch(`${API}/api/payments/stats`, { headers: getHeaders() })
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const download = async () => {
    const res = await fetch(`${API}/api/payments/export`, { headers: getHeaders() });
    if (!res.ok) return alert('Export failed (are you logged in as admin?)');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payments.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="admin-pay">
      <div className="stat"><b>Rs. {stats?.totalRevenue ?? 0}</b>Total revenue</div>
      <div className="stat"><b>{stats?.paidCount ?? 0}</b>Paid</div>
      <div className="stat"><b>{stats?.pendingCount ?? 0}</b>Pending</div>
      <button onClick={download}>Download payments (Excel)</button>
    </div>
  );
}
