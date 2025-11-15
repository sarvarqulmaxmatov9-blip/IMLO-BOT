const fs = require('fs');
const path = require('path');

const EXTRAINFOS_PATH = path.join(__dirname, 'extrainfos.json');
let cachedContent = null;

function loadExtraInfo() {
  if (cachedContent !== null) {
    return cachedContent;
  }

  if (fs.existsSync(EXTRAINFOS_PATH)) {
    try {
      cachedContent = fs.readFileSync(EXTRAINFOS_PATH, 'utf8');
    } catch (error) {
      console.warn('Unable to read extrainfos.json:', error.message);
      cachedContent = '';
    }
  } else {
    cachedContent = '';
  }

  return cachedContent;
}

function escapeHtml(text = '') {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchTerm(query) {
  if (!query || typeof query !== 'string') {
    return null;
  }

  const data = loadExtraInfo();
  if (!data) {
    return null;
  }

  const lowerData = data.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerData.indexOf(lowerQuery);
  if (index === -1) {
    return null;
  }

  const start = Math.max(0, index - 200);
  const end = Math.min(data.length, index + query.length + 400);
  let snippet = data.slice(start, end).trim();
  snippet = snippet.replace(/\s+/g, ' ');

  const queryRegex = new RegExp(escapeRegExp(query), 'gi');
  const sanitizedSnippet = escapeHtml(snippet);
  const highlighted = sanitizedSnippet.replace(queryRegex, (match) => `<b>${match}</b>`);

  const ellipsisStart = start > 0 ? '... ' : '';
  const ellipsisEnd = end < data.length ? ' ...' : '';

  return {
    term: query,
    snippet: highlighted,
    excerpt: `${ellipsisStart}${highlighted}${ellipsisEnd}`,
  };
}

module.exports = {
  searchTerm,
};
