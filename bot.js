const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const analytics = require('./analytics');
const searchInfo = require('./searchInfo');
const { correctSpelling } = require('./spellChecker');
const { reviewEssay, reviewEssayImage, transcribeVoice } = require('./essayChecker');
const {
  getTokenBalance,
  useTokens,
  requestPayment,
  verifyPaymentWithAI,
  isPaymentPending,
  formatNumber,
  awardBadge,
  getLeaderboard,
  CONFIG
} = require('./tokenSystem');
require('dotenv').config();

const ESSAY_TOKEN_COST = Number(process.env.ESSAY_TOKEN_COST || 3);

// Get bot token from environment variables
const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('Error: BOT_TOKEN is not set in environment variables!');
  console.error('Please create a .env file with BOT_TOKEN=your_token_here');
  process.exit(1);
}

// Check if token is still the placeholder
if (token === 'your_bot_token_here' || token.includes('your_bot_token')) {
  console.error('❌ Error: BOT_TOKEN is still set to placeholder value!');
  console.error('');
  console.error('Please update your .env file with a real bot token:');
  console.error('1. Open Telegram and search for @BotFather');
  console.error('2. Send /newbot to create a new bot (or /token to get existing bot token)');
  console.error('3. Copy the token you receive');
  console.error('4. Edit the .env file and replace "your_bot_token_here" with your actual token');
  console.error('');
  console.error('Example: BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
  process.exit(1);
}

// Create a bot instance
const bot = new TelegramBot(token, {
  polling: process.env.NODE_ENV !== 'production'
});

// Set up webhook for production
if (process.env.NODE_ENV === 'production') {
  const webhookUrl = process.env.WEBHOOK_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
  const webhookPath = `/bot${token}`;

  bot.setWebHook(webhookUrl + webhookPath);

  const app = express();
  app.use(express.json());

  app.post(webhookPath, async (req, res) => {
    try {
      await bot.processUpdate(req.body);
      res.sendStatus(200);
    } catch (error) {
      console.error('Webhook processing error:', error);
      res.sendStatus(500);
    }
  });

  const dashboardSecret = process.env.DASHBOARD_SECRET || 'imlo-dashboard';
  app.get('/dashboard', (req, res) => {
    if (req.query.secret !== dashboardSecret) {
      return res.status(403).send('Forbidden');
    }

    const data = analytics.getDashboardData();
    res.send(`
      <html>
        <head>
          <title>IMLO-BOT Analytics</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 1.5rem; background: #f7f7f7; }
            h1 { margin-bottom: 0.5rem; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #ddd; }
            th { background: #1e3a8a; color: white; }
            .value { font-weight: bold; }
            .muted { color: #555; }
          </style>
        </head>
        <body>
          <h1>Usage Analytics Dashboard</h1>
          <p class="muted">Last updated: ${data.lastUpdated}</p>
          <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Tokens Spent</td><td class="value">${data.tokensSpent}</td></tr>
            <tr><td>Corrections Performed</td><td class="value">${data.correctionsPerformed}</td></tr>
            <tr><td>Voice Submissions</td><td class="value">${data.voiceSubmissions}</td></tr>
            <tr><td>Payment Requests</td><td class="value">${data.paymentRequests}</td></tr>
            <tr><td>Payment Successes</td><td class="value">${data.paymentSuccesses}</td></tr>
            <tr><td>Payment Failures</td><td class="value">${data.paymentFailures}</td></tr>
            <tr><td>Payment Success Rate</td><td class="value">${data.paymentSuccessRate ?? 'N/A'}%</td></tr>
          </table>
          <script id="analytics-json" type="application/json">
            {"lastRubric": ${JSON.stringify(data.lastRubric)}}
          </script>
        </body>
      </html>
    `);
  });

  app.get('/', (req, res) => {
    res.send('IMLO-BOT is running!');
  });

  app.get('/leaderboard', (req, res) => {
    if (req.query.secret !== dashboardSecret) {
      return res.status(403).send('Forbidden');
    }

    res.json(getLeaderboard(10));
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

console.log('Bot is running...');

const formatTokens = (count) => formatNumber(count) + ' ta token';

const COMMAND_KEYBOARD = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '🆘help', callback_data: 'cmd_help' },
        { text: '💎balance', callback_data: 'cmd_balance' }
      ],
      [
        { text: '💳buy', callback_data: 'cmd_buy' },
        { text: 'ℹ️about', callback_data: 'cmd_about' }
      ],
      [
        { text: '📝essay', callback_data: 'cmd_essay' },
        { text: '🔎info', callback_data: 'cmd_info' }
      ]
    ]
  }
};

