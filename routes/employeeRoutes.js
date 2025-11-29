const express = require('express');
const { authUser } = require('../middlewares/userAuthMiddleware');
const { uploadLeaveAttachments } = require('../middlewares/uploadMiddleware');
const employeeController = require('../controllers/employeeController');

const router = express.Router();

router.post('/leave-email', authUser, uploadLeaveAttachments, employeeController.createLeaveRequestEmail);
router.get('/leave-email', authUser, employeeController.listMyLeaveRequestEmails);
router.get('/leave-email/:id', authUser, employeeController.getMyLeaveRequestEmail);
router.post('/leave-email/:id/cancel', authUser, employeeController.cancelMyLeaveRequestEmail);
router.post('/leave-email/:id/resubmit', authUser, uploadLeaveAttachments, employeeController.resubmitLeaveRequestEmail);

module.exports = router;