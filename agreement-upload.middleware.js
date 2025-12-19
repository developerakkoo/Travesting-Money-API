import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure file size limit (10MB for PDFs)
const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_PDF_TYPES = ['application/pdf'];

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads', 'agreements');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer to store files on disk
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: agreement_userId_serviceId_timestamp.pdf
    const userId = req.body.userId || 'unknown';
    const serviceId = req.body.serviceId || 'unknown';
    const timestamp = Date.now();
    const finalFileName = `agreement_${userId}_${serviceId}_${timestamp}.pdf`;
    cb(null, finalFileName);
  }
});

// File filter to only allow PDFs
const fileFilter = (req, file, cb) => {
  if (ALLOWED_PDF_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${ALLOWED_PDF_TYPES.join(', ')} are allowed.`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_PDF_SIZE,
    files: 1 // Only allow one file
  },
  fileFilter: fileFilter
});

// Middleware for single file upload with field name 'pdf'
const uploadSingleAgreementPDF = upload.single('pdf');

export { uploadSingleAgreementPDF, MAX_PDF_SIZE, ALLOWED_PDF_TYPES };

