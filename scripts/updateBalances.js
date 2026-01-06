require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/userModel');

async function updateBalances() {
    try {
        // 🔌 Connect to MongoDB
        await mongoose.connect(process.env.DBCONNECT);

        console.log('📡 Connected to database');
        console.log('🔄 Starting balance migration with new tracking system...\n');

        // Current month in YYYY-MM format
        const currentMonth = new Date().toISOString().slice(0, 7);

        // 🔄 Update all employee users
        const result = await User.updateMany(
            { role: 'employee' },
            {
                $set: {
                    clBalance: 20,                      // Casual Leave
                    slBalance: 5,                       // Sick Leave
                    totalPaidLeaves: 25,                // 20 + 5
                    
                    // ✅ NEW TRACKING FIELDS
                    currentMonth: currentMonth,
                    currentMonthPaidFull: 0,            // 0/1
                    currentMonthPaidHalf: 0,            // 0/1
                    currentMonthUnpaidLeaves: 0,
                    
                    previousMonthBalanceFull: 0,        // Carry forward
                    previousMonthBalanceHalf: 0,        // Carry forward
                    
                    totalUnpaidLeaves: 0,
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
            .select('fullname clBalance slBalance currentMonthPaidFull currentMonthPaidHalf currentMonthUnpaidLeaves previousMonthBalanceFull previousMonthBalanceHalf totalUnpaidLeaves');

        if (sample) {
            console.log('📋 Sample Employee Balance:');
            console.log(`   Name: ${sample.fullname?.firstname || ''} ${sample.fullname?.lastname || ''}`);
            console.log(`   CL Balance: ${sample.clBalance} days`);
            console.log(`   SL Balance: ${sample.slBalance} days`);
            console.log(`   Current Month Paid Full: ${sample.currentMonthPaidFull}/1`);
            console.log(`   Current Month Paid Half: ${sample.currentMonthPaidHalf}/1`);
            console.log(`   Current Month Unpaid: ${sample.currentMonthUnpaidLeaves}`);
            console.log(`   Previous Month Balance Full: ${sample.previousMonthBalanceFull}`);
            console.log(`   Previous Month Balance Half: ${sample.previousMonthBalanceHalf}`);
            console.log(`   Total Unpaid (Lifetime): ${sample.totalUnpaidLeaves}`);
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