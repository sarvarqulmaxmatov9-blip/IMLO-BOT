/**
 * Uzbek Spelling Corrector using AI
 * This module uses AI API to correct spelling errors in Uzbek language
 */

const { OpenAI } = require('openai');
require('dotenv').config();

// Initialize OpenAI client with AIML API
const client = new OpenAI({
  baseURL: 'https://api.aimlapi.com/v1',
  apiKey: process.env.AI_API_KEY || '75f19011506e47e28bea3dc6a5738fd4',
});

/**
 * Corrects spelling in a given text using AI
 * @param {string} text - The text to correct
 * @returns {Promise<string>} - The corrected text
 */
async function correctSpelling(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  const trimmedText = text.trim();
  
  // Skip empty strings
  if (!trimmedText) {
    return text;
  }

  try {
    const response = await client.chat.completions.create({
      model: 'google/gemma-3n-e4b-it',
      messages: [
        {
          role: 'user',
          content: `Sen o'zbek tilidagi imlo (ortografiya) tuzatuvchi yordamchisisan. Foydalanuvchi yuborgan matndagi imlo xatolarini tuzatib, faqat to'g'ri yozilgan matnni qaytar. Faqat imlo xatolarini tuzat, matn mazmunini o'zgartirma. To'g'ri yozilgan matnni o'zgartirmaslik kerak. Faqat tuzatilgan matnni qaytar, boshqa izohlar berma. Matnning asl formatini (katta/kichik harflar, tinish belgilari) saqlab qol.

Misol: "Asalomu alaykum" -> "Assalomu alaykum"

Tuzatish kerak: "${trimmedText}"`
        }
      ],
      temperature: 0.7,
      top_p: 0.7,
      frequency_penalty: 1,
      max_tokens: 500,
      top_k: 50,
    });

    const corrected = response.choices[0].message.content.trim();
    
    // Remove any quotes if the AI wrapped the response in quotes
    const cleaned = corrected.replace(/^["']|["']$/g, '');
    
    // If the corrected text is the same or empty, return original
    if (!cleaned || cleaned === trimmedText) {
      return text;
    }
    
    return cleaned;
  } catch (error) {
    console.error('AI Spelling correction error:', error.message);
    // Fallback: return original text if AI fails
    return text;
  }
}

module.exports = {
  correctSpelling,
};
