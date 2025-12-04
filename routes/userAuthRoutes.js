const express = require('express');
const { authUser } = require('../middlewares/userAuthMiddleware');
const { uploadSingleProfilePhoto } = require('../middlewares/uploadMiddleware');
const userAuthController = require('../controllers/userAuthController');

const router = express.Router();

router.post('/register', userAuthController.registerUser);
router.post('/login', userAuthController.loginUser);
router.get('/profile', authUser, userAuthController.userProfile);
router.post('/change-password', authUser, userAuthController.changePassword);
router.post('/reset-password', userAuthController.resetPasswordWithToken);
router.post('/forgot-password', userAuthController.forgotPassword);
router.post('/reset-password/:token', userAuthController.resetPasswordWithToken);
router.post('/profile/photo', authUser, uploadSingleProfilePhoto, userAuthController.uploadProfilePhoto);
router.put('/profile', authUser, userAuthController.updateProfile);
router.get('/logout', userAuthController.logoutUser);

module.exports = router;
