const userModel = require("../models/userModel");
const jwt = require("jsonwebtoken");

module.exports.authUser = async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "Unauthorized user" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWTSECRET); // 🔑 use JWTSECRET (same as in userModel)
        const user = await userModel.findById(decoded._id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        req.user = user;
        next();

    } catch (err) {
        return res.status(401).json({ message: "Unauthorized user" });
    }
};

module.exports.requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden: Admins only' });
    }
    next();
};