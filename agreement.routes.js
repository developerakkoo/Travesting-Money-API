import { Router } from 'express';
import { uploadAgreement, deleteAgreement, getAgreementUrl } from './agreement.controller.js';
import { uploadSingleAgreementPDF } from './agreement-upload.middleware.js';
import {
  signAndSendAgreement,
  completeEnvelope,
  signSecureWebhook,
} from './agreement-sign.controller.js';
import { uploadAgreementPdfMemory } from './agreement-sign.middleware.js';

const router = Router();

// Sign Secure: generate PDF on client → create envelope → S3 upload → send (Bearer server-side)
router.post('/sign/send', uploadAgreementPdfMemory, signAndSendAgreement);
router.post('/sign/complete/:envelopeId', completeEnvelope);
router.post('/sign/webhook', signSecureWebhook);

// Upload agreement PDF (legacy disk upload when not using Sign Secure)
router.post('/upload', uploadSingleAgreementPDF, uploadAgreement);

// Delete agreement PDF
router.delete('/:fileName', deleteAgreement);

// Get agreement URL
router.get('/:fileName/url', getAgreementUrl);

export default router;

