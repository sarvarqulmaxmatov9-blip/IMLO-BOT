/**
 * Uzbek Spelling Corrector using AI
 * This module uses AI API to correct spelling errors in Uzbek language
 */

const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
require('dotenv').config();

// Initialize OpenAI client with AIML API
const client = new OpenAI({
  baseURL: 'https://api.aimlapi.com/v1',
  apiKey: process.env.AI_API_KEY || '75f19011506e47e28bea3dc6a5738fd4',
});

const BIGGER_BASE_PATH = path.join(__dirname, 'biggerbase.json');
let dictionary = null;
let dictionaryIndex = null;
const WORD_REGEX = /[\p{L}’ʼ-]+/gu;

function getDictionaryPreview(limit = 80) {
  const dict = loadDictionary();
  return Array.from(dict)
    .slice(0, limit)
    .join(', ');
}

function loadDictionary() {
  if (dictionary) {
    return dictionary;
  }

  try {
    const raw = fs.readFileSync(BIGGER_BASE_PATH, 'utf8');
    dictionary = new Set(
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((word) => word.toLowerCase())
    );
  } catch (error) {
    console.warn('Unable to load biggerbase dictionary:', error.message);
    dictionary = new Set();
  }

  return dictionary;
}

function normalizeWord(word) {
  return word
    .replace(/^[^\p{L}’ʼ\-]+|[^\p{L}’ʼ\-]+$/gu, '')
    .toLowerCase();
}

function isTextAlreadyCorrect(text) {
  const dict = loadDictionary();
  if (!dict.size) {
    return false;
  }

  const words = text
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);

  if (!words.length) {
    return false;
  }

  return words.every((word) => dict.has(word));
}

function buildDictionaryIndex() {
  if (dictionaryIndex) {
    return dictionaryIndex;
  }

  const dict = loadDictionary();
  dictionaryIndex = new Map();

  for (const word of dict) {
    const key = word[0] || '#';
    if (!dictionaryIndex.has(key)) {
      dictionaryIndex.set(key, []);
    }
    dictionaryIndex.get(key).push(word);
  }

  return dictionaryIndex;
}

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, () => []);

  for (let i = 0; i <= b.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

function findBestSuggestion(word) {
  const index = buildDictionaryIndex();
  const firstChar = word[0] || '#';
  const candidates = index.get(firstChar) || [];

  let best = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    if (Math.abs(candidate.length - word.length) > 2) {
      continue;
    }

    const distance = levenshteinDistance(word, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
      if (bestDistance <= 1) {
        break;
      }
    }
  }

  if (!best) {
    return null;
  }

  return { word: best, distance: bestDistance };
}

function preserveCase(original, suggestion) {
  if (original === original.toUpperCase()) {
    return suggestion.toUpperCase();
  }

  if (original[0] === original[0].toUpperCase()) {
    return suggestion[0].toUpperCase() + suggestion.slice(1);
  }

  return suggestion;
}

function autoCorrectWithDictionary(text) {
  const dict = loadDictionary();
  if (!dict.size) {
    return null;
  }

  let corrected = false;
  const suggestions = [];

  const correctedText = text.replace(WORD_REGEX, (match) => {
    const normalized = normalizeWord(match);
    if (!normalized || dict.has(normalized)) {
      return match;
    }

    const suggestion = findBestSuggestion(normalized);
    if (!suggestion || suggestion.distance > 1) {
      return match;
    }

    suggestions.push({ original: match, suggestion: suggestion.word, distance: suggestion.distance });
    corrected = true;
    return preserveCase(match, suggestion.word);
  });

  if (!corrected) {
    return null;
  }

  return { correctedText, suggestions };
}

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

  if (isTextAlreadyCorrect(trimmedText)) {
    return text;
  }

  const dictionaryCorrection = autoCorrectWithDictionary(trimmedText);
  if (dictionaryCorrection) {
    return dictionaryCorrection.correctedText;
  }

  try {
    const dictionaryPreview = getDictionaryPreview();
    const response = await client.chat.completions.create({
      model: 'google/gemma-3n-e4b-it',
      messages: [
        {
          role: 'system',
          content: 'You have access to an Uzbek dictionary sourced from biggerbase.json. Prefer words from this dictionary whenever possible.'
        },
        {
          role: 'user',
          content: `Sen o'zbek tilidagi imlo (ortografiya) tuzatuvchi yordamchisisan. Foydalanuvchi yuborgan matndagi imlo xatolarini tuzatib, faqat to'g'ri yozilgan matnni qaytar. Faqat imlo xatolarini tuzat, matn mazmunini o'zgartirma. To'g'ri yozilgan matnni o'zgartirmaslik kerak. Faqat tuzatilgan matnni qaytar, boshqa izohlar berma. Matnning asl formatini (katta/kichik harflar, tinish belgilari) saqlab qol.

Dictionary sample: ${dictionaryPreview}

Misol: "Asalomu alaykum" -> "Assalomu alaykum"

Tuzatish kerak: "${trimmedText}`
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
    const status = error?.response?.status;
    const statusText = error?.response?.statusText;
    console.error('AI Spelling correction error:', status || '', statusText || '', error.message);
    return text;
  }
}

module.exports = {
  correctSpelling,
};
