require('dotenv').config();
const checkEnv = require('./config/checkEnv');
checkEnv();

const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const { corsOptions, socketCorsOptions } = require('./config/cors');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { initSockets } = require('./sockets');
const dispatchService = require('./services/dispatch.service');

const app = express();
const server = http.createServer(app);

// ---------- Socket.IO ----------
const io = new Server(server, { cors: socketCorsOptions });
app.set('io', io);
initSockets(io);
dispatchService.init(io);

// ---------- Global middleware ----------
app.set('trust proxy', 1); // needed behind Render's proxy so rate limiting sees the real IP
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Uploaded static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- Routes ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api', apiLimiter);
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
app.use('/api/drivers', require('./routes/driver.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/analytics', require('./routes/analytics.routes'));
app.use('/api/chat', require('./routes/chat.routes'));
app.use('/api/share', require('./routes/share.routes'));
app.use('/api/route', require('./routes/route.routes'));

app.use(notFound);
app.use(errorHandler);

// ---------- Start ----------
const PORT = process.env.PORT || 5055; // 5000 clashes with macOS AirPlay, 5001 with many dev tools

async function start() {
  await connectDB();
  await dispatchService.recoverPendingOffers(); // re-arm timers after a restart
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\nPort ${PORT} is already in use by another program.\n` +
          `Fix: set a different PORT in backend/.env (for example PORT=5099), then update\n` +
          `VITE_API_URL and VITE_SOCKET_URL in frontend/.env to the same port.\n`
      );
      process.exit(1);
    }
    throw err;
  });
  server.listen(PORT, () => console.log(`API + Socket.IO listening on port ${PORT}`));
}

if (require.main === module) start();

module.exports = { app, server, io, start };
