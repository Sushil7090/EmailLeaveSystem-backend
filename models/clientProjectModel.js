const mongoose = require("mongoose");

const meetingSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    documents: [{ type: String }], 
    date: { type: Date, default: Date.now }
});

const clientProjectSchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    clientName: { type: String, required: true },

    projectTitle: { type: String, required: true },
    projectDescription: { type: String, required: true },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    deadline: { type: Date },

    meetings: [meetingSchema],

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user"
    },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ClientProject", clientProjectSchema);
