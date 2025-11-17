const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

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

function imageFileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image uploads are allowed'));
    }
}

const upload = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

module.exports.uploadSingleProfilePhoto = upload.single('photo');


// Allow common attachment types for leave requests (images, pdf, doc, docx, txt)
function attachmentFileFilter(req, file, cb) {
	if (
		file.mimetype.startsWith('image/') ||
		file.mimetype === 'application/pdf' ||
		file.mimetype === 'application/msword' ||
		file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
		file.mimetype === 'text/plain'
	) {
		cb(null, true);
	} else {
		cb(new Error('Unsupported attachment type'));
	}
}

const uploadLeaveAttachments = multer({
	storage,
	fileFilter: attachmentFileFilter,
	limits: { fileSize: 10 * 1024 * 1024 }
}).array('attachments', 5);

module.exports.uploadLeaveAttachments = uploadLeaveAttachments;

// For Client Project Documents (allow all file types)
const multerProjectDocs = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

module.exports.uploadProjectDocuments = multerProjectDocs;
