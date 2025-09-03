import { sandbox } from './sandboxClient.js';
import { z } from 'zod';
import razorpay from './razorpay.js';

export const initiatePayment = async (req, res, next) => {
    const { amount } = req.body;
    if (!amount) {
        return res
            .status(400)
            .json(
               {
                    status: 400,
                    data: null,
                    message: "Amount is required"
               }
            );
    }
    let options = {
        amount: amount,
        currency: "INR",
    };
    razorpay.orders.create(options, function (err, order) {
        console.log("ORDER: " + order);
        if (err) {
            return res.status(400).json({
                status: 400,
                data: null,
                message: "Amount is required"
            });
        }
        return res
            .status(201)
            .json(
                {
                    status: 201,
                    data: order,
                    message: "Order created successfully",
                }
            );
    });
}


// Per docs, body has @entity, flow, doc_types, redirect_url, consent_expiry, options. :contentReference[oaicite:10]{index=10}
const InitiateSchema = z.object({
  '@entity': z.string().default('in.co.sandbox.kyc.digilocker.session.request'),
  flow: z.enum(['signin', 'signup']).default('signin'),
  doc_types: z.array(z.string()).min(1).default(['aadhaar']),
  redirect_url: z.string().url(),
  consent_expiry: z.number().int().optional(), // epoch seconds (10 digits)
  options: z
    .object({
      pinless: z.boolean().optional(),          // signin only
      usernameless: z.boolean().optional(),     // signup only
      verified_mobile: z.string().optional(),   // signup only
      verification_method: z.array(z.string()).optional() // signup only
    })
    .optional()
});

export const initiateSession = async (req, res) => {
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const parsed = InitiateSchema.parse({
      ...req.body,
    });

    const client = await sandbox();
    const { data } = await client.post('/kyc/digilocker/sessions/init', parsed);
    // Response contains a DigiLocker redirect/consent URL for the user. :contentReference[oaicite:11]{index=11}
    res.json({ success: true, data });
  } catch (err) {
    const status = err?.response?.status || 400;
    res.status(status).json({
      success: false,
      error: err?.response?.data || err.message
    });
  }
};

export const getSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const client = await sandbox();
    const { data } = await client.get(`/kyc/digilocker/sessions/${encodeURIComponent(sessionId)}/status`);
    // Poll until status indicates docs ready. :contentReference[oaicite:12]{index=12}
    res.json({ success: true, data });
  } catch (err) {
    const status = err?.response?.status || 400;
    res.status(status).json({
      success: false,
      error: err?.response?.data || err.message
    });
  }
};

export const fetchDocument = async (req, res) => {
  try {
    const { sessionId, docType } = req.params;
    const client = await sandbox();
    // Examples for docType include aadhaar, pan, driving_license, etc. (accept any provided). :contentReference[oaicite:13]{index=13}
    const { data } = await client.get(
      `/kyc/digilocker/sessions/${encodeURIComponent(sessionId)}/documents/${encodeURIComponent(docType)}`
    );

    // Docs are temporarily stored (~1 hour); consume promptly. :contentReference[oaicite:14]{index=14}
    res.json({ success: true, data });
  } catch (err) {
    const status = err?.response?.status || 400;
    res.status(status).json({
      success: false,
      error: err?.response?.data || err.message
    });
  }
};
