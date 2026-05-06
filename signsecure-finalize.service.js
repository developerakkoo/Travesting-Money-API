import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { db } from './firebase-admin.js';
import {
  createSignSecureClient,
  extractSignedDocumentUrl,
  getEnvelopeStatus,
  isEnvelopeSigningComplete,
} from './signsecure.client.js';

const JOBS_COLLECTION = 'signSecureEnvelopeJobs';

export function getSignSecureEnvConfig() {
  return {
    baseUrl: (process.env.SIGNSECURE_BASE_URL || '').replace(/\/$/, ''),
    token: process.env.SIGNSECURE_API_TOKEN || '',
    redirectUrl:
      process.env.SIGNSECURE_REDIRECT_URL || 'https://travesting-user.web.app/services',
    anchorText: process.env.SIGNSECURE_SIGN_ANCHOR_TEXT || 'Client Signature:',
    useSignSecure: process.env.USE_SIGNSECURE !== 'false',
  };
}

/**
 * @param {string} envelopeId
 * @param {{ userId: string, serviceId: string, paymentId?: string, orderId?: string }} job
 */
export async function saveEnvelopeJob(envelopeId, job) {
  await db.collection(JOBS_COLLECTION).doc(envelopeId).set({
    ...job,
    createdAt: new Date().toISOString(),
    status: 'awaiting_signature',
  });
}

/**
 * Fetch envelope from Sign Secure; if complete, download signed PDF, write disk, merge Firestore user agreementUrls.
 */
export async function finalizeEnvelopeIfReady(envelopeId) {
  const cfg = getSignSecureEnvConfig();
  if (!cfg.token || !cfg.baseUrl) {
    return { ok: false, error: 'Sign Secure not configured', statusCode: 503 };
  }

  const jobRef = db.collection(JOBS_COLLECTION).doc(envelopeId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) {
    return { ok: false, error: 'Unknown envelope job', statusCode: 404 };
  }
  const job = jobSnap.data();

  const client = createSignSecureClient({ baseUrl: cfg.baseUrl, token: cfg.token });
  const envRes = await client.getEnvelope(envelopeId);
  if (envRes.status !== 200) {
    const msg = envRes.data?.message || envRes.data?.error || `GET envelope failed (${envRes.status})`;
    return {
      ok: false,
      error: typeof msg === 'string' ? msg : JSON.stringify(msg),
      statusCode: envRes.status >= 400 ? envRes.status : 502,
    };
  }

  const envelopePayload = envRes.data;
  if (!isEnvelopeSigningComplete(envelopePayload)) {
    return {
      ok: true,
      pending: true,
      status: getEnvelopeStatus(envelopePayload),
    };
  }

  let pdfBuffer = null;

  const url = extractSignedDocumentUrl(envelopePayload);
  if (url) {
    const dl = await axios.get(url, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
      timeout: 120000,
      maxRedirects: 5,
    });
    if (dl.status === 200 && dl.data) {
      pdfBuffer = Buffer.from(dl.data);
    }
  }

  if (!pdfBuffer || pdfBuffer.length < 100) {
    const fallback = await client.tryDownloadSignedPdf(envelopeId);
    if (fallback?.buffer?.length) {
      pdfBuffer = fallback.buffer;
    }
  }

  if (!pdfBuffer || pdfBuffer.length < 100) {
    return {
      ok: false,
      error: 'Could not resolve signed PDF bytes',
      statusCode: 502,
    };
  }

  const uploadsDir = path.join(process.cwd(), 'uploads', 'agreements');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const timestamp = Date.now();
  const fileName = `agreement_${job.userId}_${job.serviceId}_${timestamp}.pdf`;
  const absolutePath = path.join(uploadsDir, fileName);
  fs.writeFileSync(absolutePath, pdfBuffer);

  const viewUrl = `/uploads/agreements/${fileName}`;
  const downloadUrl = viewUrl;

  await mergeSignedAgreementIntoUser(job.userId, {
    envelopeId,
    viewUrl,
    downloadUrl,
    fileName,
    serviceId: job.serviceId,
    paymentId: job.paymentId,
    orderId: job.orderId,
  });

  await jobRef.delete();

  return {
    ok: true,
    pending: false,
    data: { viewUrl, downloadUrl, fileName, envelopeId },
  };
}

async function mergeSignedAgreementIntoUser(uid, patch) {
  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error('User not found');
    const userData = snap.data();
    const agreements = [...(userData.agreementUrls || [])];
    const idx = agreements.findIndex((a) => a && a.envelopeId === patch.envelopeId);
    const signedAt = new Date();
    const row = {
      viewUrl: patch.viewUrl,
      downloadUrl: patch.downloadUrl,
      fileName: patch.fileName,
      generatedDate: signedAt,
      serviceId: patch.serviceId,
      paymentId: patch.paymentId,
      orderId: patch.orderId,
      envelopeId: patch.envelopeId,
      signingStatus: 'signed',
      signedAt,
    };
    if (idx >= 0) {
      agreements[idx] = { ...agreements[idx], ...row };
    } else {
      agreements.push(row);
    }
    tx.update(userRef, {
      agreementUrls: agreements,
      updatedAt: new Date(),
    });
  });
}
