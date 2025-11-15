const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { correctSpelling } = require('./spellChecker');
const {
  getTokenBalance,
  useTokens,
  requestPayment,
  verifyPaymentWithAI,
  isPaymentPending,
  formatNumber,
  CONFIG
} = require('./tokenSystem');
require('dotenv').config();

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

  app.get('/', (req, res) => {
    res.send('IMLO-BOT is running!');
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

console.log('Bot is running...');

const formatTokens = (count) => formatNumber(count) + ' ta token';

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const tokens = formatTokens(getTokenBalance(userId));

  const welcomeMessage = `Assalomu alaykum! 👋\n\n` +
    `Men sizning o'zbek imlosini tuzatish bo'yicha AI yordamchingizman. Har bir so'rov 1 ta tokenni iste'mol qiladi.\n` +
    `💎 Sizda ${tokens} mavjud.\n\n` +
    `📌 Buyruqlar:\n` +
    `/help - Bu yordamni ko'rish\n` +
    `/balance - Tokenlar holatini ko'rish\n` +
    `/buy - Token sotib olish uchun to'lov ma'lumotini olish\n` +
    `/about - Bot haqida ma'lumot\n\n` +
    `Menga matn yuboring va men imlosini tuzataman! ✍️`;

  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `🤖 Bot buyruqlari:\n` +
    `/start - Botni qayta ishga tushurish\n` +
    `/balance - Tokenlar soni\n` +
    `/buy - Token sotib olish uchun ko'rsatmalar\n` +
    `/about - Bot haqida\n` +
    `📦 Matn yuboring va imlo xatolari avtomatik tuziladi. Har bir so'rov 1 tokenni ishlatadi.`;

  bot.sendMessage(chatId, helpMessage);
});

bot.onText(/\/balance/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const tokens = formatTokens(getTokenBalance(userId));
  bot.sendMessage(chatId, `💎 Sizda ${tokens} mavjud.`);
});

bot.onText(/\/buy/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const paymentInfo = requestPayment(userId);
  const amount = `${paymentInfo.amount} ${CONFIG.CURRENCY}`;

  const buyMessage = `${CONFIG.PAYMENT_PROVIDER} orqali ${amount} to'lov qiling:\n` +
    `💳 Karta: <code>${paymentInfo.card}</code> (${paymentInfo.cardLast4})\n` +
    `👤 Oluvchi: ${paymentInfo.receiver}\n` +
    `🔖 Kod: ${paymentInfo.paymentCode}\n\n` +
    `To'lovni bajarganingizdan so'ng shu yerga chek rasmini yuboring, AI uni tekshiradi va sizga ${formatTokens(paymentInfo.tokens)} qaytariladi.`;

  bot.sendMessage(chatId, buyMessage, { parse_mode: 'HTML' });
});

bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  const aboutMessage = `ℹ️ IMLO-BOT - o'zbek tilida imlo xatolarini avtomatik tuzatadigan Telegram boti.\n` +
    `AI yordamida yuborilgan matnni tuzatadi va to'g'ri javobni qaytaradi.`;
  bot.sendMessage(chatId, aboutMessage);
});

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
    const response = corrected !== text
      ? corrected
      : "Matnda o'zgartirish topilmadi.";

    await bot.sendMessage(chatId, response);
  } catch (error) {
    console.error('Error correcting spelling:', error);
    await bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
});

bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photo = msg.photo?.[msg.photo.length - 1];

  if (!photo) {
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
        `❌ Tasdiqlanmadi: ${result.reason || 'Noaniq chek'}.\nIltimos, to\'liq va aniq skrin yuboring.`,
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

console.log('Telegram bot started successfully!');


