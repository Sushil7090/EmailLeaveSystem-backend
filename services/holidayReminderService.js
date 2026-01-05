const cron = require('node-cron');
const HolidayCalendar = require('../models/holidayCalendarModel');
const User = require('../models/userModel');
const { sendEmail } = require('./emailService');

// ===============================
// CHECK & SEND HOLIDAY REMINDERS
// ===============================
async function checkAndSendHolidayReminders() {
  try {
    console.log('🎉 Running holiday reminder check...');

    // Tomorrow date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    // Fetch holidays
    const holidaysTomorrow = await HolidayCalendar.find({
      isActive: true,
      holidayDate: {
        $gte: tomorrow,
        $lt: dayAfterTomorrow
      }
    });

    if (holidaysTomorrow.length === 0) {
      console.log('📅 No holidays tomorrow');
      return;
    }

    console.log(`🎊 Found ${holidaysTomorrow.length} holiday(s) tomorrow`);

    // Fetch employees
    const employees = await User.find({
      role: { $in: ['employee', 'admin'] }
    }).select('email fullname');

    console.log(`👥 Sending reminders to ${employees.length} employees`);

    // Send mail to each employee
    for (const employee of employees) {
      try {
        // ✅ FIXED FULL NAME FORMAT
        const employeeName = employee.fullname
          ? `${employee.fullname.firstname || ''} ${employee.fullname.middlename || ''} ${employee.fullname.lastname || ''}`
              .replace(/\s+/g, ' ')
              .trim()
          : 'Team Member';

        const employeeEmail = employee.email;

        // Holiday HTML
        const holidayListHTML = holidaysTomorrow.map(holiday => `
          <div style="background-color:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin:15px 0;border-radius:5px;">
            <h3 style="margin:0 0 10px;color:#856404;">🎉 ${holiday.holidayName}</h3>
            <p style="margin:5px 0;color:#856404;"><strong>Type:</strong> ${holiday.holidayType}</p>
            <p style="margin:5px 0;color:#856404;">
              <strong>Date:</strong> ${new Date(holiday.holidayDate).toLocaleDateString('en-IN', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            ${holiday.description ? `
              <p style="margin:10px 0 5px;color:#856404;">
                <strong>About:</strong> ${holiday.description}
              </p>` : ''}
          </div>
        `).join('');

        // Email content
        const emailContent = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;background:#f9f9f9;">
            <div style="background:#FF6B6B;color:#fff;padding:20px;text-align:center;border-radius:5px 5px 0 0;">
              <h2 style="margin:0;">🎊 Holiday Tomorrow!</h2>
            </div>

            <div style="background:#fff;padding:30px;border-radius:0 0 5px 5px;">
              <p style="font-size:16px;color:#333;">
                Dear <strong>${employeeName}</strong>,
              </p>

              <p style="font-size:16px;color:#333;">
                This is a friendly reminder that <strong>tomorrow is a holiday</strong> and the office will be closed.
              </p>

              ${holidayListHTML}

              <div style="background:#d4edda;border-left:4px solid #28a745;padding:15px;margin:20px 0;border-radius:5px;">
                <strong>✅ Enjoy your day off!</strong>
                <ul style="margin-top:10px;">
                  <li>No need to come to the office tomorrow</li>
                  <li>See you on the next working day</li>
                </ul>
              </div>

              <p>Have a wonderful holiday! 🌟</p>

              <hr />
              <p style="font-size:12px;color:#999;">
                This is an automated mail from <strong>QHills Technology Pvt. Ltd</strong><br/>
                Leave Management System
              </p>
            </div>
          </div>
        `;

        await sendEmail({
          to: employeeEmail,
          subject: '🎊 Holiday Reminder: Office Closed Tomorrow',
          html: emailContent
        });

        console.log(`✅ Email sent to ${employeeEmail}`);
      } catch (err) {
        console.error(`❌ Failed for ${employee.email}`, err.message);
      }
    }

    console.log('✅ Holiday reminder completed');
  } catch (error) {
    console.error('❌ Cron error:', error);
  }
}

// ===============================
// START CRON
// ===============================
function startHolidayReminderScheduler() {
  cron.schedule('0 18 * * *', () => {
    console.log('🕕 Holiday cron triggered');
    checkAndSendHolidayReminders();
  }, {
    timezone: 'Asia/Kolkata'
  });

  console.log('✅ Holiday reminder cron started (6 PM IST)');
}

// ===============================
// MANUAL TRIGGER (TEST)
// ===============================
async function triggerManualHolidayReminder() {
  console.log('🔧 Manual holiday reminder triggered');
  await checkAndSendHolidayReminders();
}

module.exports = {
  startHolidayReminderScheduler,
  triggerManualHolidayReminder
};
