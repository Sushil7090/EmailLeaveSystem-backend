const emailModel = require('../models/emailModel');
const { sendEmail } = require('../services/emailService');

const REQUIRED_SUBJECT = 'Leave Request Application';
const ALLOWED_LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Emergency Leave"];

function formatDate(date) {
    if (!date) return '';
    try {
        const d = new Date(date);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return String(date);
    }
}

function buildApprovalTemplate(item, adminName) {
    const subject = 'Request Approved';
    const text = `Dear Employee,\n\nYour leave request has been approved.\n\nRegards,\nAdmin`;
    const html = `
        <p>Dear Employee,</p>
        <p>Your leave request has been approved.</p>
        <p>Regards,<br/>Admin</p>
    `;
    return { subject, text, html };
}

function buildRejectionTemplate(item, adminName, rejectionReason) {
    const attemptsLeft = 3 - item.submissionCount;
    const subject = 'Request Rejected';
    const text = `Dear Employee,\n\nYour leave request has been rejected.\n\nReason: ${rejectionReason}\n\n${attemptsLeft > 0 ? 
        `You can resubmit your request. Remaining attempts: ${attemptsLeft}` : 
        'Maximum submission limit (3) reached.'}\n\nRegards,\nAdmin`;

    const html = `
        <p>Dear Employee,</p>
        <p>Your leave request has been rejected.</p>
        <p><strong>Reason:</strong> ${rejectionReason}</p>
        ${attemptsLeft > 0 ? `<p>You can resubmit. <strong>Remaining attempts: ${attemptsLeft}</strong></p>` : 
        '<p style="color:red;">Maximum submission limit (3) reached.</p>'}
        <p>Regards,<br/>Admin</p>
    `;

    return { subject, text, html };
}

