/**
 * CORS configuration shared by Express and Socket.IO.
 * CLIENT_URL may hold several comma-separated origins.
 */
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

function originAllowed(origin) {
  // Requests without an Origin header (curl, mobile apps, server-to-server) are allowed
  if (!origin) return true;
  return allowedOrigins.includes(origin.replace(/\/$/, ''));
}

const corsOptions = {
  origin(origin, callback) {
    if (originAllowed(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const socketCorsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST'],
};

module.exports = { corsOptions, socketCorsOptions, allowedOrigins, originAllowed };
