# Vehicle Breakdown Assistance and Live Tracking

An AI-assisted web platform that connects stranded drivers with nearby roadside-assistance drivers, with live tracking on a map, real-time chat, multi-channel booking notifications, and an admin analytics dashboard.

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
- Register, log in, and book breakdown assistance
- Auto-detect current location and show it on a map
- Live driver tracking with route and ETA
- Real-time chat with the assigned driver
- Share a tracking link with family or friends
- Voice assistant for booking (speech-to-text and text-to-speech)
- Photo-based AI diagnosis of the vehicle problem
- Booking confirmations by email, SMS, and WhatsApp

**Drivers**
- Set availability and receive nearby requests
- Accept or reject requests, with a timeout that passes the request to the next driver
- Update job status and chat with the customer

**Admins**
- Manage users, drivers, and bookings
- Analytics dashboard with a breakdown hotspot heatmap

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite |
| Backend | Node.js, Express |
| Database | MongoDB Atlas |
| Real-time | Socket.IO (live location and chat) |
| Maps and location | Browser Geolocation API, maps API |
| Notifications | Email, SMS, and WhatsApp provider APIs |
| AI | AI API for photo-based diagnosis |
| Hosting | Render |

## How Dispatch Works

1. The user submits a breakdown request with their location.
2. The system finds available drivers and ranks them by distance.
3. The nearest driver receives the request and a timer starts.
4. If the driver rejects or the timer runs out, the next nearest driver is tried.
5. After acceptance, the user sees the driver's live location, route, and ETA, and both can chat.

## Project Structure

```
Vehicle_Breakdown_Assistance_and_Live_Tracking/
├── backend/           # Express API, Socket.IO server, MongoDB models
├── frontend/          # React (Vite) client
├── Project-Output's/  # Screenshots and outputs of the running system
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

The app is deployed on [Render](https://render.com), with MongoDB Atlas as the database. Set the same environment variables from the steps above in the Render dashboard, and allow Render's outbound IPs (or `0.0.0.0/0` for a demo) in the Atlas network access list.

Live: https://vehicle-breakdown-assistant-1-sdp9.onrender.com/

## Screenshots

Outputs of the running system are in the [`Project-Output's`](https://github.com/yashwanth181024/Vehicle_Breakdown_Assistance_and_Live_Tracking/tree/main/Project-Output's) folder. Add your best images here, for example:

| Booking | Live tracking | Admin dashboard |
|---|---|---|
| ![Booking](Project-Output's/booking.png) | ![Tracking](Project-Output's/tracking.png) | ![Dashboard](Project-Output's/dashboard.png) |

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
