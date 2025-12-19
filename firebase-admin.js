import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Firebase Admin SDK
let serviceAccount;
try {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 
    path.join(__dirname, 'firebase-service-account.json');
  
  const serviceAccountData = readFileSync(serviceAccountPath, 'utf8');
  serviceAccount = JSON.parse(serviceAccountData);
} catch (error) {
  console.error('Error loading Firebase service account:', error);
  throw new Error('Firebase service account file not found. Please check FIREBASE_SERVICE_ACCOUNT_PATH in .env');
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || 
    `${process.env.FIREBASE_PROJECT_ID || 'travestingmoney-5d9f9'}.firebasestorage.app`;
  const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: storageBucket,
    projectId: projectId
  });
  console.log('Firebase Admin SDK initialized successfully');
  console.log(`Storage Bucket: ${storageBucket}`);
  console.log(`Project ID: ${projectId}`);
}

// Get Storage bucket
const bucket = admin.storage().bucket();

export { admin, bucket };

