import { Router } from 'express';
import { uploadBlogImage } from './blog.controller.js';
import { uploadSingleImage } from './blog-upload.middleware.js';

const router = Router();

// Upload blog image
router.post('/upload-image', uploadSingleImage, uploadBlogImage);

export default router;

