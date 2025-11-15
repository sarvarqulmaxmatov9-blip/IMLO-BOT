const fetch = require('node-fetch');
require('dotenv').config();
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

class AIVerifier {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('AI_API_KEY is required for payment verification.');
    }
    this.apiKey = apiKey;
  }

  async verifyReceipt(imageUrl, amount, currency, cardLast4, paymentCode) {
    const systemMessage = `You are a payment verification assistant. Check whether the provided receipt shows a completed payment of ${amount} ${currency} to the card ending with ${cardLast4}. Mention the payment code ${paymentCode} if it's visible.`;
    const userMessage = `Receipt image: ${imageUrl}\n` +
      'Respond with valid JSON only, using the following schema:\n' +
      '{"valid": true/false, "amount": number, "currency": "string", "cardLast4": "string", "confidence": number (0-100), "reason": "text"}';

    try {
      const prompt = systemMessage + '\n\n' + userMessage;
      const res = await fetch(`${GEMINI_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [ { role: 'user', parts: [{ text: prompt }] } ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 500 }
        })
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
      const json = this._extractJson(raw);

      return {
        valid: json.valid === true,
        amount: typeof json.amount === 'number' ? json.amount : null,
        currency: json.currency || currency,
        cardLast4: json.cardLast4 || cardLast4,
        confidence: typeof json.confidence === 'number' ? json.confidence : 0,
        reason: json.reason || 'No additional reason provided'
      };
    } catch (error) {
      console.error('AI receipt verification error:', error.message);
      return {
        valid: false,
        amount: null,
        currency,
        cardLast4,
        confidence: 0,
        reason: 'AI verification failed. Please retry with a clearer receipt.'
      };
    }
  }

  _extractJson(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return {};
    }
    try {
      const snippet = text.slice(start, end + 1);
      return JSON.parse(snippet);
    } catch (error) {
      console.warn('Failed to parse verification JSON:', error.message);
      return {};
    }
  }
}

module.exports = AIVerifier;
