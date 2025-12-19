import { Router } from 'express';
import {
  sendWhatsAppMessage,
  sendStockRecommendationMessage
} from './controller.js';

const r = Router();

r.post('/send', sendWhatsAppMessage);
r.post('/send-stock', sendStockRecommendationMessage);

export default r;

