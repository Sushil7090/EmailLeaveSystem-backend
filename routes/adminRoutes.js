const express = require('express');
const { authUser, requireAdmin } = require('../middlewares/userAuthMiddleware');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.get('/leave-requests', authUser, requireAdmin, adminController.listLeaveRequests);
router.get('/leave-requests/:id', authUser, requireAdmin, adminController.getLeaveRequest);
router.post('/leave-requests/:id/approve', authUser, requireAdmin, adminController.approveLeaveRequest);
router.post('/leave-requests/:id/reject', authUser, requireAdmin, adminController.rejectLeaveRequest);
router.get('/stats', authUser, requireAdmin, adminController.summaryStats);
router.post('/send-feedback', authUser, requireAdmin, adminController.sendFeedbackToEmployee);

// New calendar data routes
router.get('/calendar/employees-on-leave-today', authUser, requireAdmin, adminController.getEmployeesOnLeaveToday);
router.get('/calendar/upcoming-leaves', authUser, requireAdmin, adminController.getUpcomingLeaves);
router.get('/calendar/data', authUser, requireAdmin, adminController.getCalendarData);

module.exports = router;
