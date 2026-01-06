const crypto = require('crypto');
const emailModel = require('../models/emailModel');
const User = require('../models/userModel');

const REQUIRED_SUBJECT = 'Leave Request Application';
const ALLOWED_LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Emergency Leave"];

// ⭐⭐⭐ HELPER FUNCTION: Check Monthly Quota (UPDATED) ⭐⭐⭐
async function checkMonthlyQuota(employeeId) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const user = await User.findById(employeeId);
    if (!user) throw new Error('User not found');

    // Reset if new month
    if (user.currentMonth !== currentMonth) {
        const unusedFull = 1 - user.currentMonthPaidFull;
        const unusedHalf = 1 - user.currentMonthPaidHalf;
        
        user.previousMonthBalanceFull = unusedFull > 0 ? unusedFull : 0;
        user.previousMonthBalanceHalf = unusedHalf > 0 ? unusedHalf : 0;
        
        user.currentMonthPaidFull = 0;
        user.currentMonthPaidHalf = 0;
        user.currentMonthUnpaidLeaves = 0;
        user.currentMonth = currentMonth;
        user.lastMonthlyReset = new Date();
        await user.save();
    }

    // Calculate available paid leaves
    const currentMonthFullRemaining = 1 - user.currentMonthPaidFull;
    const currentMonthHalfRemaining = 1 - user.currentMonthPaidHalf;
    const previousMonthFullAvailable = user.previousMonthBalanceFull;
    const previousMonthHalfAvailable = user.previousMonthBalanceHalf;

    const totalPaidFullAvailable = currentMonthFullRemaining + previousMonthFullAvailable;
    const totalPaidHalfAvailable = currentMonthHalfRemaining + previousMonthHalfAvailable;

    return {
        currentMonth: {
            paidFullUsed: user.currentMonthPaidFull,
            paidHalfUsed: user.currentMonthPaidHalf,
            paidFullRemaining: currentMonthFullRemaining,
            paidHalfRemaining: currentMonthHalfRemaining,
            unpaidLeaves: user.currentMonthUnpaidLeaves
        },
        previousMonth: {
            balanceFull: previousMonthFullAvailable,
            balanceHalf: previousMonthHalfAvailable
        },
        totalAvailable: {
            paidFull: totalPaidFullAvailable,
            paidHalf: totalPaidHalfAvailable
        },
        canApplyPaidFull: totalPaidFullAvailable > 0,
        canApplyPaidHalf: totalPaidHalfAvailable > 0
    };
}

// ------------------ CREATE LEAVE REQUEST (UPDATED) ------------------
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

        // ⭐⭐⭐ CHECK QUOTA ⭐⭐⭐
        const quota = await checkMonthlyQuota(employeeId);
        const isFullDay = leaveDuration === "Full Day";
        const requestedDays = isFullDay ? 1 : 0.5;

        // ✅ INFORMATIONAL MESSAGE (Not blocking)
        let quotaWarning = null;
        if (isFullDay && quota.totalAvailable.paidFull === 0) {
            quotaWarning = "⚠️ No paid full-day leaves available. This will be marked as unpaid if approved.";
        } else if (!isFullDay && quota.totalAvailable.paidHalf === 0) {
            quotaWarning = "⚠️ No paid half-day leaves available. This will be marked as unpaid if approved.";
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
            leaveDays: requestedDays,
            receivedAt: new Date(),
            updatedAt: new Date()
        });

        await record.save();

        return res.status(201).json({
            message: 'Leave request submitted successfully',
            email: record,
            quotaInfo: quota,
            warning: quotaWarning
        });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// ------------------ LIST MY LEAVE REQUESTS (UPDATED) ------------------
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
                currentMonth: quota.currentMonth,
                previousMonth: quota.previousMonth,
                totalAvailable: quota.totalAvailable,
                totalUnpaid: user.totalUnpaidLeaves
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

// ------------------ RESUBMIT REJECTED REQUEST (UPDATED) ------------------
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

        // ⭐⭐⭐ CHECK QUOTA ⭐⭐⭐
        const quota = await checkMonthlyQuota(employeeId);
        const isFullDay = leaveDuration === "Full Day";
        const requestedDays = isFullDay ? 1 : 0.5;

        // ✅ INFORMATIONAL MESSAGE (Not blocking)
        let quotaWarning = null;
        if (isFullDay && quota.totalAvailable.paidFull === 0) {
            quotaWarning = "⚠️ No paid full-day leaves available. This will be marked as unpaid if approved.";
        } else if (!isFullDay && quota.totalAvailable.paidHalf === 0) {
            quotaWarning = "⚠️ No paid half-day leaves available. This will be marked as unpaid if approved.";
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
            email: item,
            quotaInfo: quota,
            warning: quotaWarning
        });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};