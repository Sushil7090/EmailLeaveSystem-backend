const crypto = require('crypto');
const emailModel = require('../models/emailModel');
const User = require('../models/userModel');

const REQUIRED_SUBJECT = 'Leave Request Application';
const ALLOWED_LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Emergency Leave"];
const MONTHLY_QUOTA_LIMIT = 1.5;  // ✅ UPDATED: 1 Full + 1 Half = 1.5 days

// ⭐⭐⭐ HELPER FUNCTION: Check Monthly Quota (UPDATED) ⭐⭐⭐
async function checkMonthlyQuota(employeeId) {
    const currentMonth = new Date().toISOString().slice(0, 7); // "2026-01"
    
    const user = await User.findById(employeeId);
    if (!user) throw new Error('User not found');

    // Reset if new month
    if (user.currentMonth !== currentMonth) {
        const unusedQuota = MONTHLY_QUOTA_LIMIT - user.monthlyQuotaUsed;  // ✅ UPDATED: 1.5
        user.carryForwardDays = unusedQuota > 0 ? unusedQuota : 0;
        user.monthlyQuotaUsed = 0;
        user.currentMonth = currentMonth;
        user.lastMonthlyReset = new Date();
        await user.save();
    }

    const totalAvailable = MONTHLY_QUOTA_LIMIT + user.carryForwardDays;  // ✅ UPDATED: 1.5 + carry
    const remaining = totalAvailable - user.monthlyQuotaUsed;

    return {
        used: user.monthlyQuotaUsed,
        available: totalAvailable,
        remaining: remaining,
        canApply: remaining > 0
    };
}

