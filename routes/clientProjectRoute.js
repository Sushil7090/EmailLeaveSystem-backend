const express = require("express");
const router = express.Router();

const {
    createProject,
    getAllProjects,
    getProjectById,
    addMeeting,
    editProject,
    editMeeting
} = require("../controllers/clientProjectController");

const { uploadProjectDocuments } = require("../middlewares/uploadMiddleware");

// Create project
router.post("/create", createProject);

// Get all projects
router.get("/", getAllProjects);

// Get single project
router.get("/:id", getProjectById);

// Add meeting
router.post(
    "/:id/add-meeting",
    uploadProjectDocuments.array("documents", 10),
    addMeeting
);

// Edit project
router.put(
    "/:id/edit",
    uploadProjectDocuments.array("documents", 10),
    editProject
);

// ⭐ EDIT MEETING
router.put(
    "/:projectId/meetings/:meetingId",
    uploadProjectDocuments.array("documents", 10),
    editMeeting
);

module.exports = router;
