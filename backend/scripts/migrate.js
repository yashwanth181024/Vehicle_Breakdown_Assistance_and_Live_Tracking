require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('../config/db')().then(async () => {
  const Driver = require('../models/Driver');
  await Driver.updateMany({}, { $set: { verificationStatus: 'verified' } });
  console.log('Updated drivers');
  process.exit(0);
});
