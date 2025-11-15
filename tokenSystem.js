const fs = require('fs');
const path = require('path');
const AIVerifier = require('./aiVerification');

const USERS_FILE = path.join(__dirname, 'users.json');

const analytics = require('./analytics');

const CONFIG = {
  INITIAL_TOKENS: Number(process.env.INITIAL_TOKENS || 50),
  TOKENS_PER_PAYMENT: Number(process.env.TOKENS_PER_PAYMENT || 50),
  PAYMENT_AMOUNT: process.env.PAYMENT_AMOUNT || '50000',
  CURRENCY: process.env.CURRENCY || 'UZS',
  PAYMENT_RECEIVER: process.env.PAYMENT_RECEIVER || 'Ochilova Ozoda',
  PAYMENT_CARD: process.env.PAYMENT_CARD || '4073 4200 6472 3764',
  PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || 'Uzcard'
};

CONFIG.PAYMENT_CARD_LAST4 =
  process.env.PAYMENT_CARD_LAST4 ||
  CONFIG.PAYMENT_CARD.replace(/\D/g, '').slice(-4);

const AMOUNT_NUMBER = Number(CONFIG.PAYMENT_AMOUNT.replace(/[^\d]+/g, '')) || CONFIG.TOKENS_PER_PAYMENT;
const aiVerifier = new AIVerifier(process.env.AI_API_KEY);

let users = {};
if (fs.existsSync(USERS_FILE)) {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    users = raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error('Error loading users data:', error.message);
    users = {};
  }
}

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function ensureUserExists(userId) {
  if (!users[userId]) {
    users[userId] = {
      tokens: CONFIG.INITIAL_TOKENS,
      paymentPending: false,
      pendingPaymentCode: null,
      transactions: [],
      joinDate: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      totalTokensUsed: 0,
      totalPayments: 0,
      totalTokensEarned: 0
    };
    saveUsers();
  }
  users[userId].lastActive = new Date().toISOString();
  return users[userId];
}

function getTokenBalance(userId) {
  return ensureUserExists(userId).tokens;
}

function useTokens(userId, count = 1) {
  const user = ensureUserExists(userId);
  if (user.tokens >= count) {
    user.tokens -= count;
    user.totalTokensUsed += count;
    recordTransaction(user, -count, 'usage');
    analytics.recordTokensSpent(count);
    saveUsers();
    return true;
  }
  return false;
}

function requestPayment(userId) {
  const user = ensureUserExists(userId);
  user.paymentPending = true;
  user.pendingPaymentCode = `PAY-${Date.now().toString(36).toUpperCase()}`;
  user.lastPaymentRequest = new Date().toISOString();
  saveUsers();
  analytics.recordPaymentRequest();

  return {
    amount: CONFIG.PAYMENT_AMOUNT,
    currency: CONFIG.CURRENCY,
    tokens: CONFIG.TOKENS_PER_PAYMENT,
    receiver: CONFIG.PAYMENT_RECEIVER,
    card: CONFIG.PAYMENT_CARD,
    cardLast4: CONFIG.PAYMENT_CARD_LAST4,
    paymentCode: user.pendingPaymentCode
  };
}

async function verifyPaymentWithAI(userId, imageUrl) {
  const user = ensureUserExists(userId);
  if (!user.paymentPending) {
    return { success: false, reason: 'No pending payment found.' };
  }

  const verification = await aiVerifier.verifyReceipt(
    imageUrl,
    Number(AMOUNT_NUMBER),
    CONFIG.CURRENCY,
    CONFIG.PAYMENT_CARD_LAST4,
    user.pendingPaymentCode
  );

  if (verification.valid && verification.confidence >= 60) {
    user.paymentPending = false;
    user.tokens += CONFIG.TOKENS_PER_PAYMENT;
    user.totalPayments += 1;
    user.totalTokensEarned += CONFIG.TOKENS_PER_PAYMENT;
    user.paymentReceipt = {
      url: imageUrl,
      confidence: verification.confidence,
      verifiedAt: new Date().toISOString()
    };
    recordTransaction(user, CONFIG.TOKENS_PER_PAYMENT, 'payment');
    saveUsers();
    analytics.recordPaymentSuccess();

    return {
      success: true,
      tokensAdded: CONFIG.TOKENS_PER_PAYMENT,
      newBalance: user.tokens,
      confidence: verification.confidence,
      reason: verification.reason
    };
  }

  return {
    success: false,
    confidence: verification.confidence,
    reason: verification.reason || 'Verification failed or amount mismatch.'
  };
}

function isPaymentPending(userId) {
  const user = ensureUserExists(userId);
  return user.paymentPending;
}

function recordTransaction(user, amount, type) {
  user.transactions = user.transactions || [];
  user.transactions.push({
    amount,
    type,
    timestamp: new Date().toISOString(),
    balanceAfter: user.tokens
  });
}

function getUserStats(userId) {
  const user = ensureUserExists(userId);
  return {
    balance: user.tokens,
    totalTokensUsed: user.totalTokensUsed,
    totalPayments: user.totalPayments,
    lastActive: user.lastActive
  };
}

function formatNumber(num) {
  if (typeof num !== 'number') return num;
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

module.exports = {
  getTokenBalance,
  useTokens,
  requestPayment,
  verifyPaymentWithAI,
  isPaymentPending,
  getUserStats,
  formatNumber,
  CONFIG
};
