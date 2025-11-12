const userModel = require('../models/userModel');
const crypto = require('crypto');
const { sendEmail } = require('../services/emailService');

module.exports.registerUser = async function (req, res) {
    try {
        const { firstname, middlename, lastname, email, mobile, password, confirmPassword, department, role } = req.body;

        if (!firstname || !middlename || !lastname || !email || !mobile || !password || !confirmPassword || !department) {
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
            department,
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

module.exports.userProfile = async function (req, res) {
    try {
        res.status(200).json({
            id: req.user._id,
            fullname: req.user.fullname,
            email: req.user.email,
            mobile: req.user.mobile,
            role: req.user.role,
            department: req.user.department,
            profilePhoto: req.user.profilePhoto || null
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports.logoutUser = async function (req, res) {
    try {
        res.clearCookie("token");
        res.status(200).json({ message: "Logout successful" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports.changePassword = async function (req, res) {
    try {
        const { currentPassword, newPassword, confirmNewPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmNewPassword) {
            return res.status(400).json({ message: "All password fields are required" });
        }

        // Check if new password and confirmation match
        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({ message: "New password confirmation does not match new password" });
        }

        const user = await userModel.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Verify current password
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({ message: "Current password is incorrect" });
        }

        // Check if new password is different from current password
        const isNewPasswordSame = await user.comparePassword(newPassword);
        if (isNewPasswordSame) {
            return res.status(400).json({ message: "New password must be different from current password" });
        }

        // Set new password and let model handle hashing/validation
        user.password = newPassword;
        user.confirmPassword = confirmNewPassword;

        await user.save();

        res.status(200).json({ message: "Password changed successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

module.exports.resetPassword = async function (req, res) {
    try {
        const { email, newPassword, confirmNewPassword } = req.body;

        if (!email || !newPassword || !confirmNewPassword) {
            return res.status(400).json({ message: "Email, new password, and confirmation are required" });
        }

        // Check if new password and confirmation match
        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({ message: "New password confirmation does not match new password" });
        }

        const user = await userModel.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if new password is different from current password
        const isNewPasswordSame = await user.comparePassword(newPassword);
        if (isNewPasswordSame) {
            return res.status(400).json({ message: "New password must be different from current password" });
        }

        // Set new password and let model handle hashing/validation
        user.password = newPassword;
        user.confirmPassword = confirmNewPassword;

        await user.save();

        res.status(200).json({ message: "Password reset successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Forgot password: create a reset token and (normally) email it to the user
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
            <p>You recently requested to reset your password. Click the button below to reset it. This link will expire in 10 minutes.</p>
            <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Reset Password</a></p>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>If you did not request a password reset, you can safely ignore this email.</p>
        `;
        try {
            await sendEmail({ to: user.email, subject, html, text: `Reset your password: ${resetUrl}` });
        } catch (mailErr) {
            // Even if email fails, don't leak existence. Provide generic response.
            console.error('Reset email send failed:', mailErr.message);
        }

        return res.status(200).json({ message: "If that email is registered, you'll receive a reset link" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Reset password with token
module.exports.resetPasswordWithToken = async function (req, res) {
    try {
        const { token } = req.params;
        const { newPassword, confirmNewPassword } = req.body;

        if (!token) return res.status(400).json({ message: "Token is required" });
        if (!newPassword || !confirmNewPassword) return res.status(400).json({ message: "New password and confirmation are required" });
        if (newPassword !== confirmNewPassword) return res.status(400).json({ message: "New password confirmation does not match new password" });

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const user = await userModel.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: new Date() }
        }).select('+passwordResetToken +passwordResetExpires');

        if (!user) return res.status(400).json({ message: "Token is invalid or has expired" });

        // Set new password; model will hash and validate via pre-save
        user.password = newPassword;
        user.confirmPassword = confirmNewPassword;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        res.status(200).json({ message: "Password has been reset successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Update user profile
module.exports.updateProfile = async function (req, res) {
    try {
        const { firstname, middlename, lastname, email, mobile } = req.body;

        const user = await userModel.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Check if email is being changed and if it's already taken
        if (email && email !== user.email) {
            const existingUser = await userModel.findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: 'Email already registered' });
            }
        }

        // Check if mobile is being changed and if it's already taken
        if (mobile && mobile !== user.mobile) {
            const existingUser = await userModel.findOne({ mobile });
            if (existingUser) {
                return res.status(400).json({ message: 'Mobile number already registered' });
            }
        }

        // Update fields if provided
        if (firstname) user.fullname.firstname = firstname;
        if (middlename) user.fullname.middlename = middlename;
        if (lastname) user.fullname.lastname = lastname;
        if (email) user.email = email;
        if (mobile) user.mobile = mobile;

        await user.save();

        res.status(200).json({ 
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                fullname: user.fullname,
                email: user.email,
                mobile: user.mobile,
                role: user.role,
                department: user.department,
                profilePhoto: user.profilePhoto
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Upload profile photo
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
