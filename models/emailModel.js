const mongoose = require("mongoose");

const emailSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },

    subject: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    fromDate: {
      type: Date,
      required: true,
    },

    toDate: {
      type: Date,
      required: true,
    },

    leaveType: {
      type: String,
      enum: ["Sick Leave", "Casual Leave", "Paid Leave", "Unpaid Leave"],
      required: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },

    // Added: Reason why admin rejected the request
    rejectionReason: {
      type: String,
      default: "",
    },

    // Added: How many times employee has resubmitted
    submissionCount: {
      type: Number,
      default: 0, // First submission → 0 resubmits
    },

    // Added: For tracking original request on resubmission
    originalRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("EmailRequest", emailSchema);
