const ClientProject = require("../models/clientProjectModel");

// Create project (without JWT)
exports.createProject = async (req, res) => {
    try {
        const project = await ClientProject.create({
            ...req.body
            // createdBy removed since no JWT
        });

        res.status(201).json({
            success: true,
            message: "Project created successfully",
            project
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get all projects
exports.getAllProjects = async (req, res) => {
    try {
        const projects = await ClientProject.find();
        res.status(200).json({ success: true, projects });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get single project by ID
exports.getProjectById = async (req, res) => {
    try {
        const project = await ClientProject.findById(req.params.id);

        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        res.status(200).json({ success: true, project });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Add meeting to project
exports.addMeeting = async (req, res) => {
    try {
        const project = await ClientProject.findById(req.params.id);

        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        let documentPaths = [];
        if (req.files) {
            documentPaths = req.files.map(f => "/uploads/" + f.filename);
        }

        project.meetings.push({
            title: req.body.title,
            description: req.body.description,
            documents: documentPaths
        });

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
