import axios from 'axios';
import {
  createSignSecureClient,
  buildCreateEnvelopePayload,
  extractEnvelopeDownloadInfo,
} from './signsecure.client.js';
import {
  getSignSecureEnvConfig,
  saveEnvelopeJob,
  finalizeEnvelopeIfReady,
} from './signsecure-finalize.service.js';

export function verifyAdminApiKey(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    return next();
  }
  const key = req.headers['x-admin-api-key'] || req.query.adminKey;
  if (key !== expected) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  return next();
}

function isJsonLikeContentType(contentType = '') {
  return /application\/json|text\/json|[\w.+-]+\/[\w.+-]+json/i.test(contentType);
}

function isTextLikeContentType(contentType = '') {
  return /^text\//i.test(contentType) || /application\/xml|application\/x-www-form-urlencoded/i.test(contentType);
}

async function readStreamToString(stream) {
  if (!stream) return '';
  let output = '';
  for await (const chunk of stream) {
    output += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  }
  return output;
}

function getFallbackDownloadFileName(envelopeId, info) {
  const rawName =
    info?.fileName
    || info?.filename
    || `agreement-${envelopeId}.pdf`;
  return String(rawName).replace(/[\\/:*?"<>|]/g, '_');
}

function getRequestedDisposition(req) {
  const value = String(req.query?.disposition || '').trim().toLowerCase();
  return value === 'inline' ? 'inline' : 'attachment';
}

function applyPdfHeaders(res, headers, fileName, disposition) {
  res.status(200);
  res.setHeader('Content-Type', headers?.['content-type'] || 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    headers?.['content-disposition'] || `${disposition}; filename="${fileName}"`,
  );
  if (headers?.['content-length']) {
    res.setHeader('Content-Length', headers['content-length']);
  }
  if (headers?.['cache-control']) {
    res.setHeader('Cache-Control', headers['cache-control']);
  }
}

async function proxySignSecureFileResponse(res, upstreamRes, envelopeId, info = null, disposition = 'attachment') {
  const contentType = String(upstreamRes.headers?.['content-type'] || '');

  if (isJsonLikeContentType(contentType) || isTextLikeContentType(contentType)) {
    const payloadText = await readStreamToString(upstreamRes.data);
    let parsed = null;

    if (payloadText) {
      try {
        parsed = JSON.parse(payloadText);
      } catch {
        parsed = null;
      }
    }

    const downloadInfo = extractEnvelopeDownloadInfo(parsed || payloadText) || info;
    const downloadUrl = downloadInfo?.url || null;

    if (downloadUrl) {
      const fileRes = await axios.get(downloadUrl, {
        responseType: 'stream',
        validateStatus: () => true,
        maxRedirects: 5,
        timeout: 120000,
      });

      if (fileRes.status !== 200) {
        const errText = await readStreamToString(fileRes.data);
        return res.status(fileRes.status >= 400 && fileRes.status < 600 ? fileRes.status : 502).json({
          success: false,
          error: 'Failed to download signed document from temporary URL',
          details: errText || null,
        });
      }

      const fallbackName = getFallbackDownloadFileName(envelopeId, downloadInfo);
      applyPdfHeaders(res, fileRes.headers, fallbackName, disposition);
      return fileRes.data.pipe(res);
    }

    return res.status(502).json({
      success: false,
      error: 'Sign Secure did not return a downloadable file',
      details: parsed || payloadText || null,
    });
  }

  const fallbackName = getFallbackDownloadFileName(envelopeId, info);
  applyPdfHeaders(res, upstreamRes.headers, fallbackName, disposition);

  return upstreamRes.data.pipe(res);
}

export async function signAndSendAgreement(req, res, next) {
  try {
    const cfg = getSignSecureEnvConfig();
    if (!cfg.useSignSecure) {
      return res.status(503).json({ success: false, error: 'Sign Secure is disabled' });
    }
    if (!cfg.token || !cfg.baseUrl) {
      return res.status(503).json({ success: false, error: 'Sign Secure is not configured' });
    }

    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ success: false, error: 'PDF file is required' });
    }

    const userId = String(req.body.userId ?? '').trim();
    const serviceId = String(req.body.serviceId ?? '').trim();
    const paymentId = String(req.body.paymentId ?? '').trim() || undefined;
    const orderId = String(req.body.orderId ?? '').trim() || undefined;
    const signerEmail = String(req.body.signerEmail ?? '').trim();
    const signerName = String(req.body.signerName ?? '').trim();
    const title = String(req.body.title ?? '').trim() || 'Service agreement';
    const redirectUrlBody = String(req.body.redirectUrl ?? '').trim();
    const redirectUrl = redirectUrlBody || cfg.redirectUrl;

    if (!userId || !serviceId || !signerEmail || !signerName) {
      return res.status(400).json({
        success: false,
        error: 'userId, serviceId, signerEmail, and signerName are required',
      });
    }

    if (!/^[a-zA-Z0-9]{20,}$/.test(userId)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID format' });
    }

    const fileName = `agreement_${userId}_${serviceId}.pdf`;
    const client = createSignSecureClient({ baseUrl: cfg.baseUrl, token: cfg.token });

    const payload = buildCreateEnvelopePayload({
      fileName,
      title,
      signerEmail,
      signerName,
      redirectUrl: redirectUrl,
      anchorText: cfg.anchorText,
    });

    const createRes = await client.createEnvelope(payload);
    if (createRes.status !== 201) {
      console.error('Sign Secure create envelope:', createRes.status, createRes.data);
      return res.status(createRes.status >= 400 && createRes.status < 600 ? createRes.status : 502).json({
        success: false,
        error: createRes.data?.message || 'Create envelope failed',
        details: createRes.data,
      });
    }

    const { id: envelopeId, upload } = createRes.data;
    if (!upload?.url || !upload?.fields) {
      return res.status(502).json({ success: false, error: 'Invalid create envelope response' });
    }

    const uploadRes = await client.uploadToPresignedPost(
      upload.url,
      upload.fields,
      file.buffer,
      fileName,
    );

    if (uploadRes.status !== 204 && uploadRes.status !== 200) {
      console.error('S3 upload failed:', uploadRes.status, uploadRes.data);
      return res.status(502).json({
        success: false,
        error: 'PDF upload to Sign Secure storage failed',
        uploadStatus: uploadRes.status,
      });
    }

    const sendRes = await client.sendEnvelope(envelopeId);
    if (sendRes.status !== 200) {
      console.error('Send envelope failed:', sendRes.status, sendRes.data);
      return res.status(sendRes.status >= 400 && sendRes.status < 600 ? sendRes.status : 502).json({
        success: false,
        error: sendRes.data?.message || 'Send envelope failed',
        details: sendRes.data,
      });
    }

    await saveEnvelopeJob(envelopeId, {
      userId,
      serviceId,
      paymentId,
      orderId,
    });

    return res.status(200).json({
      success: true,
      data: {
        envelopeId,
        ...sendRes.data,
      },
    });
  } catch (error) {
    console.error('signAndSendAgreement:', error);
    next(error);
  }
}

