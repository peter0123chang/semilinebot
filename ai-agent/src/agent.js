import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const MAX_HISTORY_TURNS = Number(process.env.MAX_HISTORY_TURNS || 20);
const LINE_TEXT_LIMIT = 5000; // LINE text message max length

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || [
  '你是一個在 LINE 上與使用者對話的 AI 助理。',
  '預設使用繁體中文回答，除非使用者使用其他語言。',
  '回答要簡潔、口語化，適合在手機聊天視窗閱讀；LINE 不支援 Markdown，請勿使用 #、**、表格等語法。',
  '需要最新資訊（新聞、天氣、價格等）時，使用 web_search 工具；需要現在的日期時間時，使用 get_current_time 工具。',
].join('\n');

// Client reads ANTHROPIC_API_KEY from the environment. Never hardcode it.
const client = new Anthropic();

const getCurrentTime = betaZodTool({
  name: 'get_current_time',
  description: 'Get the current date and time in a given IANA time zone (default Asia/Taipei).',
  inputSchema: z.object({
    timeZone: z.string().optional().describe('IANA time zone, e.g. Asia/Taipei, Asia/Tokyo'),
  }),
  run: async ({ timeZone }) => {
    const tz = timeZone || 'Asia/Taipei';
    try {
      return new Date().toLocaleString('zh-TW', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' });
    } catch {
      return `Unknown time zone: ${tz}`;
    }
  },
});

const tools = [
  getCurrentTime,
  { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
];

// In-memory conversation history keyed by LINE source (user / group / room).
// Stores plain text only. Restarting the process clears it; swap for Redis/DB in production.
const conversations = new Map();

export function resetConversation(sourceId) {
  conversations.delete(sourceId);
}

function textOf(message) {
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

/**
 * Send the user's message to Claude (with tools) and return the reply text.
 */
export async function chat(sourceId, userText) {
  const history = conversations.get(sourceId) || [];
  const messages = [...history, { role: 'user', content: userText }];

  let reply;
  try {
    const finalMessage = await client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: process.env.CLAUDE_EFFORT || 'low' },
      // Re-run on a fallback model if the request is declined by a safety classifier.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      tools,
      messages,
      max_iterations: 8,
    });

    if (finalMessage.stop_reason === 'refusal') {
      reply = '抱歉，這個問題我無法回答。';
    } else {
      reply = textOf(finalMessage) || '（沒有產生回覆，請換個方式再問一次）';
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('Anthropic authentication failed - check ANTHROPIC_API_KEY');
    } else if (err instanceof Anthropic.RateLimitError) {
      console.error('Anthropic rate limited:', err.message);
      return '目前使用人數較多，請稍後再試。';
    } else if (err instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${err.status}:`, err.message);
    } else {
      console.error('Unexpected error calling Claude:', err);
    }
    return '抱歉，系統暫時出了點問題，請稍後再試。';
  }

  if (reply.length > LINE_TEXT_LIMIT) {
    reply = `${reply.slice(0, LINE_TEXT_LIMIT - 1)}…`;
  }

  const updated = [...messages, { role: 'assistant', content: reply }];
  conversations.set(sourceId, updated.slice(-MAX_HISTORY_TURNS * 2));
  return reply;
}
