const mongoose = require("mongoose");

// ✅ Meeting Schema with timestamps
const meetingSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    documents: [{ type: String }],
    date: { type: Date, default: Date.now }
}, { timestamps: true }); // createdAt + updatedAt automatically

// ✅ Client Project Schema with timestamps
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
        ref: "User"
    }
}, { timestamps: true }); // createdAt + updatedAt automatically

module.exports = mongoose.model("ClientProject", clientProjectSchema);
