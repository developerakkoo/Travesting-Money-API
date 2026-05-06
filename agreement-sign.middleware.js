import multer from 'multer';

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const ALLOWED_PDF_TYPES = ['application/pdf'];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_PDF_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${ALLOWED_PDF_TYPES.join(', ')} are allowed.`), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_PDF_SIZE, files: 1 },
  fileFilter,
});

export const uploadAgreementPdfMemory = upload.single('pdf');