export async function completeEnvelope(req, res, next) {
  try {
    const cfg = getSignSecureEnvConfig();
    if (!cfg.useSignSecure) {
      return res.status(503).json({ success: false, error: 'Sign Secure is disabled' });
    }

    const envelopeId = req.params.envelopeId?.trim();
    if (!envelopeId) {
      return res.status(400).json({ success: false, error: 'envelopeId required' });
    }

    const result = await finalizeEnvelopeIfReady(envelopeId);

    if (!result.ok) {
      return res.status(result.statusCode || 500).json({
        success: false,
        error: result.error || 'Finalize failed',
      });
    }

    if (result.pending) {
      return res.status(202).json({
        success: true,
        pending: true,
        status: result.status,
      });
    }

    return res.status(200).json({
      success: true,
      pending: false,
      data: result.data,
    });
  } catch (error) {
    console.error('completeEnvelope:', error);
    next(error);
  }
}

export async function getSignSecureDownloadUrl(req, res, next) {
  try {
    const cfg = getSignSecureEnvConfig();
    if (!cfg.useSignSecure) {
      return res.status(503).json({ success: false, error: 'Sign Secure is disabled' });
    }
    if (!cfg.token || !cfg.baseUrl) {
      return res.status(503).json({ success: false, error: 'Sign Secure is not configured' });
    }

    const envelopeId = req.params.envelopeId?.trim();
    if (!envelopeId) {
      return res.status(400).json({ success: false, error: 'envelopeId required' });
    }

    const client = createSignSecureClient({ baseUrl: cfg.baseUrl, token: cfg.token });
    const downloadRes = await client.getEnvelopeDownloadUrl(envelopeId);

    if (downloadRes.status !== 200) {
      return res.status(downloadRes.status >= 400 && downloadRes.status < 600 ? downloadRes.status : 502).json({
        success: false,
        error: downloadRes.data?.message || downloadRes.data?.error || 'Download URL lookup failed',
        details: downloadRes.data,
      });
    }

    const info = extractEnvelopeDownloadInfo(downloadRes.data);
    if (!info?.url) {
      return res.status(502).json({
        success: false,
        error: 'Sign Secure did not return a download URL',
        details: downloadRes.data,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        envelopeId,
        ...info,
      },
    });
  } catch (error) {
    console.error('getSignSecureDownloadUrl:', error);
    next(error);
  }
}

