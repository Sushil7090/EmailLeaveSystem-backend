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
            employeeLeaveReason: { type: String, required: true },
            leaveType: { 
                type: String, 
                enum: ["Sick Leave", "Casual Leave", "Emergency Leave"],
                required: true 
            },
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
            startDate: { type: Date, required: true },
            endDate: { type: Date, required: true }
        }
    ],

    // ⭐⭐⭐ NEW FIELDS FOR LEAVE BALANCE TRACKING ⭐⭐⭐
    isPaid: {
        type: Boolean,
        default: true,
        required: true
    },

    balanceDeducted: {
        type: Number,
        default: 0,
        min: 0
    },

    deductedFrom: {
        type: String,
        enum: ["CL", "SL", "CL+SL", "Unpaid", ""],
        default: ""
    },

    leaveDays: {
        type: Number,
        default: 0,
        min: 0
    }
    // ⭐⭐⭐ END NEW FIELDS ⭐⭐⭐
});

// Auto-update timestamp
emailDataSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

const emailModel = mongoose.model("EmailData", emailDataSchema);

module.exports = emailModel;