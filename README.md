
Florida Utilities is a custom Discord bot developed for Florida State Roleplay (FSRP). It is designed to provide useful server tools, simplify management, and help keep the community organized.

## Features

- Discord server utility commands
- Server management tools
- Community support features
- Configurable bot settings
- Node.js-based application

*Features may vary depending on the current version of the bot.*

## Requirements

- [Node.js](https://nodejs.org/)
- npm
- A Discord bot application and token

## Installation

### 1. Clone the Repository

```bash
git clone YOUR_REPOSITORY_URL
cd YOUR_REPOSITORY_FOLDER
```

Replace the example values with your repository URL and folder name.

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the main project folder and add your Discord bot token:

```env
DISCORD_TOKEN=your_discord_bot_token
```

Replace the example value with your actual token.

**Never upload your real `.env` file or bot token to GitHub.** Make sure `.env` is included in your `.gitignore` file.

### 4. Start the Bot

If `index.js` is your entry point, run:

```bash
node index.js
```

If your project uses `bot.js` as its entry point, run:

```bash
node bot.js
```

## Project Structure

- `bot.js` — Bot functionality.
- `index.js` — Application entry point, if used.
- `package.json` — Project configuration and dependencies.
- `package-lock.json` — Dependency version information.
- `.gitignore` — Files and folders excluded from Git.
- `.env` — Private configuration stored locally.
- `node_modules/` — Installed project dependencies.

## Security

- Keep your bot token private.
- Never commit your `.env` file.
- Do not share private credentials with untrusted users.
- Reset your token through the Discord Developer Portal if it is exposed.

## Credits

**Developed by Florida State Roleplay (FSRP).**

Maintained by the Florida Utilities development team.
