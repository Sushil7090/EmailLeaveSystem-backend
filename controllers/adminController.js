const emailModel = require('../models/emailModel');
const { sendEmail } = require('../services/emailService');
const User = require('../models/userModel');

const REQUIRED_SUBJECT = 'Leave Request Application';
const ALLOWED_LEAVE_TYPES = ["Sick Leave", "Casual Leave", "Emergency Leave"];
const MONTHLY_QUOTA_LIMIT = 1.5;  // 1 Full + 1 Half

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
            .populate('rejectionHistory.rejectedBy', 'fullname email role');

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
            .populate('rejectionHistory.rejectedBy', 'fullname email role');

        if (!item) return res.status(404).json({ message: 'Record not found' });

        return res.status(200).json({ email: item });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// -------------------- APPROVE LEAVE REQUEST (UPDATED) --------------------
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

        // ⭐⭐⭐ BALANCE DEDUCTION LOGIC START (UPDATED) ⭐⭐⭐
        const user = await User.findById(item.employeeId._id);
        if (!user) return res.status(404).json({ message: 'Employee not found' });

        const currentMonth = new Date().toISOString().slice(0, 7);
        
        // Reset if new month
        if (user.currentMonth !== currentMonth) {
            const unusedQuota = MONTHLY_QUOTA_LIMIT - user.monthlyQuotaUsed;
            user.carryForwardDays = unusedQuota > 0 ? unusedQuota : 0;
            user.monthlyQuotaUsed = 0;
            user.currentMonth = currentMonth;
            user.lastMonthlyReset = new Date();
        }

        const requestedDays = item.leaveDays || (item.leaveDuration === "Full Day" ? 1 : 0.5);
        const totalAvailable = MONTHLY_QUOTA_LIMIT + user.carryForwardDays;

        // Check monthly quota
        if (user.monthlyQuotaUsed + requestedDays > totalAvailable) {
            return res.status(400).json({ 
                message: `Monthly quota exceeded. Employee has only ${totalAvailable - user.monthlyQuotaUsed} day(s) remaining. Maximum 1.5 days per month allowed (1 Full + 1 Half).`,
                quotaInfo: {
                    used: user.monthlyQuotaUsed,
                    available: totalAvailable,
                    requested: requestedDays
                }
            });
        }

        let isPaid = true;
        let deductedFrom = "";
        let balanceDeducted = requestedDays;

        // ✅✅✅ STRICT TYPE-BASED DEDUCTION (NO MIXING) ✅✅✅
        if (item.leaveType === "Sick Leave") {
            // ✅ Sick Leave → फक्त SL मधून
            if (user.slBalance >= requestedDays) {
                user.slBalance -= requestedDays;
                deductedFrom = "SL";
            } else {
                // ❌ SL नाही → Unpaid (CL ला हात नाही)
                isPaid = false;
                deductedFrom = "Unpaid (Insufficient SL Balance)";
                balanceDeducted = 0;
            }
            
        } else if (item.leaveType === "Casual Leave" || item.leaveType === "Emergency Leave") {
            // ✅ Casual/Emergency → फक्त CL मधून
            if (user.clBalance >= requestedDays) {
                user.clBalance -= requestedDays;
                deductedFrom = "CL";
            } else {
                // ❌ CL नाही → Unpaid (SL ला हात नाही)
                isPaid = false;
                deductedFrom = "Unpaid (Insufficient CL Balance)";
                balanceDeducted = 0;
            }
        }
        // ✅✅✅ END STRICT LOGIC ✅✅✅

        // Update monthly quota ONLY IF PAID
        if (isPaid) {
            user.monthlyQuotaUsed += requestedDays;
        }
        
        // Add to leave history
        user.leaveHistory.push({
            leaveId: item._id,
            month: currentMonth,
            days: requestedDays,
            type: item.leaveType,
            appliedAt: new Date()
        });

        await user.save();
        // ⭐⭐⭐ BALANCE LOGIC END ⭐⭐⭐

        // Update leave request
        item.status = 'Approved';
        item.isPaid = isPaid;
        item.balanceDeducted = balanceDeducted;
        item.deductedFrom = deductedFrom;
        item.adminRemarks = `Approved by ${req.user.fullname.firstname} ${req.user.fullname.lastname} | ${isPaid ? 'Paid' : 'Unpaid'} | Deducted from: ${deductedFrom}`;
        item.reviewedBy = req.user._id;
        item.reviewedAt = new Date();
        await item.save();

        // Send email
        try {
            const adminName = req.user?.fullname
                ? `${req.user.fullname.firstname} ${req.user.fullname.lastname}`.trim()
                : 'Admin';

            const subject = 'Leave Request Approved';
            const text = `Dear ${item.employeeName},\n\nYour leave request has been APPROVED.\n\nLeave Type: ${item.leaveType}\nDuration: ${item.leaveDuration}\nStatus: ${isPaid ? 'Paid ✅' : 'Unpaid ❌'}\nDeducted from: ${deductedFrom}\n\nRemaining Balance:\nCL: ${user.clBalance} days\nSL: ${user.slBalance} days\nTotal: ${user.clBalance + user.slBalance} days\n\nRegards,\n${adminName}`;
            
            const html = `
                <p>Dear ${item.employeeName},</p>
                <p>Your leave request has been <strong style="color:green;">APPROVED</strong>.</p>
                <hr/>
                <h3>Leave Details:</h3>
                <ul>
                    <li><strong>Leave Type:</strong> ${item.leaveType}</li>
                    <li><strong>Duration:</strong> ${item.leaveDuration}</li>
                    <li><strong>Status:</strong> <span style="color:${isPaid ? 'green' : 'red'};">${isPaid ? 'Paid ✅' : 'Unpaid ❌'}</span></li>
                    <li><strong>Deducted from:</strong> ${deductedFrom}</li>
                </ul>
                <h3>Remaining Balance:</h3>
                <ul>
                    <li><strong>Casual Leave (CL):</strong> ${user.clBalance} days</li>
                    <li><strong>Sick Leave (SL):</strong> ${user.slBalance} days</li>
                    <li><strong>Total:</strong> ${user.clBalance + user.slBalance} days</li>
                </ul>
                <p>Regards,<br/>${adminName}</p>
            `;

            if (!item.employeeId?.email) throw new Error('Employee email not found');
            await sendEmail({ to: item.employeeId.email, subject, text, html });

            return res.status(200).json({ 
                message: 'Leave request approved', 
                email: item,
                balanceInfo: {
                    clBalance: user.clBalance,
                    slBalance: user.slBalance,
                    monthlyQuotaUsed: user.monthlyQuotaUsed,
                    isPaid: isPaid
                },
                emailSent: true 
            });
        } catch (mailErr) {
            console.error('Failed to send approval email:', mailErr);
            return res.status(200).json({
                message: 'Leave request approved (email failed to send)',
                email: item,
                balanceInfo: {
                    clBalance: user.clBalance,
                    slBalance: user.slBalance,
                    monthlyQuotaUsed: user.monthlyQuotaUsed,
                    isPaid: isPaid
                },
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

        item.status = 'Rejected';
        item.rejectionReason = rejectionReason.trim();
        item.adminRemarks = `Rejected by ${req.user.fullname.firstname} ${req.user.fullname.lastname}`;
        item.reviewedBy = req.user._id;
        item.reviewedAt = new Date();

        item.rejectionHistory.push({
            rejectedAt: new Date(),
            rejectedBy: req.user._id,
            rejectionReason: rejectionReason.trim(),
            adminRemarks: item.adminRemarks,
            attemptNumber: item.submissionCount,
            employeeLeaveReason: item.leaveReason,
            leaveType: item.leaveType,
            leaveDuration: item.leaveDuration,
            halfDayType: item.halfDayType,
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

// -------------------- SUMMARY STATS --------------------
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

// -------------------- SEND FEEDBACK --------------------
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

// -------------------- EMPLOYEES ON LEAVE TODAY --------------------
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

// -------------------- UPCOMING LEAVES --------------------
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

// -------------------- CALENDAR DATA --------------------
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

// ==================== CALENDAR EDIT ====================
module.exports.editLeaveFromCalendar = async function (req, res) {
    try {
        const { id } = req.params;
        const { leaveType, startDate, endDate, leaveDuration, halfDayType, leaveReason } = req.body;

        if (!leaveType || !startDate || !endDate) {
            return res.status(400).json({ message: 'leaveType, startDate, and endDate are required' });
        }

        if (!ALLOWED_LEAVE_TYPES.includes(leaveType)) {
            return res.status(400).json({ 
                message: `leaveType must be one of: ${ALLOWED_LEAVE_TYPES.join(', ')}` 
            });
        }

        if (leaveDuration && !["Full Day", "Half Day"].includes(leaveDuration)) {
            return res.status(400).json({ 
                message: 'leaveDuration must be "Full Day" or "Half Day"' 
            });
        }

        if (leaveDuration === "Half Day" && (!halfDayType || !["First Half", "Second Half"].includes(halfDayType))) {
            return res.status(400).json({ 
                message: 'halfDayType is required for Half Day' 
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start) || isNaN(end) || end < start) {
            return res.status(400).json({ message: 'Invalid date range' });
        }

        const item = await emailModel
            .findById(id)
            .populate('employeeId', 'fullname email role');

        if (!item) {
            return res.status(404).json({ message: 'Leave request not found' });
        }

        if (item.status !== 'Approved') {
            return res.status(400).json({ 
                message: 'Only approved leaves can be edited from calendar' 
            });
        }

        const oldStartDate = item.startDate;
        const oldEndDate = item.endDate;
        const oldLeaveType = item.leaveType;

        item.leaveType = leaveType;
        item.startDate = start;
        item.endDate = end;
        
        if (leaveDuration) {
            item.leaveDuration = leaveDuration;
            item.halfDayType = leaveDuration === "Half Day" ? halfDayType : "";
        }
        
        if (leaveReason) {
            item.leaveReason = leaveReason;
        }

        item.adminRemarks = `Edited by Admin (${req.user.fullname.firstname} ${req.user.fullname.lastname}) on ${new Date().toLocaleDateString()}`;
        item.updatedAt = new Date();

        await item.save();

        try {
            const employeeEmail = item.employeeId?.email;
            if (employeeEmail) {
                const subject = 'Leave Request Updated by Admin';
                const text = `Dear ${item.employeeName},\n\nYour approved leave has been updated by Admin.\n\nOld Details:\nType: ${oldLeaveType}\nFrom: ${oldStartDate.toLocaleDateString()}\nTo: ${oldEndDate.toLocaleDateString()}\n\nNew Details:\nType: ${item.leaveType}\nFrom: ${item.startDate.toLocaleDateString()}\nTo: ${item.endDate.toLocaleDateString()}\n\nRegards,\nAdmin`;
                
                const html = `
                    <p>Dear ${item.employeeName},</p>
                    <p>Your approved leave has been updated by Admin.</p>
                    
                    <h3>Old Details:</h3>
                    <ul>
                        <li><strong>Type:</strong> ${oldLeaveType}</li>
                        <li><strong>From:</strong> ${oldStartDate.toLocaleDateString()}</li>
                        <li><strong>To:</strong> ${oldEndDate.toLocaleDateString()}</li>
                    </ul>
                    
                    <h3>New Details:</h3>
                    <ul>
                        <li><strong>Type:</strong> ${item.leaveType}</li>
                        <li><strong>Duration:</strong> ${item.leaveDuration || 'Full Day'}</li>
                        ${item.halfDayType ? `<li><strong>Half Day:</strong> ${item.halfDayType}</li>` : ''}
                        <li><strong>From:</strong> ${item.startDate.toLocaleDateString()}</li>
                        <li><strong>To:</strong> ${item.endDate.toLocaleDateString()}</li>
                    </ul>
                    
                    <p>Regards,<br/>Admin</p>
                `;

                await sendEmail({ to: employeeEmail, subject, text, html });
            }
        } catch (emailErr) {
            console.error('Failed to send update notification:', emailErr);
        }

        return res.status(200).json({
            message: 'Leave updated successfully',
            email: item
        });

    } catch (err) {
        console.error('Error editing leave:', err);
        return res.status(500).json({ message: err.message });
    }
};

// ==================== CALENDAR DELETE ====================
module.exports.deleteLeaveFromCalendar = async function (req, res) {
    try {
        const { id } = req.params;

        const item = await emailModel
            .findById(id)
            .populate('employeeId', 'fullname email role');

        if (!item) {
            return res.status(404).json({ message: 'Leave request not found' });
        }

        if (item.status !== 'Approved') {
            return res.status(400).json({ 
                message: 'Only approved leaves can be deleted from calendar' 
            });
        }

        const employeeEmail = item.employeeId?.email;
        const employeeName = item.employeeName;
        const leaveType = item.leaveType;
        const startDate = item.startDate;
        const endDate = item.endDate;

        await emailModel.findByIdAndDelete(id);

        try {
            if (employeeEmail) {
                const subject = 'Leave Request Cancelled by Admin';
                const text = `Dear ${employeeName},\n\nYour approved leave has been cancelled by Admin.\n\nLeave Details:\nType: ${leaveType}\nFrom: ${startDate.toLocaleDateString()}\nTo: ${endDate.toLocaleDateString()}\n\nPlease contact HR for more information.\n\nRegards,\nAdmin`;
                
                const html = `
                    <p>Dear ${employeeName},</p>
                    <p>Your approved leave has been cancelled by Admin.</p>
                    
                    <h3>Cancelled Leave Details:</h3>
                    <ul>
                        <li><strong>Type:</strong> ${leaveType}</li>
                        <li><strong>From:</strong> ${startDate.toLocaleDateString()}</li>
                        <li><strong>To:</strong> ${endDate.toLocaleDateString()}</li>
                    </ul>
                    
                    <p>Please contact HR for more information.</p>
                    <p>Regards,<br/>Admin</p>
                `;

                await sendEmail({ to: employeeEmail, subject, text, html });
            }
        } catch (emailErr) {
            console.error('Failed to send cancellation notification:', emailErr);
        }

        return res.status(200).json({
            message: 'Leave deleted successfully'
        });

    } catch (err) {
        console.error('Error deleting leave:', err);
        return res.status(500).json({ message: err.message });
    }
};