function getHelpMessage() {
  return `🤖 Bot buyruqlari:
/start - Botni qayta ishga tushurish
/balance - Tokenlar soni
/buy - Token sotib olish uchun ko'rsatmalar
/about - Bot haqida
/info <so'z> - Qo'shimcha ma'lumot qidirish (extrainfos.json)
📦 Matn yuboring va imlo xatolari avtomatik tuziladi. Har bir so'rov 1 tokenni ishlatadi.`;
}

function getAboutMessage() {
  return `ℹ️ IMLO-BOT - o'zbek tilida imlo xatolarini avtomatik tuzatadigan Telegram boti.
AI yordamida yuborilgan matnni tuzatadi va to'g'ri javobni qaytaradi.`;
}

function formatInfoMessage(term, data) {
  if (!term) {
    return "🔍 info <so'z> bilan izlashni boshlang. Misol: /info tashbeh";
  }

  if (!data) {
    return `⚠️ "${term}" uchun qo'shimcha ma'lumot topilmadi.`;
  }

  return `📚 <b>${term}</b> uchun ma'lumot:\n${data.snippet}`;
}

function respondWithInfo(chatId, term) {
  if (!term) {
    console.log(`[Info] Prompted help without term for chat ${chatId}`);
    return bot.sendMessage(chatId, formatInfoMessage(null), COMMAND_KEYBOARD);
  }

  const result = searchInfo.searchTerm(term);
  console.log(`[Info] Term search for "${term}" in chat ${chatId} -> ${result ? 'hit' : 'miss'}`);
  return bot.sendMessage(chatId, formatInfoMessage(term, result), {
    parse_mode: 'HTML',
    ...COMMAND_KEYBOARD
  });
}

function sendPaymentInstructions(chatId, userId) {
  const paymentInfo = requestPayment(userId);
  const amount = `${paymentInfo.amount} ${CONFIG.CURRENCY}`;
  const buyMessage = `${CONFIG.PAYMENT_PROVIDER} orqali ${amount} to'lov qiling:
💳 Karta: <code>${paymentInfo.card}</code> (${paymentInfo.cardLast4})
👤 Oluvchi: ${paymentInfo.receiver}
🔖 Kod: ${paymentInfo.paymentCode}

To'lovni bajarganingizdan so'ng shu yerga chek rasmini yuboring, AI uni tekshiradi va sizga ${formatTokens(paymentInfo.tokens)} qaytariladi.`;

  return bot.sendMessage(chatId, buyMessage, { parse_mode: 'HTML', ...COMMAND_KEYBOARD });
}

function showEssayInstructions(chatId) {
  const instructions = `📝 Essay checker ishlatish uchun /essay buyrug'iga o'z inshoingiz matnini yuboring (kamida 100 so'z). Har bir tekshiruv ${formatTokens(ESSAY_TOKEN_COST)} talab qiladi.`;
  return bot.sendMessage(chatId, instructions, COMMAND_KEYBOARD);
}

function sendPaymentReminder(chatId, userId) {
  const paymentInfo = requestPayment(userId);
  const amount = `${paymentInfo.amount} ${CONFIG.CURRENCY}`;
  console.log(`[Payment] Reminding user ${userId} to pay ${amount}`);
  bot.sendMessage(
    chatId,
    `⚠️ Tokenlaringiz yetarli emas. ${amount} to'lov qilishingiz kerak. Kod: ${paymentInfo.paymentCode}.
💳 Karta: <code>${paymentInfo.card}</code> (${paymentInfo.cardLast4})
👤 Oluvchi: ${paymentInfo.receiver}

To'lovni tekshirish uchun chek rasmini shu yerga yuboring, AI uni tekshiradi.`,
    { parse_mode: 'HTML', ...COMMAND_KEYBOARD }
  );
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const tokens = formatTokens(getTokenBalance(userId));

  const welcomeMessage = `Assalomu alaykum! 👋

` +
    `Men sizning o'zbek imlosini tuzatish bo'yicha AI yordamchingizman. Har bir so'rov 1 ta tokenni iste'mol qiladi.
` +
    `💎 Sizda ${tokens} mavjud.

` +
    `📌 Buyruqlar:

` +
    `/help - Bu yordamni ko'rish
` +
    `/balance - Tokenlar holatini ko'rish
` +
    `/buy - Token sotib olish uchun to'lov ma'lumotini olish
` +
    `/about - Bot haqida ma'lumot

` +
    `Menga matn yuboring va men imlosini tuzataman! ✍️`;

  bot.sendMessage(chatId, welcomeMessage, COMMAND_KEYBOARD);
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, getHelpMessage(), COMMAND_KEYBOARD);
});

