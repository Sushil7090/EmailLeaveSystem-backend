const mongoose = require('mongoose');

const emailDataSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: false,
    },

    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: false,
    },

    employeeName: {
        type: String,
        required: true,
    },

    employeeEmail: {
        type: String,
        required: true,
        lowercase: true,
    },

    subject: {
        type: String,
        required: true,
    },

    leaveReason: {
        type: String,
        required: true,
    },

    leaveType: {
        type: String,
        enum: ["Sick Leave", "Casual Leave", "Emergency Leave"],
        required: true,
    },
    
    // ⭐⭐⭐ NEW: Half Day Support ⭐⭐⭐
    leaveDuration: {
        type: String,
        enum: ["Full Day", "Half Day"],
        default: "Full Day",
        required: true
    },

    halfDayType: {
        type: String,
        enum: ["First Half", "Second Half", ""],
        default: ""
    },
    // ⭐⭐⭐ END NEW ⭐⭐⭐
    
    startDate: {
        type: Date,
    },

    endDate: {
        type: Date,
    },

    status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending",
    },

    adminRemarks: {
        type: String,
        default: "",
    },

    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },

    reviewedAt: {
        type: Date,
    },

    rawEmailId: {
        type: String,
        unique: true,
    },

    attachments: [
        {
            filename: { type: String, required: true },
            mimetype: { type: String, required: true },
            size: { type: Number },
            path: { type: String, required: true },
            uploadedAt: { type: Date, default: Date.now }
        }
    ],

    receivedAt: {
        type: Date,
        default: Date.now,
    },

    updatedAt: {
        type: Date,
        default: Date.now,
    },

    // ⭐ ADDITIONAL FIELDS START ⭐
    rejectionReason: {
        type: String,
        default: "",
    },

    submissionCount: {
        type: Number,
        default: 1,
    },

    originalRequestId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
    },

    // ⭐⭐⭐ NEW: Full Rejection History ⭐⭐⭐
    rejectionHistory: [
        {
            rejectedAt: { type: Date, required: true },
            rejectedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true
            },
            rejectionReason: { type: String, required: true },
            adminRemarks: { type: String, default: "" },
            attemptNumber: { type: Number, required: true },

            // ⭐ Employee info snapshot
            employeeLeaveReason: { type: String, required: true },
            leaveType: { 
                type: String, 
                enum: ["Sick Leave", "Casual Leave", "Emergency Leave"],
                required: true 
            },
            
            // ⭐⭐⭐ NEW: Half Day in History ⭐⭐⭐
            leaveDuration: { 
                type: String, 
                enum: ["Full Day", "Half Day"], 
                required: true 
            },
            halfDayType: { 
                type: String, 
                enum: ["First Half", "Second Half", ""], 
                default: "" 
            },
            // ⭐⭐⭐ END NEW ⭐⭐⭐
            
            startDate: { type: Date, required: true },
            endDate: { type: Date, required: true }
        }
    ],
    // ⭐⭐⭐ END NEW FIELD ⭐⭐⭐

    // ⭐ ADDITIONAL FIELDS END ⭐
});

// Auto-update timestamp
emailDataSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

const emailModel = mongoose.model("EmailData", emailDataSchema);

module.exports = emailModel;