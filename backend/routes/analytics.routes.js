const router = require('express').Router();
const c = require('../controllers/analytics.controller');
const { protect, ROLES } = require('../middleware/auth');
const { dateRangeQuery } = require('../middleware/validate');

router.use(protect(ROLES.ADMIN), dateRangeQuery);

router.get('/summary', c.summary);
router.get('/overview', c.overview);
router.get('/heatmap', c.heatmap);
router.get('/drivers', c.drivers);
router.get('/report', c.report);
router.get('/report.csv', c.reportCsv);

module.exports = router;
