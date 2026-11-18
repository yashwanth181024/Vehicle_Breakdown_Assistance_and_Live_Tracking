# Vehicle Breakdown Assistance and Live Tracking

A MERN-stack web platform that connects stranded vehicle owners with nearby roadside-assistance drivers, with no-login booking, nearest-driver auto-dispatch, live tracking on a map, real-time chat, online and offline payments, a multilingual interface, and an admin analytics dashboard. It can also be installed on a phone as a Progressive Web App (PWA).

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-0B4F9E?style=for-the-badge)](https://vehicle-breakdown-assistant-1-sdp9.onrender.com/)
[![GitHub](https://img.shields.io/badge/Source-GitHub-181717?style=for-the-badge&logo=github)](https://github.com/yashwanth181024/Vehicle_Breakdown_Assistance_and_Live_Tracking)

**Live demo:** https://vehicle-breakdown-assistant-1-sdp9.onrender.com/

<img src="Project-Output%27s/Deployment_and_Mobile_App_Output/Live_Demo_QR_Code.png" width="180" alt="Scan to open the live demo">

*Scan the QR code with your phone to open the live demo.*

> The demo runs on a free Render instance, so the first load can take up to a minute while the server wakes up.

*MCA III Semester Project, 2026-27 | Dr. Ambedkar Institute of Technology, Bengaluru | Visvesvaraya Technological University (VTU)*
*Submitted for the 11th International INEX Expo (State Level Selection, Karnataka)*

---

## Table of Contents
- [About the Project](#about-the-project)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [How Dispatch Works](#how-dispatch-works)
- [Payments](#payments)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Deployment](#deployment)
- [Screenshots](#screenshots)
- [Roadmap](#roadmap)
- [Author](#author)

## About the Project

When a vehicle breaks down, help is usually arranged by phone: the user has to describe where they are, nobody automatically picks the nearest driver, and there is no way to see when help will arrive. This project puts booking, dispatch, tracking, payment, and communication into one platform so a stranded user can request help without creating an account, watch the driver arrive on the map, chat with them live, and pay online or in cash.

The system was verified with 14 test cases across 8 testing levels.

## Features

**Users (no account needed)**
- Book breakdown assistance with auto-detected pickup location and an up-front fare estimate
- Service types: Towing, Flat Tyre, Battery Jump-start, Fuel Delivery, Engine Problem, Lockout, Accident Recovery, Ambulance, and Other
- Request help by text, by voice input (English, Hindi, and Kannada), or with one-tap SOS
- Automatic severity triage: accident-type or urgent requests are marked critical and get priority dispatch
- Booking confirmation and status tracking (booking number plus phone number)
- Live driver tracking with route and ETA on the map, and real-time chat with the driver
- Share location on or off, and share a tracking link with family or friends
- Cancel a booking and rate the driver after the job
- Payment: online (Razorpay cards, netbanking, wallets), scan and pay QR/UPI with automatic confirmation, or cash to the driver
- Generated service and payment receipt (PDF) with a dynamic online payment QR
- Interface in English, Hindi, and Kannada
- Installable as a PWA on mobile

**Drivers**
- Separate login and dashboard, with an online/offline switch
- Documents uploaded by the driver and approved by an admin before any jobs are offered
- Accept or reject requests within the offer window (one minute, 30 seconds for critical jobs), after which the request moves on, with an audible alert for new offers
- Current job view with route, completed and cancelled jobs, and earnings
- Live location sharing during a job
- Confirm cash and manual UPI payments collected from customers

**Admins**
- Separate login and dashboard
- Driver management: add, edit, verify or reject, and remove drivers
- Request management (pending and assigned) with live driver positions
- Manual dispatch fallback when no driver accepts an offer
- Analytics dashboard and breakdown hotspot heatmap
- Reports with CSV export of bookings
- Payment management dashboard with Excel (.xlsx) export
- Configurable base price and per-km rate for each service type
- Editable About Us and Contact Us pages

**Security**
- JWT authentication with bcrypt-hashed passwords and role-based route protection (admin, driver)
- Helmet security headers, CORS allow-list, request validation, and NoSQL-injection sanitisation
- Rate limiting on the API, logins, bookings, and tracking lookups
- Razorpay payment signature verification and webhook secret check

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router, Recharts, i18next (EN / HI / KN), PWA (manifest and service worker) |
| Backend | Node.js 18+, Express |
| Database | MongoDB Atlas (Mongoose) |
| Real-time | Socket.IO (live location, chat, and job offers) |
| Maps and routing | Leaflet and React-Leaflet, leaflet.heat, OSRM, Browser Geolocation API, Web Speech API |
| Payments and documents | Razorpay SDK, UPI QR (qrcode), ExcelJS, PDFKit |
| Security | JWT, bcryptjs, Helmet, express-rate-limit, express-validator, express-mongo-sanitize |
| Hosting | Render (see [Deployment](#deployment)) |

**Database collections (9):** admins, bookings, drivers, job offers, messages, pages, payments, pricings, trackings.

## How Dispatch Works

1. The user submits a breakdown request with their location (or taps SOS).
2. The system finds online, verified, available drivers within the search radius (25 km by default) and ranks them by distance. If none are found, the radius is widened.
3. The nearest driver receives the request (a job offer) and a timer starts: 60 seconds, or 30 seconds for critical requests.
4. If the driver rejects or the timer runs out, the next nearest driver is tried.
5. After 5 attempts, or when no driver is left, the admin is alerted and can assign the request manually.
6. After acceptance, the user sees the driver's live location, route, and ETA, and both can chat.

Offer timers are re-armed after a server restart, and every offer state change is a single atomic database update, so a late accept cannot clash with a timeout. If the OSRM routing server is unreachable, the app falls back to a straight line with an approximate ETA.

## Payments

| Method | How it works |
|---|---|
| Card / netbanking / wallet | Razorpay Checkout; the payment signature is verified on the server |
| Scan and pay | Razorpay QR or UPI QR, confirmed automatically through the Razorpay webhook |
| Cash | The customer chooses cash and the driver or an admin confirms it as collected |

Receipts are generated as PDFs and include a QR code that opens the payment page. Admins can see payment status for every booking and export all payments to Excel. A payment gateway health check is available at `GET /api/payments/health`.

## Project Structure

```
Vehicle_Breakdown_Assistance_and_Live_Tracking/
├── backend/
│   ├── config/         # DB connection, CORS, startup environment check
│   ├── controllers/    # Auth, bookings, drivers, admin, analytics, chat, payments, routes, share links
│   ├── middleware/     # JWT auth, rate limits, validation, uploads, error handler
│   ├── models/         # Admin, Booking, Driver, JobOffer, Message, Page, Payment, Pricing, Tracking
│   ├── routes/         # REST API routes
│   ├── services/       # Dispatch, assignment, routing/ETA, notifications, Razorpay, receipts, analytics
│   ├── sockets/        # Socket.IO: dispatch offers, live tracking, chat
│   ├── scripts/        # seed, smoke-test, data migration
│   ├── utils/
│   ├── .env.example
│   └── server.js
├── frontend/
│   ├── public/         # PWA manifest, service worker, icons, alert sound
│   └── src/
│       ├── pages/      # Customer pages, plus admin/ and driver/ dashboards
│       ├── components/ # Tracking map, chat, SOS, voice assistant, job offers, payments, heatmap
│       ├── context/    # Auth, Socket, Toast
│       ├── hooks/
│       ├── i18n.js     # English, Hindi, Kannada
│       └── styles/
├── Project-Output's/
│   ├── Backend_Console_and_Database_Output/    # Server logs and MongoDB collections
│   ├── Frontend_Console_and_GUI_Output/        # App screens (user, driver, admin, payments)
│   └── Deployment_and_Mobile_App_Output/       # Render deployment and PWA install
├── .gitignore
├── .gitattributes
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18 or later
- A MongoDB Atlas cluster (the free tier is enough)
- Git
- Optional: Razorpay test keys, to try online payments

### 1. Clone the repository
```bash
git clone https://github.com/yashwanth181024/Vehicle_Breakdown_Assistance_and_Live_Tracking.git
cd Vehicle_Breakdown_Assistance_and_Live_Tracking
```

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env     # on Windows: copy .env.example .env
```
Edit `backend/.env` (never commit this file). The values you must set are:
```env
PORT=5055
MONGO_URI=<your MongoDB Atlas connection string>
JWT_SECRET=<a long random string, at least 32 characters>
CLIENT_URL=http://localhost:5173
```
See [Environment Variables](#environment-variables) for the rest. Then seed the database and start the server:
```bash
npm run seed -- --online   # admin account, 3 demo drivers, About/Contact pages, fares; --online puts the drivers online
npm run dev
```
The API runs at `http://localhost:5055`. Check it at `/api/health`.

Seeded logins (for local testing only, change them before any real deployment):

| Role | Username | Password |
|---|---|---|
| Admin | `admin` (or `SEED_ADMIN_USERNAME`) | `Admin@123` (or `SEED_ADMIN_PASSWORD`) |
| Driver | `drv001`, `drv002`, `drv003` | `Driver@123` |

### 3. Frontend
```bash
cd ../frontend
npm install
cp .env.example .env
```
`frontend/.env`:
```env
VITE_API_URL=http://localhost:5055/api
VITE_SOCKET_URL=http://localhost:5055
```
```bash
npm run dev
```
The app runs at `http://localhost:5173`. The frontend must stay on port 5173, because the backend only accepts the address in `CLIENT_URL`.

## Environment Variables

**Backend (`backend/.env`)**

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API port | `5055` |
| `CLIENT_URL` | Allowed frontend origin(s), comma-separated | `http://localhost:5173` |
| `MONGO_URI` | MongoDB Atlas connection string | required |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing key and lifetime | required, `7d` |
| `OFFER_TIMEOUT_SECONDS` | Time a driver has to accept an offer | `60` |
| `OFFER_TIMEOUT_CRITICAL_SECONDS` | Offer time for critical/SOS requests | `30` |
| `MAX_DISPATCH_ATTEMPTS` | Drivers to try before alerting the admin | `5` |
| `DISPATCH_RADIUS_KM` | Search radius for nearby drivers | `25` |
| `OSRM_URL` | Routing server for route and ETA | public OSRM server |
| `SHARE_TOKEN_GRACE_HOURS` | How long a share link works after the job ends | `1` |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` | Admin account created by `npm run seed` | `admin`, `Admin@123` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay API keys (use `rzp_test_*` for testing) | optional |
| `RAZORPAY_WEBHOOK_SECRET` | Secret used to verify Razorpay webhooks | optional |
| `FRONTEND_URL` | Public frontend address, used in payment links and receipt QR codes | `http://localhost:5173` |
| `UPI_ID`, `UPI_PAYEE_NAME` | Fallback UPI QR when Razorpay QR is unavailable | optional |

**Frontend (`frontend/.env`)**

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend API address, including `/api` |
| `VITE_SOCKET_URL` | Backend address for Socket.IO, without `/api` |

To try card payments in test mode, use the Razorpay test card `4111 1111 1111 1111` with any future expiry and any 3-digit CVV.

## Testing

The system was verified with 14 test cases across 8 testing levels. A scripted end-to-end check of the running backend is also included:

```bash
cd backend
npm run seed -- --online
npm run dev          # in one terminal
npm run smoke        # in another
```
The smoke test walks one breakdown from booking through offer, reject, accept, tracking, share link, completion, rating, and admin views. It creates a booking named "Smoke Test", which you can delete from the admin page afterwards.

## Deployment

The app is deployed on [Render](https://render.com) (backend and frontend as separate services), with MongoDB Atlas as the database. Set the same environment variables from the steps above in the Render dashboard. In `CLIENT_URL`, use the deployed frontend address, and in `VITE_API_URL` and `VITE_SOCKET_URL`, use the deployed backend address. Allow Render's outbound IPs (or `0.0.0.0/0` for a demo) in the Atlas network access list.

The backend runs behind Render's proxy, so rate limiting sees real client IPs. The frontend also includes a `vercel.json` (single-page-app rewrites and cache headers) if you prefer to host it on Vercel.

Live: https://vehicle-breakdown-assistant-1-sdp9.onrender.com/

## Screenshots

All outputs are in the [`Project-Output's`](https://github.com/yashwanth181024/Vehicle_Breakdown_Assistance_and_Live_Tracking/tree/main/Project-Output's) folder.

### Home page (multilingual)

| English | Hindi | Kannada |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Home_Page_English.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Home_Page_Hindi.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Home_Page_Kannada.jpg" width="260"> |

### User: booking and tracking

| Booking form | Voice input | Pickup and fare estimate |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Booking_Form.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Booking_Screen_with_Voice_Input.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Pickup_Location_and_Fare_Estimate.jpg" width="260"> |

| Booking confirmation and status | Share location ON | Share location OFF |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Booking_Confirmation_and_Status.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Share_Location_On.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Share_Location_Off.jpg" width="260"> |

| Track booking (completed) | Payment unpaid | Payment paid |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Track_Booking_Completed_Status.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Track_Payment_Card_Unpaid.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Track_Payment_Card_Paid.jpg" width="260"> |

### Payments

| Card / netbanking | Scan and pay (QR/UPI) | Payment received |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Payment_Page_Card_Netbanking.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Payment_Page_Scan_QR_UPI.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Payment_Received_Download_Receipt.jpg" width="260"> |

| Razorpay cards | Razorpay wallets | Razorpay success |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Razorpay_Checkout_Cards.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Razorpay_Checkout_Wallet_Options.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Razorpay_Payment_Successful.jpg" width="260"> |

| Service receipt | Service and payment receipt |
|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Generated_Service_Receipt.jpg" width="380"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Generated_Service_and_Payment_Receipt.jpg" width="380"> |

### Driver

| Login | Dashboard | Current job |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Driver_Login.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Driver_Dashboard.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Driver_Current_Job.jpg" width="260"> |

| Completed jobs | Cancelled jobs | Earnings |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Driver_Jobs_Completed.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Driver_Jobs_Cancelled.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Driver_Earnings.jpg" width="260"> |

### Admin

| Login | Dashboard | Analytics |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Administrator_Login.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Administrator_Dashboard.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Analytics.jpg" width="260"> |

| Pending requests | Assigned requests | Driver management |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Admin_Requests_Pending.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Admin_Requests_Assigned.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Admin_Driver_Management.jpg" width="260"> |

| Request payment status | Booking details and payment |
|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Admin_Requests_Payment_Status.jpg" width="380"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Admin_Booking_Details_Payment.jpg" width="380"> |

| Reports | Exported bookings report | Exported payments report |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Reports.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Exported_Bookings_Report.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Exported_Payments_Report.jpg" width="260"> |

### Deployment and mobile (PWA)

| Render backend | Render frontend | Web app landing page |
|---|---|---|
| <img src="Project-Output%27s/Deployment_and_Mobile_App_Output/Render_Deployment_Backend.jpg" width="260"> | <img src="Project-Output%27s/Deployment_and_Mobile_App_Output/Render_Deployment_Frontend.jpg" width="260"> | <img src="Project-Output%27s/Deployment_and_Mobile_App_Output/Web_Application_Landing_Page.jpg" width="260"> |

| PWA install prompt | Install confirmation | Installed app icon |
|---|---|---|
| <img src="Project-Output%27s/Deployment_and_Mobile_App_Output/PWA_Installation_Prompt.jpg" width="260"> | <img src="Project-Output%27s/Deployment_and_Mobile_App_Output/PWA_Installation_Confirmation.jpg" width="260"> | <img src="Project-Output%27s/Deployment_and_Mobile_App_Output/Installed_App_Icon.jpg" width="260"> |

### Backend console and database (MongoDB Atlas)

| Server start-up | Database collections | Bookings collection |
|---|---|---|
| <img src="Project-Output%27s/Backend_Console_and_Database_Output/Server_Start_up.jpg" width="260"> | <img src="Project-Output%27s/Backend_Console_and_Database_Output/Database_Collections.jpg" width="260"> | <img src="Project-Output%27s/Backend_Console_and_Database_Output/Bookings_Collection.jpg" width="260"> |

| Drivers collection | Trackings (initial) | Trackings (completed) |
|---|---|---|
| <img src="Project-Output%27s/Backend_Console_and_Database_Output/Drivers_Collection.jpg" width="260"> | <img src="Project-Output%27s/Backend_Console_and_Database_Output/Trackings_Collection_Initial.jpg" width="260"> | <img src="Project-Output%27s/Backend_Console_and_Database_Output/Trackings_Collection_Completed.jpg" width="260"> |

| Admins collection | Job offers collection | Messages collection |
|---|---|---|
| <img src="Project-Output%27s/Backend_Console_and_Database_Output/Admins_Collection.jpg" width="260"> | <img src="Project-Output%27s/Backend_Console_and_Database_Output/Job_Offers_Collection.jpg" width="260"> | <img src="Project-Output%27s/Backend_Console_and_Database_Output/Messages_Collection.jpg" width="260"> |

| Pages collection | Pricings collection | Fare configs collection |
|---|---|---|
| <img src="Project-Output%27s/Backend_Console_and_Database_Output/Pages_Collection.jpg" width="260"> | <img src="Project-Output%27s/Backend_Console_and_Database_Output/Pricings_Collection.jpg" width="260"> | <img src="Project-Output%27s/Backend_Console_and_Database_Output/Fare_Configs_Collection.jpg" width="260"> |

## Roadmap

- Native mobile apps for customers and drivers
- More accurate ETA using live traffic data
- AI-powered assistance
- Push, SMS, and email alerts (job and status updates currently go out live over Socket.IO only)
- Cloud scaling for higher traffic

## Author

**Yashwanth G S**
MCA, Dr. Ambedkar Institute of Technology, Bengaluru (VTU)
GitHub: [@yashwanth181024](https://github.com/yashwanth181024)

**Project guide:** Anitha J, Assistant Lecturer, Dr. Ambedkar Institute of Technology, Bengaluru

## License

Built for academic purposes.
