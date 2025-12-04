const userModel = require('../models/userModel');
const crypto = require('crypto');
const { sendEmail } = require('../services/emailService');

// ------------------ REGISTER USER ------------------
module.exports.registerUser = async function (req, res) {
    try {
        const { firstname, middlename, lastname, email, mobile, password, confirmPassword, role } = req.body;

        if (!firstname || !middlename || !lastname || !email || !mobile || !password || !confirmPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ message: "Password confirmation does not match password" });
        }

        // Check for existing user by email or mobile
        const existingUser = await userModel.findOne({ $or: [{ email }, { mobile }] });
        if (existingUser) {
            if (existingUser.email === email) return res.status(400).json({ message: "Email already registered" });
            if (existingUser.mobile === mobile) return res.status(400).json({ message: "Mobile already registered" });
        }

        const user = new userModel({
            fullname: { firstname, middlename, lastname },
            email,
            mobile,
            password,
            role: role && ["employee", "admin"].includes(role) ? role : undefined
        });

        user.confirmPassword = confirmPassword;

        await user.save();

        const token = user.generateUserToken();

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 24 * 60 * 60 * 1000
        });

        res.status(201).json({
            message: "User registered successfully",
            token,
            user: { id: user._id, email: user.email, mobile: user.mobile, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ------------------ LOGIN USER ------------------
module.exports.loginUser = async function (req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) return res.status(400).json({ message: "Email and password required" });

        const user = await userModel.findOne({ email });
        if (!user) return res.status(400).json({ message: "Invalid credentials" });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

        const token = user.generateUserToken();

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 24 * 60 * 60 * 1000
        });

        res.status(200).json({
            message: "Login successful",
            token,
            user: { id: user._id, email: user.email, mobile: user.mobile, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ------------------ USER PROFILE ------------------
module.exports.userProfile = async function (req, res) {
    try {
        res.status(200).json({
            id: req.user._id,
            fullname: req.user.fullname,
            email: req.user.email,
            mobile: req.user.mobile,
            role: req.user.role,
            profilePhoto: req.user.profilePhoto || null
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ------------------ LOGOUT ------------------
module.exports.logoutUser = async function (req, res) {
    try {
        res.clearCookie("token");
        res.status(200).json({ message: "Logout successful" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ------------------ CHANGE PASSWORD ------------------
module.exports.changePassword = async function (req, res) {
    try {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            return res.status(400).json({ message: "All password fields are required" });
        }

        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({ message: "New password confirmation does not match new password" });
        }

        const user = await userModel.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        const isNewPasswordSame = await user.comparePassword(newPassword);
        if (isNewPasswordSame) {
            return res.status(400).json({ message: "New password must be different from current password" });
        }

        user.password = newPassword;
        user.confirmPassword = confirmNewPassword;

        await user.save();

        res.status(200).json({ message: "Password changed successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ------------------ FORGOT PASSWORD ------------------
module.exports.forgotPassword = async function (req, res) {
    try {
        const { email } = req.body;

        if (!email) return res.status(400).json({ message: "Email is required" });

        const user = await userModel.findOne({ email }).select('+passwordResetToken +passwordResetExpires');
        if (!user) return res.status(200).json({ message: "If that email is registered, you'll receive a reset link" });

        const rawToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false });

        const resetUrl = `${process.env.FRONTEND_BASE_URL || 'http://localhost:8080'}/reset-password/${rawToken}`;
        const subject = 'Reset your DYP Company account password';
        const html = `
            <p>Hi ${user.fullname?.firstname || ''},</p>
            <p>You requested to reset your password. Click below to continue.</p>
            <p><a href="${resetUrl}">Reset Password</a></p>
        `;

        try {
            await sendEmail({ to: user.email, subject, html });
        } catch (err) {
            console.error("Email error:", err.message);
        }

        return res.status(200).json({ message: "If that email is registered, you'll receive a reset link" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ------------------ RESET PASSWORD WITH TOKEN ------------------
module.exports.resetPasswordWithToken = async function (req, res) {
    try {
        const { token } = req.params;
        const { newPassword, confirmNewPassword } = req.body;

        if (!token) return res.status(400).json({ message: "Token is required" });
        if (!newPassword || !confirmNewPassword) return res.status(400).json({ message: "All fields required" });
        if (newPassword !== confirmNewPassword) return res.status(400).json({ message: "Password does not match" });

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await userModel.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: new Date() }
        }).select('+passwordResetToken +passwordResetExpires');

        if (!user) return res.status(400).json({ message: "Token is invalid or expired" });

        user.password = newPassword;
        user.confirmPassword = confirmNewPassword;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        await user.save();

        res.status(200).json({ message: "Password reset successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ------------------ UPDATE PROFILE ------------------
module.exports.updateProfile = async function (req, res) {
    try {
        const { firstname, middlename, lastname, email, mobile } = req.body;

        const user = await userModel.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (email && email !== user.email) {
            const exist = await userModel.findOne({ email });
            if (exist) return res.status(400).json({ message: "Email already registered" });
        }

        if (mobile && mobile !== user.mobile) {
            const exist = await userModel.findOne({ mobile });
            if (exist) return res.status(400).json({ message: "Mobile already registered" });
        }

        if (firstname) user.fullname.firstname = firstname;
        if (middlename) user.fullname.middlename = middlename;
        if (lastname) user.fullname.lastname = lastname;
        if (email) user.email = email;
        if (mobile) user.mobile = mobile;

        await user.save();

        res.status(200).json({
            message: "Profile updated successfully",
            user: {
                id: user._id,
                fullname: user.fullname,
                email: user.email,
                mobile: user.mobile,
                role: user.role,
                profilePhoto: user.profilePhoto
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ------------------ UPLOAD PROFILE PHOTO ------------------
module.exports.uploadProfilePhoto = async function (req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const publicPath = `/uploads/${req.file.filename}`;

        const user = await userModel.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.profilePhoto = publicPath;
        await user.save({ validateBeforeSave: false });

        res.status(200).json({ message: 'Profile photo updated', profilePhoto: publicPath });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
