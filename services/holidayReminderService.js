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

        // Format holiday names
        const holidayNames = holidaysTomorrow.map(h => h.holidayName).join(', ');
        
        // Format holiday types
        const holidayTypes = [...new Set(holidaysTomorrow.map(h => h.holidayType))].join(', ');
        
        // Format date
        const holidayDate = new Date(holidaysTomorrow[0].holidayDate).toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

        // Email content - SIMPLE & PROFESSIONAL
        const emailContent = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Holiday Notice</title>
          </head>
          <body style="margin:0;padding:20px;background:#ffffff;font-family:Arial,sans-serif;">
              
              <div style="max-width:700px;margin:auto;padding:40px;line-height:1.6;">
                  
                  <p style="margin:0 0 20px 0;font-size:15px;color:#000000;">
                      Hello ${employeeName},
                  </p>

                  <p style="margin:0 0 20px 0;font-size:15px;color:#000000;">
                      We would like to inform you that the office will remain closed tomorrow in observance of ${holidayNames} under QHills Technology Pvt. Ltd.
                  </p>

                  <p style="margin:20px 0 5px 0;font-size:15px;color:#000000;">
                      <strong>Date:</strong> ${holidayDate}
                  </p>
                  <p style="margin:0 0 30px 0;font-size:15px;color:#000000;">
                      <strong>Type:</strong> ${holidayTypes}
                  </p>

                  <p style="margin:20px 0 10px 0;font-size:15px;color:#000000;">
                      All employees are requested to plan their work accordingly. Normal office operations will resume on the next working day.
                  </p>

                  <p style="margin:30px 0 20px 0;font-size:15px;color:#000000;">
                      We wish you a pleasant holiday.
                  </p>

                  <p style="margin:30px 0 5px 0;font-size:15px;color:#000000;">
                      Regards,<br/>
                      QHills Technology Pvt. Ltd.
                  </p>

                  <hr style="margin:40px 0 20px 0;border:none;border-top:1px solid #cccccc;" />

                  <p style="margin:0;font-size:13px;color:#666666;line-height:1.5;">
                      This is an automated email from the Leave Management System.
                  </p>

              </div>

          </body>
          </html>
        `;

        await sendEmail({
          to: employeeEmail,
          subject: 'Holiday Notice: Office Closed Tomorrow',
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