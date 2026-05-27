# Sign Secure integration — manual testing checklist

Use this after the API and app changes from the Sign Secure plan are implemented. Adjust endpoint paths and field names if your code differs.

## Prerequisites

- **Staging** Sign Secure base URL and **API token** (Bearer), e.g. `SIGNSECURE_BASE_URL`, `SIGNSECURE_API_TOKEN` in `.env` for [Travesting-Money-API](.).
- **`SIGNSECURE_REDIRECT_URL`** — full HTTPS URL where users return after signing (must match `workflow.redirectUrl` on create envelope; same host as your live user app).
- **Anchor text** — `signaturePlacement.searchText` must match a literal string in the generated PDF (e.g. `Client Signature:`); remove client tickmark image from PDF generation when using Sign Secure for signing.
- API running locally or on a dev host with `/uploads` static serving enabled (see `index.js`).
- A **test email** you control for the signer (Sign Secure will send signing links).
- Optional: **ngrok** (or similar) if you must test **webhooks** from Sign Secure to your local machine.

---

## 1. Environment and health

1. Copy `.env.example` additions (if any) and set `SIGNSECURE_BASE_URL`, `SIGNSECURE_API_TOKEN`, and optional `SIGNSECURE_REDIRECT_URL`.
2. Start the API: `node index.js` (or your start script).
3. `GET /health` → expect `OK`.

---

## 2. Direct Sign Secure API smoke test (Postman or curl)

Validates credentials and staging connectivity **without** your new routes.

1. **Create envelope** — `POST {BASE}/api/v1/envelopes` with Bearer token, JSON body (`fileName`, `title`, `recipients` with `signaturePlacement.searchText` matching your PDF, e.g. **`Client Signature:`** per server `SIGNSECURE_SIGN_ANCHOR_TEXT`, `workflow`).
2. Note `id` and `upload.url` / `upload.fields` from `201` response.
3. **Upload PDF** — multipart `POST` to `upload.url`: append each key/value from `upload.fields`, then form field `file` = the PDF (≤ 10MB). Expect **`204 No Content`** on success (no response body).
4. **Send envelope** — `POST {BASE}/api/v1/envelopes/{envelopeId}/send` with Bearer token and JSON body **`{}`** (empty object).
5. Open the signer **`actionUrl`** from the response (or email), complete signing in the **staging** flow you configured (`aadhaar_otp` vs `electronic`, etc.).
6. From Sign Secure docs/UI, obtain the **completed envelope** details and the **signed document download** mechanism (URL or API). Confirm you can download bytes that open as a PDF.

If any step fails, fix env/token/placement before testing your app integration.

---

## 3. Your API: send-for-signing flow

**Route:** `POST /api/agreements/sign/send` (multipart).

**Form fields:**

| Field | Required | Notes |
|-------|----------|--------|
| `pdf` | Yes | PDF file |
| `userId` | Yes | Firebase UID |
| `serviceId` | Yes | Service id |
| `signerEmail` | Yes | Signer email |
| `signerName` | Yes | Display name |
| `paymentId` | Recommended | Razorpay payment id |
| `orderId` | Optional | Razorpay order id |
| `title` | Optional | Agreement title |

1. Build or export a small test PDF (or use client-generated agreement bytes).
2. Call `POST {API_ORIGIN}/api/agreements/sign/send` with the fields above.
3. Expect **200** JSON `success: true`, `data.envelopeId`, `data.recipients[].actionUrl`.
4. Confirm server logs: create envelope → S3 upload (**204**) → send (**200**).
5. Complete signing via **`actionUrl`** as in section 2.

**Finalize (polling / manual refresh):** `POST /api/agreements/sign/complete/{envelopeId}` with JSON body `{}`. Returns **202** `{ pending: true }` until Sign Secure marks the envelope complete; **200** with `data.viewUrl` when the signed PDF was downloaded and stored under `uploads/agreements/`. The Angular app polls this while the user may still be on Sign Secure.