// -------------------- LIST LEAVE REQUESTS --------------------
module.exports.listLeaveRequests = async function (req, res) {
    try {
        const { status } = req.query;
        const filter = {};
        if (status && ["Pending", "Approved", "Rejected"].includes(status)) filter.status = status;

        const items = await emailModel
            .find(filter)
            .sort({ receivedAt: -1 })
            .populate('employeeId', 'fullname email role')
            .populate('rejectionHistory.rejectedBy', 'fullname email role'); // ⭐ populated history.rejectedBy

        return res.status(200).json({ emails: items });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// -------------------- GET SINGLE LEAVE REQUEST --------------------
module.exports.getLeaveRequest = async function (req, res) {
    try {
        const { id } = req.params;
        const item = await emailModel
            .findById(id)
            .populate('employeeId', 'fullname email role')
            .populate('rejectionHistory.rejectedBy', 'fullname email role'); // ⭐ ADDED populate for history

        if (!item) return res.status(404).json({ message: 'Record not found' });

        return res.status(200).json({ email: item });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// -------------------- APPROVE LEAVE REQUEST --------------------
module.exports.approveLeaveRequest = async function (req, res) {
    try {
        const { id } = req.params;
        const item = await emailModel
            .findById(id)
            .populate('employeeId', 'fullname email role')
            .populate('reviewedBy', 'fullname email role');

        if (!item) return res.status(404).json({ message: 'Record not found' });
        if (item.employeeId?._id.toString() === req.user._id.toString()) {
            return res.status(403).json({ message: "Admins cannot approve their own leave request" });
        }
        if (item.status !== 'Pending') 
            return res.status(400).json({ message: 'Only pending records can be approved' });

        item.status = 'Approved';
        item.adminRemarks = `Approved by ${req.user.fullname.firstname} ${req.user.fullname.lastname}`;
        item.reviewedBy = req.user._id;
        item.reviewedAt = new Date();
        await item.save();

        try {
            const adminName = req.user?.fullname
                ? `${req.user.fullname.firstname} ${req.user.fullname.lastname}`.trim()
                : 'Admin';

            const { subject, text, html } = buildApprovalTemplate(item, adminName);
            if (!item.employeeId?.email) throw new Error('Employee email not found');
            await sendEmail({ to: item.employeeId.email, subject, text, html });

            return res.status(200).json({ 
                message: 'Leave request approved', 
                email: item, 
                emailSent: true 
            });
        } catch (mailErr) {
            console.error('Failed to send approval email:', mailErr);
            return res.status(200).json({
                message: 'Leave request approved (email failed to send)',
                email: item,
                emailSent: false,
            });
        }
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// -------------------- REJECT LEAVE REQUEST --------------------
module.exports.rejectLeaveRequest = async function (req, res) {
    try {
        const { id } = req.params;
        const { rejectionReason } = req.body;

        if (!rejectionReason || rejectionReason.trim() === '') {
            return res.status(400).json({ message: 'Rejection reason is required' });
        }

        const item = await emailModel
            .findById(id)
            .populate('employeeId', 'fullname email role')
            .populate('reviewedBy', 'fullname email role');

        if (!item) return res.status(404).json({ message: 'Record not found' });
        if (item.employeeId?._id.toString() === req.user._id.toString()) {
            return res.status(403).json({ message: "Admins cannot reject their own leave request" });
        }
        if (item.status !== 'Pending')
            return res.status(400).json({ message: 'Only pending records can be rejected' });

        // Update main fields
        item.status = 'Rejected';
        item.rejectionReason = rejectionReason.trim();
        item.adminRemarks = `Rejected by ${req.user.fullname.firstname} ${req.user.fullname.lastname}`;
        item.reviewedBy = req.user._id;
        item.reviewedAt = new Date();

        // ⭐⭐ PUSH TO rejectionHistory BEFORE SAVE
        item.rejectionHistory.push({
            rejectedAt: new Date(),
            rejectedBy: req.user._id,
            rejectionReason: rejectionReason.trim(),
            adminRemarks: item.adminRemarks,
            attemptNumber: item.submissionCount,
            employeeLeaveReason: item.leaveReason,
            leaveType: item.leaveType,
            leaveDuration: item.leaveDuration,  // ⭐ NEW
            halfDayType: item.halfDayType,      // ⭐ NEW
            startDate: item.startDate,
            endDate: item.endDate
        });

        await item.save();

        try {
            const adminName = req.user?.fullname
                ? `${req.user.fullname.firstname} ${req.user.fullname.lastname}`.trim()
                : 'Admin';

            const { subject, text, html } = buildRejectionTemplate(item, adminName, rejectionReason);
            if (!item.employeeId?.email) throw new Error('Employee email not found');
            await sendEmail({ to: item.employeeId.email, subject, text, html });

            return res.status(200).json({
                message: 'Leave request rejected',
                email: item,
                emailSent: true,
            });
        } catch (mailErr) {
            console.error('Failed to send rejection email:', mailErr);
            return res.status(200).json({
                message: 'Leave request rejected (email failed to send)',
                email: item,
                emailSent: false,
            });
        }
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// -------------------- SUMMARY & OTHER FUNCTIONS --------------------
module.exports.summaryStats = async function (req, res) {
    try {
        const [pending, approved, rejected] = await Promise.all([
            emailModel.countDocuments({ status: 'Pending' }),
            emailModel.countDocuments({ status: 'Approved' }),
            emailModel.countDocuments({ status: 'Rejected' }),
        ]);
        return res.status(200).json({ pending, approved, rejected });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.sendFeedbackToEmployee = async function (req, res) {
    try {
        const { toEmail, subject, message } = req.body;

        if (!toEmail || !subject || !message)
            return res.status(400).json({ message: 'toEmail, subject and message are required' });

        const html = `
            <p>${message.replace(/\n/g, '<br/>')}</p>
            <hr/>
            <p style="font-size:12px;color:#6b7280">This message was sent by Admin via DYP Company Leave System.</p>
        `;

        await sendEmail({ to: toEmail, subject, html, text: message });

        return res.status(200).json({ message: 'Feedback email sent' });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.getEmployeesOnLeaveToday = async function (req, res) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const employeesOnLeave = await emailModel
            .find({
                status: 'Approved',
                startDate: { $lte: today },
                endDate: { $gte: today },
            })
            .select('employeeId leaveType startDate endDate')
            .populate('employeeId', 'fullname');

        const formattedEmployees = employeesOnLeave.map((employee) => ({
            name: employee.employeeId?.fullname
                ? `${employee.employeeId.fullname.firstname} ${employee.employeeId.fullname.lastname}`
                : 'Unknown',
            type:
                employee.leaveType === 'Sick Leave'
                    ? 'SL'
                    : employee.leaveType === 'Casual Leave'
                    ? 'CL'
                    : employee.leaveType === 'Emergency Leave'
                    ? 'EL'
                    : 'NA',
            startDate: employee.startDate,
            endDate: employee.endDate,
        }));

        return res.status(200).json({ employees: formattedEmployees });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.getUpcomingLeaves = async function (req, res) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const thirtyDaysFromNow = new Date(today);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const upcomingLeaves = await emailModel
            .find({
                status: 'Approved',
                startDate: {
                    $gte: today,
                    $lte: thirtyDaysFromNow,
                },
            })
            .select('employeeId leaveType startDate endDate')
            .populate('employeeId', 'fullname')
            .sort({ startDate: 1 })
            .limit(10);

        const formattedLeaves = upcomingLeaves.map((leave) => ({
            name: leave.employeeId?.fullname
                ? `${leave.employeeId.fullname.firstname} ${leave.employeeId.fullname.lastname}`
                : 'Unknown',
            date: leave.startDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
            }),
            type: leave.leaveType,
            startDate: leave.startDate,
            endDate: leave.endDate,
        }));

        return res.status(200).json({ leaves: formattedLeaves });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.getCalendarData = async function (req, res) {
    try {
        const { year, month } = req.query;

        if (!year || !month) {
            return res.status(400).json({ message: 'Year and month are required' });
        }

        const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endOfMonth = new Date(parseInt(year), parseInt(month), 0);

        const leavesInMonth = await emailModel
            .find({
                status: 'Approved',
                $or: [
                    {
                        startDate: { $lte: endOfMonth },
                        endDate: { $gte: startOfMonth },
                    },
                ],
            })
            .select('employeeId leaveType startDate endDate')
            .populate('employeeId', 'fullname');

        const calendarData = leavesInMonth.map((leave) => ({
            employeeName: leave.employeeId?.fullname
                ? `${leave.employeeId.fullname.firstname} ${leave.employeeId.fullname.lastname}`
                : 'Unknown',
            leaveType: leave.leaveType,
            startDate: leave.startDate,
            endDate: leave.endDate,
            type:
                leave.leaveType === 'Sick Leave'
                    ? 'SL'
                    : leave.leaveType === 'Casual Leave'
                    ? 'CL'
                    : leave.leaveType === 'Emergency Leave'
                    ? 'EL'
                    : 'NA',
        }));

        return res.status(200).json({ calendarData });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};
