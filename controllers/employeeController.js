const crypto = require('crypto');
const emailModel = require('../models/emailModel');

const REQUIRED_SUBJECT = 'Leave Request Application';
const ALLOWED_LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Paid Leave", "Other"];

module.exports.createLeaveRequestEmail = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        const { subject, leaveReason, leaveType, startDate, endDate } = req.body;

        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        if (!subject || !leaveReason || !leaveType || !startDate || !endDate) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (subject !== REQUIRED_SUBJECT) {
            return res.status(400).json({ message: `Subject must be exactly '${REQUIRED_SUBJECT}'` });
        }

        if (!ALLOWED_LEAVE_TYPES.includes(leaveType)) {
            return res.status(400).json({ message: `leaveType must be one of: ${ALLOWED_LEAVE_TYPES.join(', ')}` });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start) || isNaN(end) || end < start) {
            return res.status(400).json({ message: 'Invalid date range' });
        }

        // Generate a synthetic rawEmailId to satisfy schema uniqueness
        const rawEmailId = `form-${String(employeeId)}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

        const employeeName = `${req.user.fullname.firstname} ${req.user.fullname.middlename} ${req.user.fullname.lastname}`.replace(/\s+/g, ' ').trim();
        // Map uploaded files (if any) to attachments array
        const attachments = Array.isArray(req.files)
            ? req.files.map(f => ({
                filename: f.originalname,
                mimetype: f.mimetype,
                size: f.size,
                path: `/uploads/${f.filename}`
            }))
            : [];

        const record = new emailModel({
            employee: employeeId,
            employeeName,
            employeeEmail: req.user.email,
            subject,
            leaveReason,
            leaveType,
            startDate: start,
            endDate: end,
            rawEmailId,
            attachments
        });

        await record.save();
        return res.status(201).json({ message: 'Leave request submitted', email: record });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.listMyLeaveRequestEmails = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });
        const items = await emailModel.find({ employee: employeeId }).sort({ receivedAt: -1 });
        return res.status(200).json({ emails: items });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.getMyLeaveRequestEmail = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        const { id } = req.params;
        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });
        const item = await emailModel.findById(id);
        if (!item) return res.status(404).json({ message: 'Record not found' });
        if (String(item.employee) !== String(employeeId)) return res.status(403).json({ message: 'Forbidden' });
        return res.status(200).json({ email: item });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.cancelMyLeaveRequestEmail = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        const { id } = req.params;
        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });
        const item = await emailModel.findById(id);
        if (!item) return res.status(404).json({ message: 'Record not found' });
        if (String(item.employee) !== String(employeeId)) return res.status(403).json({ message: 'Forbidden' });
        if (item.status !== 'Pending') return res.status(400).json({ message: 'Only pending records can be cancelled' });
        // emailModel does not have 'Cancelled' status; mark as Rejected with remark
        item.status = 'Rejected';
        item.adminRemarks = 'Cancelled by employee';
        item.reviewedAt = new Date();
        await item.save();
        return res.status(200).json({ message: 'Leave request cancelled', email: item });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};
