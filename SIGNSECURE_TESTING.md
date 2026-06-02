# Sign Secure integration — manual testing checklist

Use this after the API and app changes from the Sign Secure plan are implemented.

## Prerequisites

- **Staging** Sign Secure: `SIGNSECURE_BASE_URL`, `SIGNSECURE_API_TOKEN` in `.env`.
- **`SIGNSECURE_REDIRECT_URL`** — e.g. `https://travesting-user.web.app/services?agreementSigned=1` (must match Angular `signSecureRedirectUrl` and create-envelope `workflow.redirectUrl`).
- **`SIGNSECURE_SIGN_ANCHOR_TEXT=Client Signature:`** — must match PDF text.
- Optional **`ADMIN_API_KEY`** — protects `GET /api/agreements/sign/file/:envelopeId` (header `x-admin-api-key` or query `adminKey`); set matching `adminApiKey` in Admin app environment.
- API serves `/uploads` statically; test signer email you control.

---

## 1. Environment and health

1. Copy [`.env.example`](.env.example) → `.env` and fill secrets.
2. Start API: `npm start` or `node index.js`.
3. `GET /health` → `OK`.

---

## 2. Sign Secure 3-step sequence (direct / Postman)

| Step | URL | Body | Success |
|------|-----|------|---------|
| 1 Create | `POST {BASE}/api/v1/envelopes` | JSON + Bearer; include `workflow.redirectUrl` | **201** → `id`, `upload.url`, `upload.fields` |
| 2 Upload | `POST upload.url` (S3) | multipart: all `upload.fields` + **`file`** (PDF) | **204** |
| 3 Send | `POST {BASE}/api/v1/envelopes/{id}/send` | `{}` + Bearer | **200** → `actionUrl`, `redirectTo` |

Verify `actionUrl` query `redirectTo` encodes your app URL (not `app.example.com`).

Signed file from Sign Secure: `GET {BASE}/api/v1/envelopes/{envelopeId}/file` (Bearer).

---

## 3. Travesting API: send-for-signing

**`POST /api/agreements/sign/send`** (multipart)

| Field | Required |
|-------|----------|
| `pdf` | Yes |
| `userId`, `serviceId`, `signerEmail`, `signerName` | Yes |
| `paymentId`, `orderId`, `title` | Optional |
| `redirectUrl` | Optional (overrides env; Angular sends `signSecureRedirectUrl`) |

1. Build or export a small test PDF (or use client-generated agreement bytes).
2. Call `POST {API_ORIGIN}/api/agreements/sign/send` with the fields above.
3. Expect **200** JSON `success: true`, `data.envelopeId`, `data.recipients[].actionUrl`.
4. Confirm server logs: create envelope → S3 upload (**204**) → send (**200**).
5. Complete signing via **`actionUrl`** as in section 2.

**Finalize (polling / manual refresh):** `POST /api/agreements/sign/complete/{envelopeId}` with JSON body `{}`. Returns **202** `{ pending: true }` until Sign Secure marks the envelope complete; **200** with `data.viewUrl` when the signed PDF was downloaded and stored under `uploads/agreements/`. The Angular app polls this while the user may still be on Sign Secure.

**Direct Sign Secure download URL:** `GET /api/agreements/sign/download/{envelopeId}`. Returns the presigned URL from Sign Secure's `/envelopes/{envelopeId}/file` endpoint, plus `expiresIn` and `fileName` when available.

**Proxy signed PDF download:** `GET /api/agreements/sign/file/{envelopeId}` (optional `x-admin-api-key` if `ADMIN_API_KEY` is set). Streams the signed document through this API so the admin app can view/download without calling Sign Secure directly.

**Webhook (optional):** `POST /api/agreements/sign/webhook` — JSON body must include `envelopeId` (or `id`). Set `SIGNSECURE_WEBHOOK_SECRET` and send the same value in header `x-webhook-secret` if configured.

---

## 4. User app: alert + signing tab + redirect

1. Complete a test purchase.
2. **Alert** appears: “Document signing required” with **Continue** / **Later**.
3. **Continue** opens Sign Secure tab (`actionUrl`) — must not be blocked (opens from button handler).
4. Complete email + OTP signing on Sign Secure.
5. Browser redirects to `SIGNSECURE_REDIRECT_URL` (e.g. `/services?agreementSigned=1`).
6. User app shows success toast on services page.
7. Firestore `agreementUrls[]` has `envelopeId`, `signingStatus: pending` then `signed` after poll.

**Finalize polling:** `POST /api/agreements/sign/complete/{envelopeId}` — **202** while pending, **200** when signed PDF saved to `uploads/agreements/`.

---

## 5. Admin: envelopeId + file proxy

1. Admin user list shows agreement **status badge** (Pending signature / Signed) and **envelopeId**.
2. **Pending** (or no local `viewUrl`): View/Download calls  
   `GET {API}/api/agreements/sign/file/{envelopeId}?disposition=inline|attachment`  
   with `x-admin-api-key` if `ADMIN_API_KEY` is set.
3. **Signed** with local `viewUrl`: View/Download uses `{API}/uploads/agreements/...` (faster).
4. PDF opens in browser or downloads.

**curl example (admin proxy):**

```bash
curl -H "x-admin-api-key: YOUR_KEY" \
  "https://api.travestingmoney.com/api/agreements/sign/file/ENVELOPE_ID?disposition=inline" \
  --output agreement.pdf
```

---

## 6. Firestore invariants

- Pending: `envelopeId`, `actionUrl`, `signingStatus: pending` — no final disk URLs required.
- Signed: `viewUrl` / `downloadUrl` under `/uploads/agreements/`, `signingStatus: signed`, `signedAt`.
- No unsigned PDF stored as the agreement artifact.

---

## 7. Failure cases

- Invalid PDF → **400**; nothing on disk.
- Sign Secure errors → clear JSON; Firestore stays pending.
- `/file` before signing complete → **404** from proxy; admin shows toast.
- Popup blocked → user must click **Continue** again (not auto-open).

---

## 8. Production cutover

1. Production `SIGNSECURE_BASE_URL` + token.
2. Production `SIGNSECURE_REDIRECT_URL` + Angular `signSecureRedirectUrl`.
3. Set **`ADMIN_API_KEY`** on API and Admin app before go-live.
4. Re-run sections 2–5 on staging, then prod smoke test.

---

## Quick reference — all routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agreements/sign/send` | POST | Create → S3 → send |
| `/api/agreements/sign/complete/:envelopeId` | POST | Poll finalize |
| `/api/agreements/sign/webhook` | POST | Webhook finalize |
| `/api/agreements/sign/file/:envelopeId` | GET | Admin PDF proxy → Sign Secure `/file` |
| Sign Secure create | POST | `/api/v1/envelopes` |
| Sign Secure send | POST | `/api/v1/envelopes/{id}/send` |
| Sign Secure file | GET | `/api/v1/envelopes/{id}/file` |
