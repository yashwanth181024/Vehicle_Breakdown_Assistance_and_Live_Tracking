const Razorpay = require('razorpay');

const key_id = process.env.RAZORPAY_KEY_ID;
const key_secret = process.env.RAZORPAY_KEY_SECRET;

const missing = [];
if (!key_id) missing.push('RAZORPAY_KEY_ID');
if (!key_secret) missing.push('RAZORPAY_KEY_SECRET');

if (missing.length > 0) {
  console.error(`Razorpay configuration error: Missing environment variable(s): ${missing.join(', ')}`);
}

let razorpay = null;

if (key_id && key_secret) {
  razorpay = new Razorpay({ key_id, key_secret });
} else {
  const missingError = async () => {
    throw new Error(`Razorpay is not configured. Missing environment variable(s): ${missing.join(', ')}`);
  };
  razorpay = {
    orders: {
      create: missingError,
      fetch: missingError,
      fetchPayments: missingError,
    },
    payments: {
      fetch: missingError,
    },
  };
}

module.exports = razorpay;
