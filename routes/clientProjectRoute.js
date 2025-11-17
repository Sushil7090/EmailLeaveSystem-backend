const express = require("express");
const router = express.Router();

const {
    createProject,
    getAllProjects,
    getProjectById,
    addMeeting
} = require("../controllers/clientProjectController");

const { uploadProjectDocuments } = require("../middlewares/uploadMiddleware");

// JWT / auth removed for client-project
router.post("/create", createProject);

router.get("/", getAllProjects);
router.get("/:id", getProjectById);

router.post(
    "/:id/add-meeting",
    uploadProjectDocuments.array("documents", 10),
    addMeeting
);

module.exports = router;


