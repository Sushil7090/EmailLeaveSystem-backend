// services/leaveReminderService.js
// NEW FILE - Create this new service file in Backend/services/

const cron = require('node-cron');
const emailModel = require('../models/emailModel');
const { sendEmail } = require('./emailService');

/**
 * Send reminder email to employee one day before leave
 */
async function sendLeaveReminders() {
    try {
        console.log('🔔 Running leave reminder check...');

        // Get tomorrow's date (start and end of day)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(23, 59, 59, 999);

        // Find all approved leaves starting tomorrow
        const upcomingLeaves = await emailModel
            .find({
                status: 'Approved',
                startDate: {
                    $gte: tomorrow,
                    $lte: tomorrowEnd
                }
            })
            .populate('employeeId', 'fullname email');

        console.log(`📋 Found ${upcomingLeaves.length} leaves starting tomorrow`);

        // Send reminder email to each employee
        for (const leave of upcomingLeaves) {
            try {
                const employeeEmail = leave.employeeId?.email;
                if (!employeeEmail) {
                    console.warn(`⚠️ No email found for leave ID: ${leave._id}`);
                    continue;
                }

                const employeeName = leave.employeeName || 'Employee';
                const leaveDate = leave.startDate.toLocaleDateString('en-IN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                const subject = '🔔 Reminder: Your Leave Starts Tomorrow';
                
                const text = `Dear ${employeeName},

This is a friendly reminder that your leave starts tomorrow.

Leave Details:
📅 Date: ${leaveDate}
📝 Type: ${leave.leaveType}
⏰ Duration: ${leave.leaveDuration || 'Full Day'}${leave.halfDayType ? ` (${leave.halfDayType})` : ''}
📆 End Date: ${leave.endDate.toLocaleDateString('en-IN')}

${leave.leaveReason ? `Reason: ${leave.leaveReason}` : ''}

Please ensure all your pending work is completed before you go on leave.

Have a great time!

Regards,
HR Team
QHills Technology Pvt. Ltd`;

                const html = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                        <h2 style="color: #2563eb; margin-bottom: 20px;">🔔 Leave Reminder</h2>
                        
                        <p>Dear <strong>${employeeName}</strong>,</p>
                        
                        <p>This is a friendly reminder that your leave starts <strong>tomorrow</strong>.</p>
                        
                        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #374151;">Leave Details:</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 8px 0;"><strong>📅 Date:</strong></td>
                                    <td style="padding: 8px 0;">${leaveDate}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;"><strong>📝 Type:</strong></td>
                                    <td style="padding: 8px 0;">${leave.leaveType}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;"><strong>⏰ Duration:</strong></td>
                                    <td style="padding: 8px 0;">${leave.leaveDuration || 'Full Day'}${leave.halfDayType ? ` (${leave.halfDayType})` : ''}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0;"><strong>📆 End Date:</strong></td>
                                    <td style="padding: 8px 0;">${leave.endDate.toLocaleDateString('en-IN')}</td>
                                </tr>
                                ${leave.leaveReason ? `
                                <tr>
                                    <td style="padding: 8px 0; vertical-align: top;"><strong>💭 Reason:</strong></td>
                                    <td style="padding: 8px 0;">${leave.leaveReason}</td>
                                </tr>
                                ` : ''}
                            </table>
                        </div>
                        
                        <p style="color: #6b7280;">Please ensure all your pending work is completed before you go on leave.</p>
                        
                        <p style="margin-top: 30px;">Have a great time! 🌟</p>
                        
                        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                        
                        <p style="font-size: 12px; color: #9ca3af;">
                            Regards,<br/>
                            <strong>HR Team</strong><br/>
                            QHills Technology Pvt. Ltd
                        </p>
                    </div>
                `;

                await sendEmail({
                    to: employeeEmail,
                    subject,
                    text,
                    html
                });

                console.log(`✅ Reminder sent to ${employeeEmail} for leave ID: ${leave._id}`);

            } catch (emailErr) {
                console.error(`❌ Failed to send reminder for leave ID ${leave._id}:`, emailErr);
            }
        }

        console.log('✅ Leave reminder check completed');

    } catch (err) {
        console.error('❌ Error in sendLeaveReminders:', err);
    }
}

/**
 * Start the cron job to run daily at 6 PM IST
 */
function startLeaveReminderScheduler() {
    // Schedule: Every day at 6:00 PM (18:00)
    // Cron format: minute hour day month weekday
    // '0 18 * * *' = At 18:00 (6 PM) every day
    
    const job = cron.schedule('0 18 * * *', () => {
        console.log('⏰ Cron job triggered: Checking for tomorrow\'s leaves...');
        sendLeaveReminders();
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // Indian timezone
    });

    console.log('✅ Leave reminder scheduler started (runs daily at 6:00 PM IST)');
    
    // Optional: Run immediately on server start for testing
    if (process.env.SEND_REMINDER_ON_START === 'true') {
        console.log('🧪 Running leave reminder immediately (test mode)...');
        sendLeaveReminders();
    }

    return job;
}

/**
 * Manual trigger endpoint (useful for testing)
 */
async function triggerManualReminder() {
    console.log('🔧 Manual reminder triggered...');
    await sendLeaveReminders();
}

module.exports = {
    startLeaveReminderScheduler,
    sendLeaveReminders,
    triggerManualReminder
};