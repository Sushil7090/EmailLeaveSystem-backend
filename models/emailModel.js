const mongoose = require('mongoose');

const emailDataSchema = new mongoose.Schema({
    employee: {
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

    // ✅ New field (Why admin rejected)
    rejectionReason: {
        type: String,
        default: "",
    },

    // ✅ New field (How many resubmissions)
    submissionCount: {
        type: Number,
        default: 0,
    },

    // ✅ New field (Track first/original request)
    originalRequestId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
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
        unique: true
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
    }
});

// Auto-update updatedAt on save
emailDataSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

const emailModel = mongoose.model("EmailData", emailDataSchema);

module.exports = emailModel;
