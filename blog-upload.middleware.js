import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure file size limit (5MB for images)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads', 'blog-images');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer to store files on disk
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp_originalname.ext
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const ext = path.extname(originalName);
    const nameWithoutExt = path.basename(originalName, ext);
    const finalFileName = `${timestamp}_${nameWithoutExt}${ext}`;
    cb(null, finalFileName);
  }
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${ALLOWED_IMAGE_TYPES.join(', ')} are allowed.`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1 // Only allow one file
  },
  fileFilter: fileFilter
});

// Middleware for single file upload with field name 'image'
const uploadSingleImage = upload.single('image');

export { uploadSingleImage, MAX_IMAGE_SIZE, ALLOWED_IMAGE_TYPES };

