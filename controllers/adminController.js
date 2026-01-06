const emailModel = require('../models/emailModel');
const { sendEmail } = require('../services/emailService');
const User = require('../models/userModel');

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

// -------------------- APPROVE LEAVE REQUEST (UPDATED WITH NEW LOGIC) --------------------
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

        // ⭐⭐⭐ MAIN APPROVAL LOGIC START ⭐⭐⭐
        const user = await User.findById(item.employeeId._id);
        if (!user) return res.status(404).json({ message: 'Employee not found' });

        const currentMonth = new Date().toISOString().slice(0, 7);
        
        // ✅ MONTHLY RESET LOGIC
        if (user.currentMonth !== currentMonth) {
            // Calculate carry forward from previous month
            const unusedFull = 1 - user.currentMonthPaidFull;
            const unusedHalf = 1 - user.currentMonthPaidHalf;
            
            user.previousMonthBalanceFull = unusedFull > 0 ? unusedFull : 0;
            user.previousMonthBalanceHalf = unusedHalf > 0 ? unusedHalf : 0;
            
            // Reset current month counters
            user.currentMonthPaidFull = 0;
            user.currentMonthPaidHalf = 0;
            user.currentMonthUnpaidLeaves = 0;
            user.currentMonth = currentMonth;
            user.lastMonthlyReset = new Date();
        }

        const isFullDay = item.leaveDuration === "Full Day";
        const requestedDays = isFullDay ? 1 : 0.5;

        let isPaid = false;
        let deductedFrom = "";
        let balanceDeducted = 0;

        // ✅✅✅ 3-STEP CHECKING LOGIC ✅✅✅
        
        // STEP A: Check Current Month Paid Quota
        if (isFullDay && user.currentMonthPaidFull < 1) {
            // Current month full leave available
            isPaid = true;
            deductedFrom = "Current Month Paid (Full)";
            user.currentMonthPaidFull += 1;
            
        } else if (!isFullDay && user.currentMonthPaidHalf < 1) {
            // Current month half leave available
            isPaid = true;
            deductedFrom = "Current Month Paid (Half)";
            user.currentMonthPaidHalf += 1;
            
        // STEP B: Check Previous Month Balance (Carry Forward)
        } else if (isFullDay && user.previousMonthBalanceFull >= 1) {
            // Use previous month full balance
            isPaid = true;
            deductedFrom = "Previous Month Balance (Full)";
            user.previousMonthBalanceFull -= 1;
            
        } else if (!isFullDay && user.previousMonthBalanceHalf >= 1) {
            // Use previous month half balance
            isPaid = true;
            deductedFrom = "Previous Month Balance (Half)";
            user.previousMonthBalanceHalf -= 1;
            
        // STEP C: Mark as Unpaid
        } else {
            isPaid = false;
            deductedFrom = "Unpaid (No Paid Quota Available)";
            user.currentMonthUnpaidLeaves += requestedDays;
            user.totalUnpaidLeaves += requestedDays;
        }

        // ✅ DEDUCT FROM CL/SL ONLY IF PAID
        if (isPaid) {
            balanceDeducted = requestedDays;
            
            // Strict type-based deduction
            if (item.leaveType === "Sick Leave") {
                if (user.slBalance >= requestedDays) {
                    user.slBalance -= requestedDays;
                } else {
                    // Override to unpaid if insufficient SL
                    isPaid = false;
                    deductedFrom = "Unpaid (Insufficient SL Balance)";
                    balanceDeducted = 0;
                    user.currentMonthUnpaidLeaves += requestedDays;
                    user.totalUnpaidLeaves += requestedDays;
                }
                
            } else if (item.leaveType === "Casual Leave" || item.leaveType === "Emergency Leave") {
                if (user.clBalance >= requestedDays) {
                    user.clBalance -= requestedDays;
                } else {
                    // Override to unpaid if insufficient CL
                    isPaid = false;
                    deductedFrom = "Unpaid (Insufficient CL Balance)";
                    balanceDeducted = 0;
                    user.currentMonthUnpaidLeaves += requestedDays;
                    user.totalUnpaidLeaves += requestedDays;
                }
            }
        }
        
        // Add to leave history
        user.leaveHistory.push({
            leaveId: item._id,
            month: currentMonth,
            days: requestedDays,
            type: item.leaveType,
            isPaid: isPaid,
            deductedFrom: deductedFrom,
            appliedAt: new Date()
        });

        await user.save();
        // ⭐⭐⭐ LOGIC END ⭐⭐⭐

        // Update leave request
        item.status = 'Approved';
        item.isPaid = isPaid;
        item.balanceDeducted = balanceDeducted;
        item.deductedFrom = deductedFrom;
        item.adminRemarks = `Approved by ${req.user.fullname.firstname} ${req.user.fullname.lastname} | ${isPaid ? 'Paid' : 'Unpaid'} | ${deductedFrom}`;
        item.reviewedBy = req.user._id;
        item.reviewedAt = new Date();
        await item.save();

        // Send email
        try {
            const adminName = req.user?.fullname
                ? `${req.user.fullname.firstname} ${req.user.fullname.lastname}`.trim()
                : 'Admin';

            const subject = 'Leave Request Approved';
            const text = `Dear ${item.employeeName},\n\nYour leave request has been APPROVED.\n\nLeave Type: ${item.leaveType}\nDuration: ${item.leaveDuration}\nStatus: ${isPaid ? 'Paid ✅' : 'Unpaid ❌'}\nDeducted from: ${deductedFrom}\n\nRemaining Balance:\nCL: ${user.clBalance} days\nSL: ${user.slBalance} days\nTotal: ${user.clBalance + user.slBalance} days\n\nCurrent Month Status:\nPaid Full Used: ${user.currentMonthPaidFull}/1\nPaid Half Used: ${user.currentMonthPaidHalf}/1\nUnpaid Leaves: ${user.currentMonthUnpaidLeaves}\n\nPrevious Month Balance:\nFull: ${user.previousMonthBalanceFull}\nHalf: ${user.previousMonthBalanceHalf}\n\nRegards,\n${adminName}`;
            
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
                <h3>Current Month Status:</h3>
                <ul>
                    <li><strong>Paid Full Used:</strong> ${user.currentMonthPaidFull}/1</li>
                    <li><strong>Paid Half Used:</strong> ${user.currentMonthPaidHalf}/1</li>
                    <li><strong>Unpaid Leaves:</strong> ${user.currentMonthUnpaidLeaves}</li>
                </ul>
                <h3>Previous Month Balance:</h3>
                <ul>
                    <li><strong>Full:</strong> ${user.previousMonthBalanceFull}</li>
                    <li><strong>Half:</strong> ${user.previousMonthBalanceHalf}</li>
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
                    currentMonthPaidFull: user.currentMonthPaidFull,
                    currentMonthPaidHalf: user.currentMonthPaidHalf,
                    currentMonthUnpaid: user.currentMonthUnpaidLeaves,
                    previousMonthBalanceFull: user.previousMonthBalanceFull,
                    previousMonthBalanceHalf: user.previousMonthBalanceHalf,
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
                    currentMonthPaidFull: user.currentMonthPaidFull,
                    currentMonthPaidHalf: user.currentMonthPaidHalf,
                    currentMonthUnpaid: user.currentMonthUnpaidLeaves,
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

// ==================== EMPLOYEE LEAVE SUMMARY FOR ADMIN ====================
module.exports.getEmployeeLeaveSummary = async function (req, res) {
    try {
        const currentMonth = new Date().toISOString().slice(0, 7);

        const employees = await User.find({ role: 'employee' })
            .select('fullname email clBalance slBalance currentMonthPaidFull currentMonthPaidHalf currentMonthUnpaidLeaves previousMonthBalanceFull previousMonthBalanceHalf totalUnpaidLeaves leaveHistory')
            .sort({ 'fullname.firstname': 1 });

        const summary = employees.map(emp => {
            // Calculate paid leaves remaining
            const currentMonthFullRemaining = 1 - emp.currentMonthPaidFull;
            const currentMonthHalfRemaining = 1 - emp.currentMonthPaidHalf;

            // Calculate this month's leave counts
            const thisMonthLeaves = emp.leaveHistory.filter(h => h.month === currentMonth);
            const thisMonthPaidCount = thisMonthLeaves
                .filter(h => h.isPaid)
                .reduce((sum, h) => sum + h.days, 0);
            const thisMonthUnpaidCount = thisMonthLeaves
                .filter(h => !h.isPaid)
                .reduce((sum, h) => sum + h.days, 0);

            return {
                id: emp._id,
                name: `${emp.fullname.firstname} ${emp.fullname.lastname}`,
                email: emp.email,
                
                // Overall Balance
                overallBalance: {
                    cl: emp.clBalance,
                    sl: emp.slBalance,
                    total: emp.clBalance + emp.slBalance
                },
                
                // Current Month Status
                currentMonth: {
                    paidFullUsed: emp.currentMonthPaidFull,
                    paidFullRemaining: currentMonthFullRemaining,
                    paidHalfUsed: emp.currentMonthPaidHalf,
                    paidHalfRemaining: currentMonthHalfRemaining,
                    unpaidLeaves: emp.currentMonthUnpaidLeaves,
                    totalPaidTaken: thisMonthPaidCount,
                    totalUnpaidTaken: thisMonthUnpaidCount
                },
                
                // Previous Month Balance (Carry Forward)
                previousMonthBalance: {
                    full: emp.previousMonthBalanceFull,
                    half: emp.previousMonthBalanceHalf
                },
                
                // Lifetime Stats
                lifetime: {
                    totalUnpaidLeaves: emp.totalUnpaidLeaves
                }
            };
        });

        return res.status(200).json({ 
            employees: summary,
            timestamp: new Date(),
            currentMonth: currentMonth
        });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// ==================== DETAILED EMPLOYEE REPORT ====================
module.exports.getDetailedEmployeeReport = async function (req, res) {
    try {
        const { employeeId } = req.params;

        const employee = await User.findById(employeeId)
            .select('fullname email clBalance slBalance currentMonthPaidFull currentMonthPaidHalf currentMonthUnpaidLeaves previousMonthBalanceFull previousMonthBalanceHalf totalUnpaidLeaves leaveHistory createdAt');

        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        // Get all leave requests
        const leaveRequests = await emailModel
            .find({ employeeId: employeeId })
            .populate('reviewedBy', 'fullname email')
            .sort({ receivedAt: -1 });

        // Group leaves by month
        const leavesByMonth = {};
        employee.leaveHistory.forEach(leave => {
            if (!leavesByMonth[leave.month]) {
                leavesByMonth[leave.month] = {
                    paid: 0,
                    unpaid: 0,
                    details: []
                };
            }
            if (leave.isPaid) {
                leavesByMonth[leave.month].paid += leave.days;
            } else {
                leavesByMonth[leave.month].unpaid += leave.days;
            }
            leavesByMonth[leave.month].details.push({
                type: leave.type,
                days: leave.days,
                isPaid: leave.isPaid,
                deductedFrom: leave.deductedFrom,
                date: leave.appliedAt
            });
        });

        const currentMonth = new Date().toISOString().slice(0, 7);

        return res.status(200).json({
            employee: {
                id: employee._id,
                name: `${employee.fullname.firstname} ${employee.fullname.lastname}`,
                email: employee.email,
                joinDate: employee.createdAt
            },
            currentStatus: {
                clBalance: employee.clBalance,
                slBalance: employee.slBalance,
                totalBalance: employee.clBalance + employee.slBalance,
                currentMonthPaidFull: employee.currentMonthPaidFull,
                currentMonthPaidHalf: employee.currentMonthPaidHalf,
                currentMonthUnpaid: employee.currentMonthUnpaidLeaves,
                previousMonthBalanceFull: employee.previousMonthBalanceFull,
                previousMonthBalanceHalf: employee.previousMonthBalanceHalf,
                lifetimeUnpaid: employee.totalUnpaidLeaves
            },
            leavesByMonth: leavesByMonth,
            allLeaveRequests: leaveRequests,
            generatedAt: new Date()
        });

    } catch (err) {
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
        } catch (emailError) {
            console.error('Failed to send cancellation notification:', emailError);
        }

        return res.status(200).json({
            message: 'Leave deleted successfully'
        });

    } catch (err) {
        console.error('Error deleting leave:', err);
        return res.status(500).json({ message: err.message });
    }
};
// Get Single Employee
exports.getSingleEmployee = async (req, res) => {
    try {
        const employeeId = req.params.id;

        const employee = await User.findById(employeeId)
            .select("-password -passwordResetToken -passwordResetExpires");

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: "Employee not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: employee
        });

    } catch (error) {
        console.error("Error fetching employee:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
};