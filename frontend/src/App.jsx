import { Suspense, lazy, useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import JobOfferModal from './components/JobOfferModal.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useToast } from './context/ToastContext.jsx';
import { playAlert, useSocketEvent } from './hooks/useSocket.js';

// Each page loads only when it is opened, so the first visit stays fast on a weak mobile connection
const Home = lazy(() => import('./pages/Home.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));
const BookingRequest = lazy(() => import('./pages/BookingRequest.jsx'));
const TrackBooking = lazy(() => import('./pages/TrackBooking.jsx'));
const SharedTracking = lazy(() => import('./pages/SharedTracking.jsx'));

const AdminLogin = lazy(() => import('./pages/admin/Login.jsx'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard.jsx'));
const AdminRequests = lazy(() => import('./pages/admin/Requests.jsx'));
const AdminAssignDriver = lazy(() => import('./pages/admin/AssignDriver.jsx'));
const AdminManageDrivers = lazy(() => import('./pages/admin/ManageDrivers.jsx'));
const AdminReports = lazy(() => import('./pages/admin/Reports.jsx'));
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics.jsx'));
const AdminHeatmap = lazy(() => import('./pages/admin/Heatmap.jsx'));

const DriverLogin = lazy(() => import('./pages/driver/Login.jsx'));
const DriverDashboard = lazy(() => import('./pages/driver/Dashboard.jsx'));
const DriverMyJobs = lazy(() => import('./pages/driver/MyJobs.jsx'));
const DriverShareLocation = lazy(() => import('./pages/driver/ShareLocation.jsx'));
const DriverActiveJob = lazy(() => import('./pages/driver/ActiveJob.jsx'));
const DriverEarnings = lazy(() => import('./pages/driver/Earnings.jsx'));

function NotFound() {
  return (
    <div className="container page empty">
      <h1>Page not found</h1>
      <p style={{ margin: '0 auto 20px' }}>The address may be mistyped, or the page has moved.</p>
      <Link to="/" className="btn btn-primary">Go to the home page</Link>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="loading" role="status">
      <div className="spinner" aria-hidden="true" />
      Loading
    </div>
  );
}

/** Starts every page at the top, like a normal website. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Admins hear a sound and see a message for every new request or SOS, on whichever admin page they are on. */
function AdminAlerts() {
  const toast = useToast();
  useSocketEvent('admin:alert', (alert) => {
    playAlert();
    toast.alert(alert.message, { to: '/admin/requests' });
  });
  return null;
}

export default function App() {
  const { role } = useAuth();
  const { pathname } = useLocation();
  // The page a family member opens from a share link shows only the map, with no site navigation
  const bare = pathname.startsWith('/share/');

  return (
    <>
      <ScrollToTop />
      {!bare && <Navbar />}
      {role === 'admin' && <AdminAlerts />}
      {role === 'driver' && <JobOfferModal />}

      <main id="main">
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/book" element={<BookingRequest />} />
            <Route path="/track" element={<TrackBooking />} />
            <Route path="/share/:token" element={<SharedTracking />} />

            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/requests" element={<ProtectedRoute role="admin"><AdminRequests /></ProtectedRoute>} />
            <Route path="/admin/requests/:bookingNumber/assign" element={<ProtectedRoute role="admin"><AdminAssignDriver /></ProtectedRoute>} />
            <Route path="/admin/drivers" element={<ProtectedRoute role="admin"><AdminManageDrivers /></ProtectedRoute>} />
            <Route path="/admin/reports" element={<ProtectedRoute role="admin"><AdminReports /></ProtectedRoute>} />
            <Route path="/admin/analytics" element={<ProtectedRoute role="admin"><AdminAnalytics /></ProtectedRoute>} />
            <Route path="/admin/heatmap" element={<ProtectedRoute role="admin"><AdminHeatmap /></ProtectedRoute>} />

            <Route path="/driver/login" element={<DriverLogin />} />
            <Route path="/driver" element={<ProtectedRoute role="driver"><DriverDashboard /></ProtectedRoute>} />
            <Route path="/driver/active" element={<ProtectedRoute role="driver"><DriverActiveJob /></ProtectedRoute>} />
            <Route path="/driver/jobs" element={<ProtectedRoute role="driver"><DriverMyJobs /></ProtectedRoute>} />
            <Route path="/driver/earnings" element={<ProtectedRoute role="driver"><DriverEarnings /></ProtectedRoute>} />
            <Route path="/driver/location" element={<ProtectedRoute role="driver"><DriverShareLocation /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>

      {!bare && <Footer />}
    </>
  );
}
