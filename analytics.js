const fs = require('fs');
const path = require('path');

const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');

const DEFAULT_STATS = {
  tokensSpent: 0,
  correctionsPerformed: 0,
  paymentRequests: 0,
  paymentSuccesses: 0,
  paymentFailures: 0,
  voiceSubmissions: 0,
  lastRubric: {
    Structure: null,
    Arguments: null,
    Language: null,
    badge: null
  },
  lastUpdated: null
};

let stats = null;

function loadStats() {
  if (stats) {
    return stats;
  }

  if (fs.existsSync(ANALYTICS_FILE)) {
    try {
      const raw = fs.readFileSync(ANALYTICS_FILE, 'utf8');
      stats = raw ? JSON.parse(raw) : { ...DEFAULT_STATS };
    } catch (error) {
      console.warn('Unable to read analytics file, resetting:', error.message);
      stats = { ...DEFAULT_STATS };
    }
  } else {
    stats = { ...DEFAULT_STATS };
  }

  if (!stats.lastUpdated) {
    stats.lastUpdated = new Date().toISOString();
  }

  return stats;
}

function saveStats() {
  if (!stats) {
    loadStats();
  }
  stats.lastUpdated = new Date().toISOString();
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(stats, null, 2));
}

function recordTokensSpent(count = 1) {
  const current = loadStats();
  current.tokensSpent += count;
  saveStats();
}

function recordCorrection() {
  const current = loadStats();
  current.correctionsPerformed += 1;
  saveStats();
}

function recordPaymentRequest() {
  const current = loadStats();
  current.paymentRequests += 1;
  saveStats();
}

function recordPaymentSuccess() {
  const current = loadStats();
  current.paymentSuccesses += 1;
  saveStats();
}

function recordPaymentFailure() {
  const current = loadStats();
  current.paymentFailures += 1;
  saveStats();
}

function recordVoiceSubmission() {
  const current = loadStats();
  current.voiceSubmissions += 1;
  saveStats();
}

function recordRubric(rubric = {}) {
  if (!rubric || typeof rubric !== 'object') {
    return;
  }

  const current = loadStats();
  current.lastRubric = {
    ...current.lastRubric,
    ...rubric
  };
  saveStats();
}

function getDashboardData() {
  const current = loadStats();
  const successRate = current.paymentRequests
    ? (current.paymentSuccesses / current.paymentRequests) * 100
    : null;

  return {
    tokensSpent: current.tokensSpent,
    correctionsPerformed: current.correctionsPerformed,
    paymentRequests: current.paymentRequests,
    paymentSuccesses: current.paymentSuccesses,
    paymentFailures: current.paymentFailures,
    voiceSubmissions: current.voiceSubmissions,
    paymentSuccessRate: successRate === null ? null : Number(successRate.toFixed(1)),
    lastUpdated: current.lastUpdated,
    lastRubric: current.lastRubric
  };
}

module.exports = {
  recordTokensSpent,
  recordCorrection,
  recordPaymentRequest,
  recordPaymentSuccess,
  recordPaymentFailure,
  recordVoiceSubmission,
  recordRubric,
  getDashboardData
};
