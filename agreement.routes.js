import { Router } from 'express';
import { uploadAgreement, deleteAgreement, getAgreementUrl } from './agreement.controller.js';
import { uploadSingleAgreementPDF } from './agreement-upload.middleware.js';

const router = Router();

// Upload agreement PDF
router.post('/upload', uploadSingleAgreementPDF, uploadAgreement);

// Delete agreement PDF
router.delete('/:fileName', deleteAgreement);

// Get agreement URL
router.get('/:fileName/url', getAgreementUrl);

export default router;

