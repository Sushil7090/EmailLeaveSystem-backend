const mongoose = require("mongoose");

// ✅ Meeting Schema (simplified, no meetingId)
const meetingSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    documents: [{ type: String }],
    date: { type: Date, default: Date.now }
});

// ✅ Client Project Schema
const clientProjectSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    clientName: { type: String, required: true },

    projectTitle: { type: String, required: true },
    projectDescription: { type: String, required: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    deadline: { type: Date },

    meetings: [meetingSchema],  // embedded meetings

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User" // check that your User model is named "User"
    },

    createdAt: { type: Date, default: Date.now }
});

// ✅ Export the model
module.exports = mongoose.model("ClientProject", clientProjectSchema);