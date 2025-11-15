const fs = require('fs');
const os = require('os');
const path = require('path');
const { OpenAI } = require('openai');
require('dotenv').config();

const client = new OpenAI({
  apiKey: process.env.AI_API_KEY || '75f19011506e47e28bea3dc6a5738fd4',
});

const ESSAY_SYSTEM_PROMPT = 'You are a professional Uzbek writing coach preparing students for national certification. Provide respectful, bilingual (Uzbek + English) feedback that highlights grammar, clarity, organization, argument strength, and stylistic tone expected on the sertifikat test. Be concise, mention what went well, and offer targeted suggestions to raise the essay to a perfect national-standard response.';

const buildTextReviewMessages = (essay) => [
  {
    role: 'system',
    content: ESSAY_SYSTEM_PROMPT
  },
  {
    role: 'user',
    content: `Please review the following essay and return: (1) a 2-sentence summary, (2) grammar or spelling mistakes with corrections, (3) 1-2 concrete suggestions to improve clarity, and (4) a rubric section listing Structure, Arguments, and Language (each out of 10) plus a short badge line like "Badge: ★★★★☆".

Essay:
${essay}`
  }
];

const buildImageReviewMessages = (imageUrl) => [
  {
    role: 'system',
    content: ESSAY_SYSTEM_PROMPT
  },
  {
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: 'Please read the essay from the attached image and then do the same review steps as you would for typed text. Remember to provide the rubric and badge.'
      },
      {
        type: 'input_image',
        image_url: imageUrl
      }
    ]
  }
];

async function reviewEssay(essay) {
  if (!essay || typeof essay !== 'string') {
    throw new Error('Essay text is required');
  }

  const response = await client.chat.completions.create({
    model: process.env.ESSAY_MODEL || 'gpt-4o-mini',
    messages: buildTextReviewMessages(essay),
    temperature: 0.4,
    max_tokens: 600,
    top_p: 0.9
  });

  return response.choices?.[0]?.message?.content?.trim() || 'Essayni tahlil qilishda muammo yuz berdi.';
}

async function reviewEssayImage(imageUrl) {
  if (!imageUrl) {
    throw new Error('Image URL is required');
  }

  const response = await client.chat.completions.create({
    model: process.env.ESSAY_MODEL || 'gpt-4o-mini',
    messages: buildImageReviewMessages(imageUrl),
    temperature: 0.4,
    max_tokens: 600,
    top_p: 0.9
  });

  return response.choices?.[0]?.message?.content?.trim() || 'Rasmli essayni tahlil qilishda muammo yuz berdi.';
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
  const filePath = await downloadToTemp(url);
  try {
    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: process.env.SPEECH_MODEL || 'gpt-4o-mini-transcribe'
    });

    return transcription.text;
  } finally {
    fs.unlink(filePath, () => {});
  }
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
