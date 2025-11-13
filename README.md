# IMLO-BOT - Uzbek Spelling Corrector Telegram Bot

A Telegram bot that helps students learning the Uzbek language by correcting spelling errors in their messages.

## Features

- ✅ Automatic spelling correction for Uzbek text
- ✅ Real-time message processing
- ✅ User-friendly interface with commands
- ✅ Common word dictionary for accurate corrections

## Example

**User writes:** `Asalomu alaykum`  
**Bot responds:** `Assalomu alaykum`

## Setup

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd IMLO-BOT
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
cp .env.example .env
```

4. Edit `.env` and add your bot token:
```
BOT_TOKEN=your_actual_bot_token_here
```

5. Run the bot:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Getting a Bot Token

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` command
3. Follow the instructions to create your bot
4. Copy the token you receive
5. Paste it in your `.env` file

## Usage

Once the bot is running, users can:

- Send `/start` to begin
- Send `/help` for help
- Send `/about` for bot information
- Send any text message to get spelling corrections

## Commands

- `/start` - Start the bot and see welcome message
- `/help` - Get help information
- `/about` - Learn about the bot

## How It Works

The bot uses a dictionary-based approach combined with pattern matching to correct common spelling errors in Uzbek text. It:

1. Receives text messages from users
2. Checks against a dictionary of correct spellings
3. Applies pattern-based corrections
4. Returns the corrected text

## Adding More Words

To add more words to the dictionary, edit `spellChecker.js` and add entries to the `dictionary` object:

```javascript
const dictionary = {
  'incorrect': 'Correct',
  // Add more entries here
};
```

## License

MIT

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.