**Direct Sign Secure download URL:** `GET /api/agreements/sign/download/{envelopeId}`. Returns the presigned URL from Sign Secure's `/envelopes/{envelopeId}/file` endpoint, plus `expiresIn` and `fileName` when available. Use this if your frontend needs the temporary SignSecure-hosted link instead of the locally stored `/uploads/agreements/...` file.

**Proxy signed PDF download:** `GET /api/agreements/sign/file/{envelopeId}`. Streams the signed document through this API so the frontend can download the PDF directly without calling SignSecure itself.

**Webhook (optional):** `POST /api/agreements/sign/webhook` — JSON body must include `envelopeId` (or `id`). Set `SIGNSECURE_WEBHOOK_SECRET` and send the same value in header `x-webhook-secret` if configured.

---

## 4. Completion → signed file on disk

Depends on **webhook** and/or **polling** implementation.

### Webhook

1. Expose your webhook URL publicly (ngrok URL + path, e.g. `POST https://<host>/api/agreements/sign/webhook`).
2. Configure the same URL in Sign Secure dashboard if required.
3. After signing completes, watch API logs: webhook received → **download** signed PDF → **write** under `uploads/agreements/`.
4. On disk, open the saved PDF and confirm it is the **executed** document (signatures visible), not the original draft.

### Polling (if used instead or as backup)

1. Trigger or wait for your poller/job after signing.
2. Verify the same: file appears once under `uploads/agreements/` with expected naming pattern.

---

## 5. Firestore and “signed only” invariant

1. Open the user document in Firebase Console (or your admin tools).
2. Find the agreement entry tied to this purchase (`envelopeId` / `serviceId`).
3. **Before** completion: `signingStatus` should be `pending`; **`viewUrl` / `downloadUrl` should be absent** (or not user-facing), per product rule.
4. **After** completion: `signingStatus` → `signed`; `viewUrl` and `downloadUrl` point to `/uploads/agreements/<fileName>`; `fileName` matches the file on disk.

---

## 6. Static URL and admin UI

1. Compose full URL: `{apiOrigin}{viewUrl}` (e.g. `http://localhost:4000/uploads/agreements/agreement_….pdf`).
2. Open in browser (or `curl -O`) — PDF loads and matches signed file.
3. In **admin** app, open the same agreement for that user/subscription and confirm the viewer/download uses the **same** link and shows the **signed** PDF.
4. Confirm there is **no** separate stored link to an unsigned draft for that agreement.

---

## 7. End-to-end (Angular user app)

1. Run user app with **proxy** to API if used in dev (`proxy.conf.js`).
2. Trigger the real flow: purchase or test harness that calls `generateAndUploadAgreement` (or equivalent) after payment.
3. User should see pending signing UX until completion; after webhook/poll, refresh profile — agreement links appear only when signed.
4. Repeat with a second purchase to ensure filenames/envelope ids do not collide.

---

## 8. Failure and retry behavior

1. **Invalid PDF / oversize** — expect `400` from your API; nothing written under `uploads/agreements/` for that request.
2. **Sign Secure API error** — expect clear JSON error; no Firestore row claiming a final PDF (or row stays pending).
3. **Signing completed but download fails** — logs/alerts; retry path documented (manual re-fetch from Sign Secure if they expose it).

---

## 9. Production cutover (when ready)

1. Swap `SIGNSECURE_BASE_URL` and token to **production** credentials.
2. Re-run sections **2** (smoke) and **3–7** on a low-risk test user.
3. Confirm webhook URL is HTTPS and reachable from Sign Secure.

---

## Quick reference — routes from Postman collection

| Action | Method | Path pattern |
|--------|--------|----------------|
| Create envelope | POST | `{BASE}/api/v1/envelopes` |
| Send envelope | POST | `{BASE}/api/v1/envelopes/{envelopeId}/send` |

`BASE` is typically `https://api-stg.signpad.signsecure.in` for staging (confirm for production).
