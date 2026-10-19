# Vehicle Breakdown Assistance and Live Tracking

An AI-assisted web platform that connects stranded drivers with nearby roadside-assistance drivers, with live tracking on a map, real-time chat, multi-channel booking notifications, a multilingual interface, and an admin analytics dashboard. It can also be installed on a phone as a Progressive Web App (PWA).

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-0B4F9E?style=for-the-badge)](https://vehicle-breakdown-assistant-1-sdp9.onrender.com/)
[![GitHub](https://img.shields.io/badge/Source-GitHub-181717?style=for-the-badge&logo=github)](https://github.com/yashwanth181024/Vehicle_Breakdown_Assistance_and_Live_Tracking)

**Live demo:** https://vehicle-breakdown-assistant-1-sdp9.onrender.com/

> The demo runs on a free Render instance, so the first load can take up to a minute while the server wakes up.

*MCA III Semester Project, 2026-27 | Dr. Ambedkar Institute of Technology, Bengaluru | Visvesvaraya Technological University (VTU)*

---

## Table of Contents
- [About the Project](#about-the-project)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [How Dispatch Works](#how-dispatch-works)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Deployment](#deployment)
- [Screenshots](#screenshots)
- [Roadmap](#roadmap)
- [Author](#author)

## About the Project

When a vehicle breaks down, help is usually arranged by phone: the user has to describe where they are, nobody automatically picks the nearest driver, and there is no way to see when help will arrive. This project puts booking, dispatch, tracking, and communication into one platform so a stranded user can request help, watch the driver arrive on the map, and chat with them live.

## Features

**Users**
- Book breakdown assistance with auto-detected pickup location and a fare estimate
- Voice input on the booking screen (speech-to-text and text-to-speech)
- Booking confirmation and status tracking, with email, SMS, and WhatsApp notifications
- Live driver tracking with route and ETA, and real-time chat with the driver
- Share location on or off, and share a tracking link
- Photo-based AI diagnosis of the vehicle problem
- Generated service receipt after a job
- Interface in English, Hindi, and Kannada
- Installable as a PWA on mobile

**Drivers**
- Separate login and dashboard
- Accept or reject requests, with a timeout that passes the request to the next driver
- Current job view, completed and cancelled jobs, and earnings

**Admins**
- Separate login and dashboard
- Driver management and request management (pending and assigned)
- Analytics dashboard with a breakdown hotspot heatmap
- Reports with exported bookings report
- Configurable fares and pricing

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, PWA |
| Backend | Node.js, Express |
| Database | MongoDB Atlas |
| Real-time | Socket.IO (live location and chat) |
| Maps and location | Browser Geolocation API, maps API |
| Notifications | Email, SMS, and WhatsApp provider APIs |
| AI | AI API for photo-based diagnosis |
| Hosting | Render |

**Database collections:** admins, bookings, drivers, fare configs, job offers, messages, pages, pricings, trackings.

## How Dispatch Works

1. The user submits a breakdown request with their location.
2. The system finds available drivers and ranks them by distance.
3. The nearest driver receives the request (a job offer) and a timer starts.
4. If the driver rejects or the timer runs out, the next nearest driver is tried.
5. After acceptance, the user sees the driver's live location, route, and ETA, and both can chat.

## Project Structure

```
Vehicle_Breakdown_Assistance_and_Live_Tracking/
├── backend/           # Express API, Socket.IO server, MongoDB models
├── frontend/          # React (Vite) client
├── Project-Output's/
│   ├── Backend_Console_and_Database_Output/    # Server logs and MongoDB collections
│   ├── Frontend_Console_and_GUI_Output/        # App screens (user, driver, admin)
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

### 1. Clone the repository
```bash
git clone https://github.com/yashwanth181024/Vehicle_Breakdown_Assistance_and_Live_Tracking.git
cd Vehicle_Breakdown_Assistance_and_Live_Tracking
```

### 2. Backend
```bash
cd backend
npm install
```
Create `backend/.env` (never commit this file):
```env
PORT=5055
MONGODB_URI=<your MongoDB Atlas connection string>
JWT_SECRET=<a long random string>
CLIENT_URL=http://localhost:5173

# Add keys for the services you use
EMAIL_USER=<email address>
EMAIL_PASS=<app password>
SMS_API_KEY=<sms provider key>
WHATSAPP_API_KEY=<whatsapp provider key>
AI_API_KEY=<ai provider key>
```
```bash
npm run dev
```
The API runs at `http://localhost:5055`.

### 3. Frontend
```bash
cd ../frontend
npm install
```
Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:5055
```
```bash
npm run dev
```
The app runs at `http://localhost:5173`.

## Deployment

The app is deployed on [Render](https://render.com) (backend and frontend as separate services), with MongoDB Atlas as the database. Set the same environment variables from the steps above in the Render dashboard, and allow Render's outbound IPs (or `0.0.0.0/0` for a demo) in the Atlas network access list.

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

| Booking confirmation and status | Share location ON | Service receipt |
|---|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Booking_Confirmation_and_Status.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Share_Location_On.jpg" width="260"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Generated_Service_Receipt.jpg" width="260"> |

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

| Reports | Exported bookings report |
|---|---|
| <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Reports.jpg" width="380"> | <img src="Project-Output%27s/Frontend_Console_and_GUI_Output/Exported_Bookings_Report.jpg" width="380"> |

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

## Roadmap

- Mobile apps
- Online payments
- Route-based ETA with live traffic data
- Predictive driver positioning using hotspot data

## Author

**Yashwanth G S**
MCA, Dr. Ambedkar Institute of Technology, Bengaluru (VTU)
GitHub: [@yashwanth181024](https://github.com/yashwanth181024)

**Project guide:** _add your guide's name here_

## License

Built for academic purposes.
