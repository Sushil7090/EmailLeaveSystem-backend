const ClientProject = require("../models/clientProjectModel");

// =============================
// Helper: Extract document paths
// =============================
const extractDocumentPaths = (files) => {
    return files?.map(f => {
        if (f.location) return f.location;       // S3 URL
        if (f.filename) return "/uploads/" + f.filename; // Local path
        return null;
    }).filter(Boolean) || [];
};

// =============================
// Create Project
// =============================
exports.createProject = async (req, res) => {
    try {
        const { title, description } = req.body;

        if (!title) {
            return res.status(400).json({ success: false, message: "Project title is required" });
        }

        const project = await ClientProject.create({ ...req.body });

        res.status(201).json({
            success: true,
            message: "Project created successfully",
            project
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// =============================
// Get All Projects
// =============================
exports.getAllProjects = async (req, res) => {
    try {
        const projects = await ClientProject.find();
        res.status(200).json({ success: true, projects });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// =============================
// Get Project by ID
// =============================
exports.getProjectById = async (req, res) => {
    try {
        const project = await ClientProject.findById(req.params.id);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        res.status(200).json({ success: true, project });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// =============================
// Add Meeting to Project
// =============================
exports.addMeeting = async (req, res) => {
    try {
        const { title, description } = req.body;
        if (!title) return res.status(400).json({ success: false, message: "Meeting title is required" });

        const project = await ClientProject.findById(req.params.id);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const documentPaths = extractDocumentPaths(req.files);

        project.meetings.push({ title, description, documents: documentPaths });
        await project.save();

        res.status(200).json({
            success: true,
            message: "Meeting added successfully",
            project
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// =============================
// Edit Project
// =============================
exports.editProject = async (req, res) => {
    try {
        const projectId = req.params.id;
        const documentPaths = extractDocumentPaths(req.files);

        const updateData = { ...req.body };
        if (documentPaths.length > 0) {
            // Append documents instead of overwriting
            updateData.$push = { documents: { $each: documentPaths } };
        }

        const updatedProject = await ClientProject.findByIdAndUpdate(projectId, updateData, { new: true });
        if (!updatedProject) return res.status(404).json({ success: false, message: "Project not found" });

        res.status(200).json({
            success: true,
            message: "Project updated successfully",
            project: updatedProject
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// =============================
// Edit Meeting
// =============================
exports.editMeeting = async (req, res) => {
    try {
        const { projectId, meetingId } = req.params;
        const { title, description } = req.body;

        const project = await ClientProject.findById(projectId);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const meeting = project.meetings.id(meetingId);
        if (!meeting) return res.status(404).json({ success: false, message: "Meeting not found" });

        if (title) meeting.title = title;
        if (description) meeting.description = description;

        const documentPaths = extractDocumentPaths(req.files);
        if (documentPaths.length > 0) {
            // Append new documents to existing
            meeting.documents.push(...documentPaths);
        }

        await project.save();

        res.status(200).json({
            success: true,
            message: "Meeting updated successfully",
            project
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