export async function downloadSignSecureAgreementFile(req, res, next) {
  try {
    const cfg = getSignSecureEnvConfig();
    if (!cfg.useSignSecure) {
      return res.status(503).json({ success: false, error: 'Sign Secure is disabled' });
    }
    if (!cfg.token || !cfg.baseUrl) {
      return res.status(503).json({ success: false, error: 'Sign Secure is not configured' });
    }

    const envelopeId = req.params.envelopeId?.trim();
    if (!envelopeId) {
      return res.status(400).json({ success: false, error: 'envelopeId required' });
    }

    const client = createSignSecureClient({ baseUrl: cfg.baseUrl, token: cfg.token });
    const downloadRes = await client.downloadEnvelopeFile(envelopeId);
    const disposition = getRequestedDisposition(req);
    const fallbackName = getFallbackDownloadFileName(envelopeId);

    if (downloadRes.status !== 200) {
      const fallbackPdf = await client.tryDownloadSignedPdf(envelopeId);
      if (fallbackPdf?.buffer?.length) {
        applyPdfHeaders(res, { 'content-type': fallbackPdf.contentType }, fallbackName, disposition);
        return res.send(fallbackPdf.buffer);
      }

      const errText = await readStreamToString(downloadRes.data);
      return res.status(downloadRes.status >= 400 && downloadRes.status < 600 ? downloadRes.status : 502).json({
        success: false,
        error: errText || downloadRes.data?.message || downloadRes.data?.error || 'Download failed',
        details: errText || null,
      });
    }

    return proxySignSecureFileResponse(res, downloadRes, envelopeId, null, disposition);
  } catch (error) {
    console.error('downloadSignSecureAgreementFile:', error);
    next(error);
  }
}

export async function signSecureWebhook(req, res, next) {
  try {
    const cfg = getSignSecureEnvConfig();
    const secret = process.env.SIGNSECURE_WEBHOOK_SECRET;
    if (secret) {
      const hdr = req.headers['x-webhook-secret'] || req.headers['x-signsecure-signature'];
      if (hdr !== secret) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
    }

    const body = req.body || {};
    const envelopeId =
      body.envelopeId
      || body.id
      || body.envelope?.id
      || body.data?.envelopeId;

    if (!envelopeId || typeof envelopeId !== 'string') {
      return res.status(400).json({ success: false, error: 'envelopeId missing in webhook payload' });
    }

    if (!cfg.useSignSecure) {
      return res.status(200).json({ success: true, skipped: true });
    }

    const result = await finalizeEnvelopeIfReady(envelopeId.trim());

    if (!result.ok && result.statusCode === 404) {
      return res.status(200).json({ success: true, note: 'Job not found (ignored)' });
    }

    if (!result.ok) {
      return res.status(result.statusCode || 500).json({
        success: false,
        error: result.error,
      });
    }

    return res.status(200).json({
      success: true,
      pending: !!result.pending,
      data: result.data || null,
    });
  } catch (error) {
    console.error('signSecureWebhook:', error);
    next(error);
  }
}

