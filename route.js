// route
import { Router } from 'express';
import {
  initiateSession,
  getSessionStatus,
  fetchDocument,
  initiatePayment
} from './controller.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();
const HOST = process.env.SANDBOX_ENV === 'live'
  ? 'https://api.sandbox.co.in'
  : 'https://test-api.sandbox.co.in';
  
  const r = Router();


  r.post('/payment/initiate', initiatePayment);


  
  r.post('/authenticate', async (req, res) => {
    try {
      const { SANDBOX_API_KEY, SANDBOX_API_SECRET } = process.env;
      if (!SANDBOX_API_KEY || !SANDBOX_API_SECRET) {
        return res.status(400).json({ success: false, error: 'Missing SANDBOX_API_KEY/SECRET' });
      }
  
      const { data } = await axios.post(`${HOST}/authenticate`, null, {
        headers: {
          'x-api-key': SANDBOX_API_KEY,     // required on Sandbox
          'x-api-secret': SANDBOX_API_SECRET // required only for /authenticate
        },
        timeout: 15000
      });
  
      // Sandbox returns a JWT string (or {access_token})
      const token = typeof data === 'string' ? data : (data?.access_token || data?.token || data);
      return res.json({ success: true, token });
    } catch (err) {
      return res.status(err?.response?.status || 500).json({
        success: false,
        error: err?.response?.data || err.message
      });
    }
  });
// POST /api/kyc/digilocker/sessions/init
r.post('/sessions/init', initiateSession);

// GET /api/kyc/digilocker/sessions/:sessionId/status
r.get('/sessions/:sessionId/status', getSessionStatus);

// GET /api/kyc/digilocker/sessions/:sessionId/documents/:docType
r.get('/sessions/:sessionId/documents/:docType', fetchDocument);

export default r;
