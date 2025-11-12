const express = require("express");
const router = express.Router();
const EmailData = require("../models/emailModel");
const { authUser, requireAdmin } = require('../middlewares/userAuthMiddleware');

router.get("/allemails", authUser, requireAdmin, async (req, res) => {
  try {
    const emails = await EmailData.find().sort({ receivedAt: -1 });
    res.json(emails);
  } catch (err) {
    console.error("Error fetching emails:", err);
    res.status(500).json({ error: "Failed to fetch emails" });
  }
});

module.exports = router;