import multer from 'multer';

// Configure file size and type limits
const MAX_FILE_SIZE = (process.env.MAX_FILE_SIZE_MB || 10) * 1024 * 1024; // 10MB default
const ALLOWED_MIME_TYPES = ['application/pdf'];

// Configure multer to store files in memory (we'll upload directly to Firebase)
const storage = multer.memoryStorage();

// File filter to only allow PDFs
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${ALLOWED_MIME_TYPES.join(', ')} are allowed.`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1 // Only allow one file
  },
  fileFilter: fileFilter
});

// Middleware for single file upload with field name 'pdf'
const uploadSinglePDF = upload.single('pdf');

export { uploadSinglePDF, MAX_FILE_SIZE, ALLOWED_MIME_TYPES };

