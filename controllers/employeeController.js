const crypto = require('crypto');
const emailModel = require('../models/emailModel');

const REQUIRED_SUBJECT = 'Leave Request Application';
const ALLOWED_LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Paid Leave", "Other"];

// ------------------ CREATE LEAVE REQUEST ------------------
module.exports.createLeaveRequestEmail = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        const { subject, leaveReason, leaveType, startDate, endDate } = req.body;

        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        // REQUIRED FIELDS CHECK
        if (!subject || !leaveReason || !leaveType || !startDate || !endDate) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // STRICT SUBJECT CHECK
        if (subject !== REQUIRED_SUBJECT) {
            return res.status(400).json({
                message: `Subject must be exactly '${REQUIRED_SUBJECT}'`
            });
        }

        // LEAVE TYPE VALIDATION
        if (!ALLOWED_LEAVE_TYPES.includes(leaveType)) {
            return res.status(400).json({
                message: `leaveType must be one of: ${ALLOWED_LEAVE_TYPES.join(', ')}`
            });
        }

        // DATE VALIDATION
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start) || isNaN(end) || end < start) {
            return res.status(400).json({ message: 'Invalid date range' });
        }

        // UNIQUE RAW EMAIL ID
        const rawEmailId =
            `form-${String(employeeId)}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

        // EMPLOYEE NAME BUILD
        const employeeName =
            `${req.user.fullname.firstname} ${req.user.fullname.middlename} ${req.user.fullname.lastname}`
                .replace(/\s+/g, ' ')
                .trim();

        // ATTACHMENTS
        const attachments = Array.isArray(req.files)
            ? req.files.map(f => ({
                filename: f.originalname,
                mimetype: f.mimetype,
                size: f.size,
                path: `/uploads/${f.filename}`,
                uploadedAt: new Date()
            }))
            : [];

        // CREATE DB RECORD
        const record = new emailModel({
            employeeId, // MATCHING MODEL FIELD
            employeeName,
            employeeEmail: req.user.email,
            subject,
            leaveReason,
            leaveType,
            startDate: start,
            endDate: end,
            rawEmailId,
            attachments,
            receivedAt: new Date(),
            updatedAt: new Date()
        });

        await record.save();

        return res.status(201).json({
            message: 'Leave request submitted successfully',
            email: record
        });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};


// ------------------ LIST MY LEAVE REQUESTS ------------------
module.exports.listMyLeaveRequestEmails = async function (req, res) {
    try {
        const employeeId = req.user?._id;

        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        const items = await emailModel.find({ employeeId }).sort({ receivedAt: -1 });

        return res.status(200).json({ emails: items });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};


// ------------------ GET SINGLE REQUEST ------------------
module.exports.getMyLeaveRequestEmail = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        const { id } = req.params;

        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        const item = await emailModel.findById(id);
        if (!item) return res.status(404).json({ message: 'Record not found' });

        if (String(item.employeeId) !== String(employeeId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        return res.status(200).json({ email: item });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};


// ------------------ CANCEL REQUEST ------------------
module.exports.cancelMyLeaveRequestEmail = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        const { id } = req.params;

        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        const item = await emailModel.findById(id);
        if (!item) return res.status(404).json({ message: 'Record not found' });

        if (String(item.employeeId) !== String(employeeId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        if (item.status !== 'Pending') {
            return res.status(400).json({ message: 'Only pending records can be cancelled' });
        }

        item.status = 'Rejected';
        item.adminRemarks = 'Cancelled by employee';
        item.reviewedAt = new Date();
        item.updatedAt = new Date();

        await item.save();

        return res.status(200).json({
            message: 'Leave request cancelled',
            email: item
        });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};
