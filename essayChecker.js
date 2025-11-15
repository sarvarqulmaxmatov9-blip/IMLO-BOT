const fs = require('fs');
const os = require('os');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const GEMINI_KEY = process.env.AI_API_KEY || '';

const ESSAY_SYSTEM_PROMPT = 'You are a professional Uzbek writing coach preparing students for national certification. Provide respectful, bilingual (Uzbek + English) feedback that highlights grammar, clarity, organization, argument strength, and stylistic tone expected on the sertifikat test. Be concise, mention what went well, and offer targeted suggestions to raise the essay to a perfect national-standard response.';

const buildTextReviewMessages = (essay) => [
  ESSAY_SYSTEM_PROMPT + '\n\n' +
  `Please review the following essay and return: (1) a 2-sentence summary, (2) grammar or spelling mistakes with corrections, (3) 1-2 concrete suggestions to improve clarity, and (4) a rubric section listing Structure, Arguments, and Language (each out of 10) plus a short badge line like "Badge: ★★★★☆".\n\nEssay:\n${essay}`
];

const buildImageReviewMessages = (imageUrl) => [
  {
    text: ESSAY_SYSTEM_PROMPT + '\n\n' + 'Please read the essay from the attached image and then do the same review steps as you would for typed text. Remember to provide the rubric and badge.'
  }
];

async function reviewEssay(essay) {
  if (!essay || typeof essay !== 'string') {
    throw new Error('Essay text is required');
  }

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [ { role: 'user', parts: [ { text: buildTextReviewMessages(essay) } ] } ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 600 }
    })
  });
  if (!res.ok) {
    return 'Essayni tahlil qilishda muammo yuz berdi.';
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Essayni tahlil qilishda muammo yuz berdi.';
}

async function reviewEssayImage(imageUrl) {
  if (!imageUrl) {
    throw new Error('Image URL is required');
  }

  const fileRes = await fetch(imageUrl);
  if (!fileRes.ok) {
    return 'Rasmni yuklashda muammo yuz berdi.';
  }
  const buf = await fileRes.buffer();
  const mime = fileRes.headers.get('content-type') || 'image/jpeg';
  const b64 = buf.toString('base64');
  const parts = [
    { text: buildImageReviewMessages(imageUrl).find((p) => p.text).text },
    { inlineData: { data: b64, mimeType: mime } }
  ];
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [ { role: 'user', parts } ], generationConfig: { temperature: 0.4, maxOutputTokens: 600 } })
  });
  if (!res.ok) {
    return 'Rasmli essayni tahlil qilishda muammo yuz berdi.';
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Rasmli essayni tahlil qilishda muammo yuz berdi.';
}

async function downloadToTemp(url) {
  const parsed = new URL(url);
  const extension = path.extname(parsed.pathname) || '.ogg';
  const filePath = path.join(os.tmpdir(), `essay-${Date.now()}${extension}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }
  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(filePath);
    response.body.pipe(fileStream);
    response.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
  return filePath;
}

async function transcribeVoice(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to download audio');
  }
  const buf = await response.buffer();
  const mime = response.headers.get('content-type') || 'audio/ogg';
  const b64 = buf.toString('base64');
  const parts = [
    { text: 'Transcribe the following audio into Uzbek text only.' },
    { inlineData: { data: b64, mimeType: mime } }
  ];
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [ { role: 'user', parts } ], generationConfig: { temperature: 0.1, maxOutputTokens: 400 } })
  });
  if (!res.ok) {
    throw new Error('Transcription failed');
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  return text;
}

function parseRubric(text = '') {
  const fields = ['Structure', 'Arguments', 'Language'];
  const result = {};
  for (const field of fields) {
    const match = text.match(new RegExp(`${field}:\s*(\d+(?:[.,]\d+)?)(?:/\d+)?`, 'i'));
    if (match) {
      result[field] = match[1].replace(',', '.');
    }
  }
  return result;
}

module.exports = {
  reviewEssay,
  reviewEssayImage,
  transcribeVoice,
  parseRubric,
};
