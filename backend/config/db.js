const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('strictQuery', true);

const PUBLIC_DNS = ['8.8.8.8', '1.1.1.1']; // Google and Cloudflare

function useDnsServers(list) {
  try {
    dns.setServers(list);
    return true;
  } catch (err) {
    console.error(`Could not use DNS servers ${list.join(', ')}: ${err.message}`);
    return false;
  }
}

/** Plain-English hint for the most common Atlas connection failures. */
function explain(err) {
  const msg = String(err && err.message);
  if (err && err.syscall === 'querySrv') {
    return 'Your network blocked the DNS lookup for Atlas even with public DNS. Try another network (a phone hotspot),\n' +
      'turn off any VPN, or in Atlas use the "Legacy URI String" toggle (the mongodb:// one) as MONGO_URI.';
  }
  if (/bad auth|authentication failed/i.test(msg)) {
    return 'Atlas rejected the username or password in MONGO_URI. In Atlas: Database Access > Edit user > Edit Password,\n' +
      'then update MONGO_URI. Passwords with symbols such as @ : / need URL-encoding.';
  }
  if (err && err.name === 'MongooseServerSelectionError') {
    return 'Atlas did not answer. Most often your IP is not allowed: Atlas > Network Access > Add IP Address >\n' +
      'Allow Access From Anywhere, wait a minute, and try again.';
  }
  return null;
}

async function tryConnect(uri) {
  return mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
}

/**
 * Connects to MongoDB Atlas. Exits the process if the connection fails
 * so the host (Render / pm2) can restart it.
 *
 * If the network's DNS refuses the Atlas "mongodb+srv" lookup (error querySrv ECONNREFUSED),
 * it retries once using public DNS. DNS_SERVERS=8.8.8.8,1.1.1.1 in .env forces this from the start.
 */
async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  if (process.env.DNS_SERVERS) {
    useDnsServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));
  }

  let conn;
  try {
    conn = await tryConnect(uri);
  } catch (err) {
    if (err && err.syscall === 'querySrv' && !process.env.DNS_SERVERS) {
      console.warn("Your network's DNS refused the Atlas lookup. Retrying with public DNS (8.8.8.8, 1.1.1.1)...");
      if (useDnsServers(PUBLIC_DNS)) {
        try {
          conn = await tryConnect(uri);
        } catch (retryErr) {
          return fail(retryErr);
        }
      } else {
        return fail(err);
      }
    } else {
      return fail(err);
    }
  }
  console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  return conn;
}

function fail(err) {
  console.error('MongoDB connection error:', err.message);
  const hint = explain(err);
  if (hint) console.error('\n' + hint + '\n');
  process.exit(1);
}

module.exports = connectDB;
