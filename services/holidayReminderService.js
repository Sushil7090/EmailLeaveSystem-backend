const cron = require('node-cron');
const HolidayCalendar = require('../models/holidayCalendarModel');
const User = require('../models/userModel');
const { sendEmail } = require('./emailService');

// Function to check and send holiday reminders
async function checkAndSendHolidayReminders() {
  try {
    console.log('🎉 Running holiday reminder check...');

    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    // Find all active holidays for tomorrow
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

    // Get all active employees
    const employees = await User.find({ 
      role: { $in: ['employee', 'admin'] }
    }).select('email fullname');

    console.log(`👥 Sending reminders to ${employees.length} employees`);

    // Send reminder to each employee
    for (const employee of employees) {
      try {
        const employeeName = employee.fullname || 'Team Member';
        const employeeEmail = employee.email;

        // Build holiday list HTML
        const holidayListHTML = holidaysTomorrow.map(holiday => `
          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 5px;">
            <h3 style="margin: 0 0 10px 0; color: #856404;">🎉 ${holiday.holidayName}</h3>
            <p style="margin: 5px 0; color: #856404;">
              <strong>Type:</strong> ${holiday.holidayType}
            </p>
            <p style="margin: 5px 0; color: #856404;">
              <strong>Date:</strong> ${new Date(holiday.holidayDate).toLocaleDateString('en-IN', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
            ${holiday.description ? `
            <p style="margin: 10px 0 5px 0; color: #856404;">
              <strong>About:</strong> ${holiday.description}
            </p>
            ` : ''}
          </div>
        `).join('');

        const emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: #FF6B6B; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
              <h2 style="margin: 0;">🎊 Holiday Tomorrow!</h2>
            </div>
            
            <div style="background-color: white; padding: 30px; border-radius: 0 0 5px 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <p style="font-size: 16px; color: #333;">Dear <strong>${employeeName}</strong>,</p>
              
              <p style="font-size: 16px; color: #333;">
                This is a friendly reminder that <strong>tomorrow is a holiday</strong> and the office will be closed.
              </p>
              
              ${holidayListHTML}
              
              <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 5px;">
                <p style="margin: 0; color: #155724;">
                  <strong>✅ Enjoy your day off!</strong>
                </p>
                <ul style="margin: 10px 0; padding-left: 20px; color: #155724;">
                  <li>No need to come to the office tomorrow</li>
                  <li>Spend quality time with family and friends</li>
                  <li>Relax and rejuvenate</li>
                  <li>See you on the next working day!</li>
                </ul>
              </div>
              
              <p style="font-size: 16px; color: #333;">Have a wonderful holiday! 🌟</p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #999; margin: 5px 0;">
                  This is an automated notification from <strong>QHills Technology Pvt. Ltd</strong> Leave Management System.
                </p>
                <p style="font-size: 12px; color: #999; margin: 5px 0;">
                  For any queries, please contact HR or Admin.
                </p>
              </div>
            </div>
          </div>
        `;

        await sendEmail({
          to: employeeEmail,
          subject: '🎊 Holiday Reminder: Office Closed Tomorrow',
          html: emailContent
        });

        console.log(`✅ Holiday reminder sent to ${employeeEmail}`);
      } catch (emailError) {
        console.error(`❌ Failed to send holiday reminder to ${employee.email}:`, emailError.message);
      }
    }

    console.log('✅ Holiday reminder check completed');
  } catch (error) {
    console.error('❌ Error in holiday reminder check:', error);
  }
}

// Function to start the holiday reminder scheduler
function startHolidayReminderScheduler() {
  // Schedule to run every day at 6:00 PM IST
  const cronSchedule = '0 18 * * *'; // 6 PM every day

  cron.schedule(cronSchedule, () => {
    console.log('🕐 Holiday reminder scheduler triggered at:', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));
    checkAndSendHolidayReminders();
  }, {
    timezone: "Asia/Kolkata" // IST timezone
  });

  console.log('✅ Holiday reminder scheduler started successfully');
  console.log(`🎉 Holiday reminders will be sent daily at 6:00 PM IST`);

  // Optional: Run immediately on startup if env var is set
  if (process.env.SEND_HOLIDAY_REMINDER_ON_START === 'true') {
    console.log('🚀 Running initial holiday reminder check on startup...');
    checkAndSendHolidayReminders();
  }
}

// Function to manually trigger holiday reminders (for testing)
async function triggerManualHolidayReminder() {
  console.log('🔧 Manual holiday reminder triggered...');
  await checkAndSendHolidayReminders();
}

module.exports = {
  startHolidayReminderScheduler,
  triggerManualHolidayReminder
};