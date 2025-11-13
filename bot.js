const TelegramBot = require('node-telegram-bot-api');
const { correctSpelling } = require('./spellChecker');
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

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });

console.log('Bot is running...');

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `Assalomu alaykum! 👋

Men sizning imlo (ortografiya) yordamchingizman. Meni ishlatish juda oson:

1. Menga matn yuboring
2. Men uni tekshirib, xatolarni tuzataman

Misol: "Asalomu alaykum" yozsangiz, men "Assalomu alaykum" deb tuzataman.

Boshlash uchun menga matn yuboring! ✍️`;

  bot.sendMessage(chatId, welcomeMessage);
});

// Handle /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `📖 Yordam

Bu bot o'zbek tilidagi imlo xatolarini tuzatishga yordam beradi.

Qanday ishlatish:
• Menga matn yuboring
• Men uni tekshirib, xatolarni tuzatib qaytaraman

Buyruqlar:
/start - Botni boshlash
/help - Yordam olish
/about - Bot haqida ma'lumot`;

  bot.sendMessage(chatId, helpMessage);
});

// Handle /about command
bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  const aboutMessage = `ℹ️ Bot haqida

Bu bot o'zbek tilini o'rganayotgan talabalar uchun yaratilgan. Bot imlo xatolarini avtomatik tuzatadi va to'g'ri yozilishini ko'rsatadi.

Misol:
❌ "Asalomu alaykum"
✅ "Assalomu alaykum"

Bot hozirda ishlab chiqilmoqda va doimiy yangilanib boriladi.`;

  bot.sendMessage(chatId, aboutMessage);
});

// Handle all text messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Ignore commands
  if (text && text.startsWith('/')) {
    return;
  }

  // Only process text messages
  if (text) {
    // Show typing indicator
    bot.sendChatAction(chatId, 'typing');

    try {
      // Correct the spelling (now async)
      const corrected = await correctSpelling(text);

      // If text was corrected, send the result
      if (corrected !== text) {
        const response = `✅ Tuzatilgan matn:\n\n${corrected}`;
        bot.sendMessage(chatId, response);
      } else {
        // If no corrections were made, inform the user
        bot.sendMessage(chatId, '✅ Matn to\'g\'ri yozilgan! Xatolar topilmadi.');
      }
    } catch (error) {
      console.error('Error correcting spelling:', error);
      bot.sendMessage(chatId, '❌ Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
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


