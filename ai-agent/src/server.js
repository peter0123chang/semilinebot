import express from 'express';
import { messagingApi, middleware } from '@line/bot-sdk';
import { chat, resetConversation } from './agent.js';

const required = ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'ANTHROPIC_API_KEY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')} (see .env.example)`);
  process.exit(1);
}

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};
const line = new messagingApi.MessagingApiClient({ channelAccessToken: lineConfig.channelAccessToken });

const RESET_COMMANDS = new Set(['/reset', '/清除', '重新開始']);

function sourceIdOf(source) {
  return source.groupId || source.roomId || source.userId;
}

async function sendText(event, text) {
  const messages = [{ type: 'text', text }];
  try {
    await line.replyMessage({ replyToken: event.replyToken, messages });
  } catch (err) {
    // Reply tokens expire quickly; fall back to a push message for slow answers.
    console.warn('Reply failed, falling back to push:', err.message);
    await line.pushMessage({ to: sourceIdOf(event.source), messages });
  }
}

async function handleEvent(event) {
  if (event.type !== 'message') return;

  const sourceId = sourceIdOf(event.source);

  if (event.message.type !== 'text') {
    await sendText(event, '目前只支援文字訊息喔！');
    return;
  }

  const text = event.message.text.trim();
  if (RESET_COMMANDS.has(text)) {
    resetConversation(sourceId);
    await sendText(event, '好的，已清除對話紀錄。');
    return;
  }

  // Loading animation only works in 1:1 chats.
  if (event.source.type === 'user') {
    line.showLoadingAnimation({ chatId: event.source.userId, loadingSeconds: 60 }).catch(() => {});
  }

  const reply = await chat(sourceId, text);
  await sendText(event, reply);
}

const app = express();

app.get('/', (_req, res) => res.send('LINE AI Agent is running.'));

// The LINE middleware verifies X-Line-Signature and parses the body.
app.post('/webhook', middleware(lineConfig), (req, res) => {
  res.sendStatus(200); // Acknowledge immediately; process events in the background.
  for (const event of req.body.events) {
    handleEvent(event).catch((err) => console.error('Failed to handle event:', err));
  }
});

app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(err.name === 'SignatureValidationFailed' ? 401 : 400).send(err.message);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`LINE AI Agent listening on port ${port}`));
