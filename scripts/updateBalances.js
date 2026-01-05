require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/userModel');

async function updateBalances() {
    try {
        // 🔌 Connect to MongoDB
        await mongoose.connect(process.env.DBCONNECT);

        console.log('📡 Connected to database');
        console.log('🔄 Starting balance migration...\n');

        // Current month in YYYY-MM format
        const currentMonth = new Date().toISOString().slice(0, 7);

        // 🔄 Update all employee users
        const result = await User.updateMany(
            { role: 'employee' },
            {
                $set: {
                    clBalance: 20,              // Casual Leave
                    slBalance: 5,               // Sick Leave
                    totalPaidLeaves: 25,        // 20 + 5
                    monthlyQuotaUsed: 0,        // Reset monthly usage
                    currentMonth: currentMonth,
                    carryForwardDays: 0,
                    lastMonthlyReset: new Date(),
                    leaveHistory: []
                }
            }
        );

        console.log('✅ Migration completed successfully!');
        console.log(`📊 Matched Employees: ${result.matchedCount}`);
        console.log(`✏️  Modified Employees: ${result.modifiedCount}\n`);

        // 🔍 Verification - show one sample employee
        const sample = await User.findOne({ role: 'employee' })
            .select('fullname clBalance slBalance monthlyQuotaUsed');

        if (sample) {
            console.log('📋 Sample Employee Balance:');
            console.log(
                `   Name: ${sample.fullname?.firstname || ''} ${sample.fullname?.lastname || ''}`
            );
            console.log(`   CL Balance: ${sample.clBalance} days`);
            console.log(`   SL Balance: ${sample.slBalance} days`);
            console.log(`   Monthly Quota Used: ${sample.monthlyQuotaUsed} days`);
        }

        console.log('\n✅ All done! You can now restart your server.\n');
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// ▶️ Run the migration
updateBalances();
