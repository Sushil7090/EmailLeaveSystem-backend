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

        const documentPaths = extractDocumentPaths(req.files);

        const project = await ClientProject.create({ ...req.body, documents: documentPaths });

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
        const { title, description, date } = req.body;
        if (!title) return res.status(400).json({ success: false, message: "Meeting title is required" });

        const project = await ClientProject.findById(req.params.id);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const documentPaths = extractDocumentPaths(req.files);

        const meetingDate = date ? new Date(date) : new Date();

        project.meetings.push({ title, description, documents: documentPaths, date: meetingDate });
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

        // Safe date parsing for project fields
        ['startDate', 'endDate', 'deadline'].forEach(field => {
            if (updateData[field]) {
                const parsedDate = new Date(updateData[field]);
                if (!isNaN(parsedDate.getTime())) {
                    updateData[field] = parsedDate;
                } else {
                    delete updateData[field]; // ignore invalid date
                }
            }
        });

        if (documentPaths.length > 0) {
            // Append documents instead of overwriting
            if (!updateData.documents) updateData.documents = [];
            updateData.documents.push(...documentPaths);
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
        const { title, description, date } = req.body;

        const project = await ClientProject.findById(projectId);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const meeting = project.meetings.id(meetingId);
        if (!meeting) return res.status(404).json({ success: false, message: "Meeting not found" });

        // Update title and description
        if (title) meeting.title = title;
        if (description) meeting.description = description;

        // Update date safely
        if (date) {
            let parsedDate = new Date(date);
            if (isNaN(parsedDate.getTime())) {
                const parts = date.includes("-") ? date.split("-") : date.split("/");
                if (parts.length === 3) {
                    parsedDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00.000Z`);
                }
            }

            if (!isNaN(parsedDate.getTime())) {
                meeting.date = parsedDate;
            } else {
                return res.status(400).json({ success: false, message: "Invalid date format" });
            }
        }

        // Update documents if uploaded
        const documentPaths = extractDocumentPaths(req.files);
        if (documentPaths.length > 0) {
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