bot.onText(/\/info(?:\s+([\s\S]+))?/, (msg, match) => {
  const term = match?.[1]?.trim();
  respondWithInfo(msg.chat.id, term || '');
});

bot.onText(/\/balance/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const tokens = formatTokens(getTokenBalance(userId));
  bot.sendMessage(chatId, `💎 Sizda ${tokens} mavjud.`, COMMAND_KEYBOARD);
});

bot.onText(/\/buy/, (msg) => sendPaymentInstructions(msg.chat.id, msg.from.id));

bot.onText(/\/about/, (msg) => {
  bot.sendMessage(msg.chat.id, getAboutMessage(), COMMAND_KEYBOARD);
});

bot.onText(/\/essay(?:\s+([\s\S]+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const essay = match?.[1]?.trim();

  if (!essay) {
    return showEssayInstructions(chatId);
  }

  essayPendingUsers.delete(userId);

  if (!useTokens(userId, ESSAY_TOKEN_COST)) {
    return sendPaymentReminder(chatId, userId);
  }

  console.log(`[Essay] User ${userId} submitted ${essay.length} chars (text).`);
  bot.sendChatAction(chatId, 'typing');
  try {
    const review = await reviewEssay(essay);
    await bot.sendMessage(chatId, `📝 Essay review (${formatTokens(ESSAY_TOKEN_COST)} ishlatildi):\n${review}`);
  } catch (error) {
    console.error('Essay review error:', error);
    bot.sendMessage(chatId, '❌ Essayni tekshirishda xatolik yuz berdi. Keyinroq qayta urinib ko\'ring.');
  }
});

bot.on('callback_query', (query) => {
  const [action] = query.data.split('_');
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  try {
    switch (query.data) {
      case 'cmd_help':
        bot.sendMessage(chatId, getHelpMessage(), COMMAND_KEYBOARD);
        break;
      case 'cmd_balance':
        bot.sendMessage(chatId, `💎 Sizda ${formatTokens(getTokenBalance(userId))} mavjud.`, COMMAND_KEYBOARD);
        break;
      case 'cmd_buy':
        sendPaymentInstructions(chatId, userId);
        break;
      case 'cmd_about':
        bot.sendMessage(chatId, getAboutMessage(), COMMAND_KEYBOARD);
        break;
      case 'cmd_info':
        respondWithInfo(chatId, '');
        break;
      case 'cmd_essay':
        showEssayInstructions(chatId);
        break;
      default:
        bot.sendMessage(chatId, 'Buyruqni tanlang.', COMMAND_KEYBOARD);
    }
  } finally {
    bot.answerCallbackQuery(query.id).catch(() => {});
  }
});

function commandInfo(chatId) {
  return respondWithInfo(chatId, '');
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.trim();

  if (!text || text.startsWith('/')) {
    return;
  }

  if (!useTokens(userId)) {
    const paymentInfo = requestPayment(userId);
    const amount = `${paymentInfo.amount} ${CONFIG.CURRENCY}`;
    return bot.sendMessage(
      chatId,
      `⚠️ Tokenlaringiz tugadi. ${amount} to'lov qilishingiz kerak. Kod: ${paymentInfo.paymentCode}.\n` +
      `💳 Karta: <code>${paymentInfo.card}</code> (${paymentInfo.cardLast4})\n` +
      `👤 Oluvchi: ${paymentInfo.receiver}\n\n` +
      `To'lovni tasdiqlovchi chek rasmini yuboring, AI uni tekshiradi va sizga ${formatTokens(paymentInfo.tokens)} qaytariladi.`,
      { parse_mode: 'HTML' }
    );
  }

  bot.sendChatAction(chatId, 'typing');

  try {
    const corrected = await correctSpelling(text);
    if (corrected !== text) {
      await bot.sendMessage(chatId, `✅ Matn to'liq to'g'ri yozilgan: ${corrected}`);
    } else {
      await bot.sendMessage(chatId, `Matn xato: ${text}`);
    }
  } catch (error) {
    console.error('Error correcting spelling:', error);
    await bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
});

const essayPendingUsers = new Set();

function showLeaderboard(chatId) {
  const entries = getLeaderboard(10);
  if (!entries.length) {
    return bot.sendMessage(chatId, "🏆 Reyting hali mavjud emas. Token so'rovlarini boshlang.", COMMAND_KEYBOARD);
  }

  const formatted = entries.map((entry, index) => {
    const badge = entry.badge ? ` (${entry.badge})` : '';
    return `${index + 1}. ${entry.userId} — ${entry.tokensEarned} token${badge} — oxirgi faol: ${new Date(entry.lastActive).toLocaleString()}`;
  }).join('\n');

  bot.sendMessage(chatId, `🏆 Top talabalar:\n${formatted}`, COMMAND_KEYBOARD);
}

bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photo = msg.photo?.[msg.photo.length - 1];

  if (!photo) {
    return;
  }

  if (essayPendingUsers.has(userId)) {
    essayPendingUsers.delete(userId);

    if (!useTokens(userId, ESSAY_TOKEN_COST)) {
      return sendPaymentReminder(chatId, userId);
    }

    const fileUrl = await bot.getFileLink(photo.file_id);
    bot.sendChatAction(chatId, 'typing');
    try {
      const review = await reviewEssayImage(fileUrl);
      await bot.sendMessage(chatId, `📝 Image-based essay review (${formatTokens(ESSAY_TOKEN_COST)} ishlatildi):\n${review}`);
    } catch (error) {
      console.error('Essay image review error:', error);
      await bot.sendMessage(chatId, '❌ Rasmli essayni tekshirishda xatolik yuz berdi. Keyinroq qayta urinib ko\'ring.');
    }
    return;
  }

  if (!isPaymentPending(userId)) {
    bot.sendMessage(chatId, '⚠️ Sizda to\'lov kutish holati yo\'q. Token yetmaganda /buy buyrug\'i orqali to\'lov ko\'rsatmasini oling.');
    return;
  }

  const fileUrl = await bot.getFileLink(photo.file_id);
  const processingMsg = await bot.sendMessage(chatId, '🔍 AI to\'lov chekini tekshirmoqda...');

  try {
    const result = await verifyPaymentWithAI(userId, fileUrl);
    if (result.success) {
      await bot.editMessageText(
        `✅ To'lov tasdiqlandi! ${formatTokens(result.tokensAdded)} qaytarildi.\n💎 Yangi balans: ${formatTokens(result.newBalance)}`,
        { chat_id: chatId, message_id: processingMsg.message_id }
      );
    } else {
      await bot.editMessageText(
        `❌ Tasdiqlanmadi: ${result.reason || 'Noaniq chek'}.\nIltimos, to'liq va aniq skrin yuboring.`,
        { chat_id: chatId, message_id: processingMsg.message_id }
      );
    }
  } catch (error) {
    console.error('Receipt verification error:', error);
    await bot.editMessageText(
      '❌ To\'lovni tekshirishda xatolik yuz berdi. Keyinroq qayta urinib ko\'ring.',
      { chat_id: chatId, message_id: processingMsg.message_id }
    );
  }
});

// Handle errors
bot.on('polling_error', (error) => {
  if (error.response && error.response.body) {
    const errorBody = error.response.body;
    
    // Check for common errors
    if (errorBody.error_code === 404) {
      console.error('❌ Error: Invalid bot token!');
      console.error('The bot token in your .env file is incorrect or the bot was deleted.');
      console.error('Please check your token with @BotFather on Telegram.');
      process.exit(1);
    } else if (errorBody.error_code === 401) {
      console.error('❌ Error: Unauthorized!');
      console.error('The bot token is invalid. Please check your .env file.');
      process.exit(1);
    } else {
      console.error('❌ Polling error:', errorBody.description || error.message);
    }
  } else {
    console.error('❌ Polling error:', error.message || error);
  }
});

console.log('Sarvar Dalbayop!!')



