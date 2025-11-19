const multer = require('multer');
const path = require('path');
const fs = require('fs');
const multerS3 = require('multer-s3');
const AWS = require('aws-sdk');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure AWS S3 (if credentials are provided)
const s3 = process.env.AWS_ACCESS_KEY_ID ? new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
}) : null;

// Local disk storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '');
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${base}-${unique}${ext}`);
    }
});

// S3 storage configuration - Works with buckets that have ACLs disabled
const s3Storage = s3 ? multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: function (req, file, cb) {
        cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '');
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `uploads/${base}-${unique}${ext}`);
    }
}) : null;

// Use S3 if configured, otherwise use local storage
const storageEngine = s3 ? s3Storage : storage;

// Profile photo upload (images only)
const uploadSingleProfilePhoto = multer({
    storage: storageEngine,
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for profile photos'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).single('photo');

// Project documents upload (all file types)
const uploadProjectDocuments = multer({
    storage: storageEngine,
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// Leave attachments (specific file types)
const uploadLeaveAttachments = multer({
    storage: storageEngine,
    fileFilter: function (req, file, cb) {
        if (
            file.mimetype.startsWith('image/') ||
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/msword' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.mimetype === 'text/plain'
        ) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
}).array('attachments', 5);

module.exports = {
    uploadSingleProfilePhoto,
    uploadProjectDocuments,
    uploadLeaveAttachments
};