const express = require('express');
const { authUser, requireAdmin } = require('../middlewares/userAuthMiddleware');
const { uploadCSV } = require('../middlewares/CsvuploadMiddleware');
const holidayController = require('../controllers/holidayController');

const router = express.Router();

// 📤 CSV Upload (Admin only)
router.post('/upload-csv', authUser, requireAdmin, uploadCSV, holidayController.uploadHolidayCSV);

// ➕ Create Single Holiday (Admin only)
router.post('/', authUser, requireAdmin, holidayController.createHoliday);

// 📋 Get All Holidays (All authenticated users)
router.get('/', authUser, holidayController.getAllHolidays);

// 📊 Get Holiday Statistics (All authenticated users)
router.get('/stats', authUser, holidayController.getHolidayStats);

// 📅 Get Holiday by ID (All authenticated users)
router.get('/:id', authUser, holidayController.getHolidayById);

// ✏️ Update Holiday (Admin only)
router.put('/:id', authUser, requireAdmin, holidayController.updateHoliday);

// 🗑️ Delete Holiday (Admin only)
router.delete('/:id', authUser, requireAdmin, holidayController.deleteHoliday);

// 🗑️ Delete All Holidays for a Year (Admin only)
router.delete('/year/:year', authUser, requireAdmin, holidayController.deleteHolidaysByYear);

// 🔔 Manual Reminder Trigger (Admin only - for testing)
router.post('/trigger-reminder', authUser, requireAdmin, async (req, res) => {
    try {
        const { triggerManualHolidayReminder } = require('../services/holidayReminderService');
        await triggerManualHolidayReminder();
        res.json({ message: 'Holiday reminders sent successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;