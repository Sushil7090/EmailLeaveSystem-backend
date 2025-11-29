const mongoose = require('mongoose');

const emailDataSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: false,
    },

    // ⭐ Added for admin controller compatibility
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
        default: "Other",
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
        ref: "User", // admin who approved/rejected
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
        default: 0,
    },

    originalRequestId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
    },
    // ⭐ ADDITIONAL FIELDS END ⭐
});

// Auto-update timestamp
emailDataSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

const emailModel = mongoose.model("EmailData", emailDataSchema);

module.exports = emailModel;
