import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const {
  SANDBOX_API_KEY,
  SANDBOX_API_SECRET
} = process.env;

if (!SANDBOX_API_KEY || !SANDBOX_API_SECRET) {
  console.warn('⚠️  SANDBOX_API_KEY or SANDBOX_API_SECRET missing in .env');
}

const HOST = 'https://api.sandbox.co.in';

// simple in-memory token cache
let tokenCache = { token: null, exp: 0 };

async function fetchAccessToken() {
  // Authenticate: send key/secret as headers; token is NOT Bearer. :contentReference[oaicite:6]{index=6}
  const { data } = await axios.post(`${HOST}/authenticate`, null, {
    headers: {
      'x-api-key': SANDBOX_API_KEY,          // required on Sandbox APIs. :contentReference[oaicite:7]{index=7}
      'x-api-secret': SANDBOX_API_SECRET
    }
  });

  // API returns a JWT string; keep it raw for `authorization` (no Bearer). :contentReference[oaicite:8]{index=8}
  const token = typeof data === 'string' ? data : (data?.access_token || data?.token);
  if (!token) throw new Error('No token returned from /authenticate');

  // cache ~23h to be safe
  tokenCache = { token, exp: Date.now() + (23 * 60 * 60 * 1000) };
  return token;
}

export async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  return fetchAccessToken();
}

export async function sandbox() {
  const authorization = await getAccessToken();
  return axios.create({
    baseURL: HOST,
    headers: {
      // NOTE: raw JWT string, do NOT prefix with "Bearer". :contentReference[oaicite:9]{index=9}
      authorization,
      'x-api-key': SANDBOX_API_KEY,
      'Content-Type': 'application/json'
    },
    timeout: 20000
  });
}

export { HOST };
