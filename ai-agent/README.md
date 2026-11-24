# LINE AI Agent

A LINE chatbot powered by Claude (Anthropic API). It remembers the conversation per user, group, or room, and it has two tools:

- `web_search`: searches the web for current information (runs on Anthropic's servers)
- `get_current_time`: returns the current date and time in a given time zone

## Setup

1. In the [LINE Developers Console](https://developers.line.biz/console/), create a Messaging API channel. Copy its **Channel secret** and **Channel access token**.
2. Get an API key at https://platform.claude.com, and make sure the account has credit.
3. Install and configure:

   ```bash
   cd ai-agent
   npm install
   cp .env.example .env   # fill in the three keys
   npm run dev
   ```

4. Expose the server over HTTPS (for example, deploy it or use `ngrok http 3000`). Set the channel's Webhook URL to `https://<your-host>/webhook`, then turn on **Use webhook**.

## Usage

- Send any text message and the bot answers.
- Send `/reset`, `/清除`, or `重新開始` to clear the conversation.

## Notes

- Conversation history is kept in memory, so restarting the server clears it. Use Redis or a database for production.
- If an answer takes longer than the reply token's lifetime, the bot sends it as a push message instead.