// ------------------ CREATE LEAVE REQUEST ------------------
module.exports.createLeaveRequestEmail = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        const { subject, leaveReason, leaveType, startDate, endDate, leaveDuration, halfDayType } = req.body;

        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        if (!subject || !leaveReason || !leaveType || !startDate || !endDate) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (subject !== REQUIRED_SUBJECT) {
            return res.status(400).json({
                message: `Subject must be exactly '${REQUIRED_SUBJECT}'`
            });
        }

        if (!ALLOWED_LEAVE_TYPES.includes(leaveType)) {
            return res.status(400).json({
                message: `leaveType must be one of: ${ALLOWED_LEAVE_TYPES.join(', ')}`
            });
        }

        if (!leaveDuration || !["Full Day", "Half Day"].includes(leaveDuration)) {
            return res.status(400).json({ message: 'leaveDuration must be "Full Day" or "Half Day"' });
        }

        if (leaveDuration === "Half Day" && (!halfDayType || !["First Half", "Second Half"].includes(halfDayType))) {
            return res.status(400).json({ message: 'halfDayType is required for Half Day and must be "First Half" or "Second Half"' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start) || isNaN(end) || end < start) {
            return res.status(400).json({ message: 'Invalid date range' });
        }

        // ⭐⭐⭐ CHECK MONTHLY QUOTA (1.5 days) ⭐⭐⭐
        const quota = await checkMonthlyQuota(employeeId);
        const requestedDays = leaveDuration === "Full Day" ? 1 : 0.5;

        if (quota.remaining < requestedDays) {
            return res.status(400).json({ 
                message: `Monthly limit exceeded! You have ${quota.remaining} day(s) remaining this month. Maximum 1.5 days per month (1 Full + 1 Half).`,  // ✅ UPDATED
                quotaInfo: {
                    used: quota.used,
                    available: quota.available,
                    remaining: quota.remaining
                }
            });
        }

        const rawEmailId =
            `form-${String(employeeId)}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

        const employeeName =
            `${req.user.fullname.firstname} ${req.user.fullname.middlename} ${req.user.fullname.lastname}`
                .replace(/\s+/g, ' ')
                .trim();

        const attachments = Array.isArray(req.files)
            ? req.files.map(f => ({
                filename: f.originalname,
                mimetype: f.mimetype,
                size: f.size,
                path: `/uploads/${f.filename}`,
                uploadedAt: new Date()
            }))
            : [];

        const record = new emailModel({
            employeeId,
            employeeName,
            employeeEmail: req.user.email,
            subject,
            leaveReason,
            leaveType,
            leaveDuration,
            halfDayType: leaveDuration === "Half Day" ? halfDayType : "",
            startDate: start,
            endDate: end,
            rawEmailId,
            attachments,
            leaveDays: requestedDays, // ⭐ NEW
            receivedAt: new Date(),
            updatedAt: new Date()
        });

        await record.save();

        return res.status(201).json({
            message: 'Leave request submitted successfully',
            email: record,
            quotaInfo: quota
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

        const items = await emailModel
            .find({ employeeId })
            .populate("reviewedBy", "fullname email role")
            .populate('rejectionHistory.rejectedBy', 'fullname email')
            .sort({ receivedAt: -1 });

        // ⭐⭐⭐ GET BALANCE INFO ⭐⭐⭐
        const user = await User.findById(employeeId);
        const quota = await checkMonthlyQuota(employeeId);

        return res.status(200).json({ 
            emails: items,
            balanceInfo: {
                clBalance: user.clBalance,
                slBalance: user.slBalance,
                totalPaidLeaves: user.clBalance + user.slBalance,
                monthlyQuota: {
                    used: quota.used,
                    available: quota.available,
                    remaining: quota.remaining
                }
            }
        });

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

        const item = await emailModel
            .findById(id)
            .populate("reviewedBy", "fullname email role")
            .populate('rejectionHistory.rejectedBy', 'fullname email');

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

// ------------------ RESUBMIT REJECTED REQUEST ------------------
module.exports.resubmitLeaveRequestEmail = async function (req, res) {
    try {
        const employeeId = req.user?._id;
        const { id } = req.params;
        const { subject, leaveReason, leaveType, startDate, endDate, leaveDuration, halfDayType } = req.body;

        if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });

        const item = await emailModel.findById(id);
        if (!item) return res.status(404).json({ message: 'Request not found' });

        if (String(item.employeeId) !== String(employeeId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        if (item.status !== 'Rejected') {
            return res.status(400).json({ message: 'Only rejected requests can be resubmitted' });
        }

        if (item.submissionCount >= 3) {
            return res.status(400).json({ message: 'Maximum resubmission limit (3) reached. Please contact HR.' });
        }

        if (!subject || !leaveReason || !leaveType || !startDate || !endDate) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (subject !== REQUIRED_SUBJECT) {
            return res.status(400).json({ message: `Subject must be exactly '${REQUIRED_SUBJECT}'` });
        }

        if (!ALLOWED_LEAVE_TYPES.includes(leaveType)) {
            return res.status(400).json({ message: `leaveType must be one of: ${ALLOWED_LEAVE_TYPES.join(', ')}` });
        }

        if (!leaveDuration || !["Full Day", "Half Day"].includes(leaveDuration)) {
            return res.status(400).json({ message: 'leaveDuration must be "Full Day" or "Half Day"' });
        }

        if (leaveDuration === "Half Day" && (!halfDayType || !["First Half", "Second Half"].includes(halfDayType))) {
            return res.status(400).json({ message: 'halfDayType required for Half Day' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start) || isNaN(end) || end < start) {
            return res.status(400).json({ message: 'Invalid date range' });
        }

        // ⭐⭐⭐ CHECK MONTHLY QUOTA ⭐⭐⭐
        const quota = await checkMonthlyQuota(employeeId);
        const requestedDays = leaveDuration === "Full Day" ? 1 : 0.5;

        if (quota.remaining < requestedDays) {
            return res.status(400).json({ 
                message: `Monthly limit exceeded! You have ${quota.remaining} day(s) remaining. Maximum 1.5 days per month (1 Full + 1 Half).`,  // ✅ UPDATED
                quotaInfo: quota
            });
        }

        // Update record
        item.subject = subject;
        item.leaveReason = leaveReason;
        item.leaveType = leaveType;
        item.leaveDuration = leaveDuration;
        item.halfDayType = leaveDuration === "Half Day" ? halfDayType : "";
        item.startDate = start;
        item.endDate = end;
        item.leaveDays = requestedDays;

        item.status = 'Pending';
        item.submissionCount += 1;

        item.adminRemarks = '';
        item.reviewedBy = null;
        item.reviewedAt = null;
        item.rejectionReason = '';

        item.updatedAt = new Date();

        if (Array.isArray(req.files) && req.files.length > 0) {
            item.attachments = req.files.map(file => ({
                filename: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                path: `/uploads/${file.filename}`,
                uploadedAt: new Date()
            }));
        }

        await item.save();

        return res.status(200).json({
            message: 'Leave request resubmitted successfully',
            attemptsLeft: 3 - item.submissionCount,
            email: item
        });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};