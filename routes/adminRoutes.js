const express = require('express');
const { authUser, requireAdmin } = require('../middlewares/userAuthMiddleware');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Leave request routes
router.get('/leave-requests', authUser, requireAdmin, adminController.listLeaveRequests);
router.get('/leave-requests/:id', authUser, requireAdmin, adminController.getLeaveRequest);
router.post('/leave-requests/:id/approve', authUser, requireAdmin, adminController.approveLeaveRequest);
router.post('/leave-requests/:id/reject', authUser, requireAdmin, adminController.rejectLeaveRequest);

// Stats & Feedback
router.get('/stats', authUser, requireAdmin, adminController.summaryStats);
router.post('/send-feedback', authUser, requireAdmin, adminController.sendFeedbackToEmployee);

// Calendar data routes
router.get('/calendar/employees-on-leave-today', authUser, requireAdmin, adminController.getEmployeesOnLeaveToday);
router.get('/calendar/upcoming-leaves', authUser, requireAdmin, adminController.getUpcomingLeaves);
router.get('/calendar/data', authUser, requireAdmin, adminController.getCalendarData);

// ⭐⭐⭐ NEW: Calendar Edit Routes ⭐⭐⭐
router.put('/calendar/leave/:id', authUser, requireAdmin, adminController.editLeaveFromCalendar);
router.delete('/calendar/leave/:id', authUser, requireAdmin, adminController.deleteLeaveFromCalendar);

// ⭐⭐⭐ NEW: Manual Reminder Trigger (for testing) ⭐⭐⭐
router.post('/trigger-leave-reminders', authUser, requireAdmin, async (req, res) => {
    try {
        const { triggerManualReminder } = require('../services/leaveReminderService');
        await triggerManualReminder();
        res.json({ message: 'Leave reminders sent successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;