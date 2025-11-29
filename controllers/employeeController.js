const emailModel = require('../models/emailModel');

// Constants
const REQUIRED_SUBJECT = 'Leave Request Application';
const ALLOWED_LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Paid Leave", "Unpaid Leave"];

// --------------------- Employee Controllers ---------------------

// Create new leave request
module.exports.createLeaveRequestEmail = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        const { subject, message, leaveType, fromDate, toDate, originalRequestId } = req.body;

        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });
        if (!subject || !message || !leaveType || !fromDate || !toDate) return res.status(400).json({ message: 'All fields are required' });
        if (subject !== REQUIRED_SUBJECT) return res.status(400).json({ message: `Subject must be exactly '${REQUIRED_SUBJECT}'` });
        if (!ALLOWED_LEAVE_TYPES.includes(leaveType)) return res.status(400).json({ message: `leaveType must be one of: ${ALLOWED_LEAVE_TYPES.join(', ')}` });

        const start = new Date(fromDate);
        const end = new Date(toDate);
        if (isNaN(start) || isNaN(end) || end < start) return res.status(400).json({ message: 'Invalid date range' });

        let submissionCount = 1;
        let originalId = null;

        // Resubmission logic
        if (originalRequestId) {
            const originalRequest = await emailModel.findById(originalRequestId);
            if (!originalRequest) return res.status(404).json({ message: 'Original request not found' });
            if (String(originalRequest.employeeId) !== String(employeeId)) return res.status(403).json({ message: 'Forbidden' });
            if (originalRequest.status !== 'Rejected') return res.status(400).json({ message: 'Can only resubmit rejected requests' });

            submissionCount = originalRequest.submissionCount + 1;
            if (submissionCount > 3) return res.status(400).json({ message: 'Maximum submission limit (3) reached' });
            originalId = originalRequest.originalRequestId || originalRequest._id;
        }

        const record = new emailModel({
            employeeId,
            subject,
            message,
            leaveType,
            fromDate: start,
            toDate: end,
            submissionCount,
            originalRequestId: originalId
        });

        await record.save();
        return res.status(201).json({ message: 'Leave request submitted', email: record });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// List all leave requests of the logged-in employee
module.exports.listMyLeaveRequestEmails = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        const items = await emailModel.find({ employeeId }).sort({ createdAt: -1 });
        return res.status(200).json({ emails: items });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// Get a single leave request of the logged-in employee
module.exports.getMyLeaveRequestEmail = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        const { id } = req.params;
        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        const item = await emailModel.findById(id);
        if (!item) return res.status(404).json({ message: 'Record not found' });
        if (String(item.employeeId) !== String(employeeId)) return res.status(403).json({ message: 'Forbidden' });

        return res.status(200).json({ email: item });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// Cancel a pending leave request
module.exports.cancelMyLeaveRequestEmail = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        const { id } = req.params;
        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        const item = await emailModel.findById(id);
        if (!item) return res.status(404).json({ message: 'Record not found' });
        if (String(item.employeeId) !== String(employeeId)) return res.status(403).json({ message: 'Forbidden' });
        if (item.status !== 'Pending') return res.status(400).json({ message: 'Only pending records can be cancelled' });

        item.status = 'Rejected';
        item.rejectionReason = 'Cancelled by employee';
        await item.save();

        return res.status(200).json({ message: 'Leave request cancelled', email: item });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};