const emailModel = require('../models/emailModel');
const { sendEmail } = require('../services/emailService');

// Helpers to build fixed email templates for approval/rejection
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

function buildRejectionTemplate(item, adminName) {
	const subject = 'Request Rejected';
	const text = `Dear Employee,\n\nYour leave request has been rejected.\n\nRegards,\nAdmin`;
	const html = `
		<p>Dear Employee,</p>
		<p>Your leave request has been rejected.</p>
		<p>Regards,<br/>Admin</p>
	`;
	return { subject, text, html };
}

module.exports.listLeaveRequests = async function (req, res) {
    try {
        const { status } = req.query;
        const filter = {};
        if (status && ["Pending", "Approved", "Rejected"].includes(status)) {
            filter.status = status;
        }
        const items = await emailModel.find(filter).sort({ receivedAt: -1 });
        return res.status(200).json({ emails: items });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.getLeaveRequest = async function (req, res) {
    try {
        const { id } = req.params;
        const item = await emailModel.findById(id);
        if (!item) return res.status(404).json({ message: 'Record not found' });
        return res.status(200).json({ email: item });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.approveLeaveRequest = async function (req, res) {
    try {
        const { id } = req.params;
        const { adminRemarks } = req.body;
        const item = await emailModel.findById(id);
        if (!item) return res.status(404).json({ message: 'Record not found' });
        if (item.status !== 'Pending') return res.status(400).json({ message: 'Only pending records can be approved' });
        item.status = 'Approved';
        item.adminRemarks = adminRemarks || '';
        item.reviewedBy = req.user._id;
        item.reviewedAt = new Date();
        await item.save();
        // Send fixed approval email template
        try {
            const adminName = req.user?.fullname ? `${req.user.fullname.firstname} ${req.user.fullname.lastname}`.trim() : 'Admin';
            const { subject, text, html } = buildApprovalTemplate(item, adminName);
            await sendEmail({ to: item.employeeEmail, subject, text, html });
            return res.status(200).json({ message: 'Leave request approved', email: item, emailSent: true });
        } catch (mailErr) {
            console.error('Failed to send approval email:', mailErr);
            return res.status(200).json({ message: 'Leave request approved (email failed to send)', email: item, emailSent: false });
        }
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.rejectLeaveRequest = async function (req, res) {
    try {
        const { id } = req.params;
        const { adminRemarks } = req.body;
        const item = await emailModel.findById(id);
        if (!item) return res.status(404).json({ message: 'Record not found' });
        if (item.status !== 'Pending') return res.status(400).json({ message: 'Only pending records can be rejected' });
        item.status = 'Rejected';
        item.adminRemarks = adminRemarks || '';
        item.reviewedBy = req.user._id;
        item.reviewedAt = new Date();
        await item.save();
        // Send fixed rejection email template
        try {
            const adminName = req.user?.fullname ? `${req.user.fullname.firstname} ${req.user.fullname.lastname}`.trim() : 'Admin';
            const { subject, text, html } = buildRejectionTemplate(item, adminName);
            await sendEmail({ to: item.employeeEmail, subject, text, html });
            return res.status(200).json({ message: 'Leave request rejected', email: item, emailSent: true });
        } catch (mailErr) {
            console.error('Failed to send rejection email:', mailErr);
            return res.status(200).json({ message: 'Leave request rejected (email failed to send)', email: item, emailSent: false });
        }
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports.summaryStats = async function (req, res) {
    try {
        const [pending, approved, rejected] = await Promise.all([
            emailModel.countDocuments({ status: 'Pending' }),
            emailModel.countDocuments({ status: 'Approved' }),
            emailModel.countDocuments({ status: 'Rejected' })
        ]);
        return res.status(200).json({ pending, approved, rejected });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// Admin sends feedback email to an employee via common email
module.exports.sendFeedbackToEmployee = async function (req, res) {
    try {
        const { toEmail, subject, message } = req.body;
        if (!toEmail || !subject || !message) {
            return res.status(400).json({ message: 'toEmail, subject and message are required' });
        }

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

// Get employees on leave today
module.exports.getEmployeesOnLeaveToday = async function (req, res) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const employeesOnLeave = await emailModel.find({
            status: 'Approved',
            startDate: { $lte: today },
            endDate: { $gte: today }
        }).select('employeeName leaveType startDate endDate');

        const formattedEmployees = employeesOnLeave.map(employee => ({
            name: employee.employeeName,
            type: employee.leaveType === 'Sick Leave' ? 'SL' : 
                  employee.leaveType === 'Casual Leave' ? 'CL' : 
                  employee.leaveType === 'Paid Leave' ? 'PL' : 'OL',
            startDate: employee.startDate,
            endDate: employee.endDate
        }));

        return res.status(200).json({ employees: formattedEmployees });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// Get upcoming leaves
module.exports.getUpcomingLeaves = async function (req, res) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const thirtyDaysFromNow = new Date(today);
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

        const upcomingLeaves = await emailModel.find({
            status: 'Approved',
            startDate: { 
                $gte: today,
                $lte: thirtyDaysFromNow
            }
        }).select('employeeName leaveType startDate endDate')
        .sort({ startDate: 1 })
        .limit(10);

        const formattedLeaves = upcomingLeaves.map(leave => ({
            name: leave.employeeName,
            date: leave.startDate.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
            }),
            type: leave.leaveType,
            startDate: leave.startDate,
            endDate: leave.endDate
        }));

        return res.status(200).json({ leaves: formattedLeaves });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// Get calendar data for a specific month
module.exports.getCalendarData = async function (req, res) {
    try {
        const { year, month } = req.query;
        
        if (!year || !month) {
            return res.status(400).json({ message: 'Year and month are required' });
        }

        const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endOfMonth = new Date(parseInt(year), parseInt(month), 0);

        const leavesInMonth = await emailModel.find({
            status: 'Approved',
            $or: [
                {
                    startDate: { $lte: endOfMonth },
                    endDate: { $gte: startOfMonth }
                }
            ]
        }).select('employeeName leaveType startDate endDate');

        const calendarData = leavesInMonth.map(leave => ({
            employeeName: leave.employeeName,
            leaveType: leave.leaveType,
            startDate: leave.startDate,
            endDate: leave.endDate,
            type: leave.leaveType === 'Sick Leave' ? 'SL' : 
                  leave.leaveType === 'Casual Leave' ? 'CL' : 
                  leave.leaveType === 'Paid Leave' ? 'PL' : 'OL'
        }));

        return res.status(200).json({ calendarData });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};
