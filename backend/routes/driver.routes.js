const router = require('express').Router();
const c = require('../controllers/driver.controller');
const { protect, ROLES } = require('../middleware/auth');
const v = require('../middleware/validate');
const { uploadDocument } = require('../middleware/upload');

// ----- Driver (self). These MUST stay above "/:id" or Express reads "me" as an ID -----
const driverOnly = protect(ROLES.DRIVER);
router.get('/me/profile', driverOnly, c.myProfile);
router.post('/me/documents', driverOnly, uploadDocument, c.uploadDocument);
router.patch('/me/online', driverOnly, c.setOnline);
router.patch('/me/password', driverOnly, v.changePasswordRules, c.changePassword);
router.post('/me/location', driverOnly, v.locationUpdateRules, c.updateLocation);
router.get('/me/active', driverOnly, c.activeJob);
router.get('/me/jobs', driverOnly, c.myJobs);
router.get('/me/earnings', driverOnly, c.myEarnings);
router.get('/me/offers', driverOnly, c.myOffers);
router.post('/me/offers/:offerId/accept', driverOnly, v.mongoIdParam('offerId'), c.acceptOffer);
router.post('/me/offers/:offerId/reject', driverOnly, v.mongoIdParam('offerId'), c.rejectOffer);

// ----- Admin -----
const adminOnly = protect(ROLES.ADMIN);
router.get('/', adminOnly, c.listDrivers);
router.post('/', adminOnly, v.driverCreateRules, c.createDriver);
router.get('/:id', adminOnly, v.mongoIdParam(), c.getDriver);
router.put('/:id', adminOnly, v.mongoIdParam(), v.driverUpdateRules, c.updateDriver);
router.patch('/:id/verify', adminOnly, v.mongoIdParam(), c.verifyDriver);
router.delete('/:id', adminOnly, v.mongoIdParam(), c.deleteDriver);

module.exports = router;
