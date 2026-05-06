import axios from 'axios';
import FormData from 'form-data';

/**
 * @param {{ baseUrl: string, token: string }} opts
 */
export function createSignSecureClient(opts) {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  const authHeaders = () => ({
    Authorization: `Bearer ${opts.token}`,
    'Content-Type': 'application/json',
  });

  /**
   * @param {Record<string, unknown>} body
   */
  async function createEnvelope(body) {
    return axios.post(`${baseUrl}/api/v1/envelopes`, body, {
      headers: authHeaders(),
      validateStatus: () => true,
    });
  }

  /**
   * Presigned S3 POST — success is typically HTTP 204 No Content.
   */
  async function uploadToPresignedPost(uploadUrl, fields, pdfBuffer, fileName = 'contract.pdf') {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields || {})) {
      form.append(key, String(value));
    }
    form.append('file', pdfBuffer, {
      filename: fileName,
      contentType: 'application/pdf',
    });

    return axios.post(uploadUrl, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
    });
  }

  async function sendEnvelope(envelopeId) {
    return axios.post(`${baseUrl}/api/v1/envelopes/${encodeURIComponent(envelopeId)}/send`, {}, {
      headers: authHeaders(),
      validateStatus: () => true,
    });
  }

  async function getEnvelope(envelopeId) {
    return axios.get(`${baseUrl}/api/v1/envelopes/${encodeURIComponent(envelopeId)}`, {
      headers: authHeaders(),
      validateStatus: () => true,
    });
  }

  /**
   * Fallback paths used by some e-sign APIs if GET envelope does not embed a URL.
   */
  async function tryDownloadSignedPdf(envelopeId) {
    const paths = [
      `/api/v1/envelopes/${encodeURIComponent(envelopeId)}/download`,
      `/api/v1/envelopes/${encodeURIComponent(envelopeId)}/signed-document`,
      `/api/v1/envelopes/${encodeURIComponent(envelopeId)}/documents/download`,
    ];
    for (const p of paths) {
      const res = await axios.get(`${baseUrl}${p}`, {
        headers: authHeaders(),
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
      if (res.status === 200 && res.data && res.data.byteLength > 0) {
        const ct = res.headers['content-type'] || '';
        if (ct.includes('application/pdf') || res.data.byteLength > 100) {
          return { buffer: Buffer.from(res.data), contentType: ct };
        }
      }
    }
    return null;
  }

  return {
    createEnvelope,
    uploadToPresignedPost,
    sendEnvelope,
    getEnvelope,
    tryDownloadSignedPdf,
  };
}

export function buildCreateEnvelopePayload({
  fileName,
  title,
  signerEmail,
  signerName,
  redirectUrl,
  anchorText,
  placement = {},
}) {
  return {
    fileName,
    title,
    recipients: [
      {
        email: signerEmail,
        name: signerName,
        order: 1,
        role: 'signer',
        signatureMethod: 'aadhaar_otp',
        signaturePlacement: {
          type: 'text',
          searchText: anchorText,
          position: placement.position ?? 'above',
          gap: placement.gap ?? 10,
          width: placement.width ?? 200,
          height: placement.height ?? 50,
        },
      },
    ],
    workflow: {
      mode: 'sequential',
      verificationMethod: 'link_only',
      redirectUrl,
    },
  };
}

/**
 * @param {unknown} envelopeJson — axios response.data or raw envelope object
 */
export function extractSignedDocumentUrl(envelopeJson) {
  let data = envelopeJson?.data !== undefined ? envelopeJson.data : envelopeJson;
  if (!data || typeof data !== 'object') return null;
  if (data.envelope && typeof data.envelope === 'object') {
    data = data.envelope;
  }

  if (typeof data.signedDocumentUrl === 'string') return data.signedDocumentUrl;
  if (typeof data.downloadUrl === 'string') return data.downloadUrl;
  if (data.document && typeof data.document.downloadUrl === 'string') {
    return data.document.downloadUrl;
  }
  if (Array.isArray(data.documents)) {
    for (const d of data.documents) {
      if (d && typeof d.downloadUrl === 'string') return d.downloadUrl;
      if (d && typeof d.signedUrl === 'string') return d.signedUrl;
      if (d && typeof d.url === 'string' && (d.status === 'signed' || d.type === 'signed')) {
        return d.url;
      }
    }
  }
  if (Array.isArray(data.files)) {
    for (const f of data.files) {
      if (f && typeof f.downloadUrl === 'string') return f.downloadUrl;
      if (f && typeof f.url === 'string') return f.url;
    }
  }
  return null;
}

export function getEnvelopeStatus(envelopeJson) {
  const data = envelopeJson?.data !== undefined ? envelopeJson.data : envelopeJson;
  if (!data || typeof data !== 'object') return null;
  if (data.status) return data.status;
  if (data.state) return data.state;
  if (data.envelope && typeof data.envelope === 'object' && data.envelope.status) {
    return data.envelope.status;
  }
  return null;
}

export function isEnvelopeSigningComplete(envelopeJson) {
  const s = String(getEnvelopeStatus(envelopeJson) || '').toLowerCase();
  return (
    s === 'completed'
    || s === 'complete'
    || s === 'signed'
    || s === 'closed'
    || s === 'done'
  );
}
