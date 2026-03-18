import { Router, type IRouter, type Request, type Response } from "express";
import { db, conversations, messages } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });
}

async function sendChatAction(chatId: number, action: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

async function getOrCreateConversation(chatId: number): Promise<number> {
  const title = `telegram_chat_${chatId}`;
  const existing = await db
    .select()
    .from(conversations)
    .where(eq(conversations.title, title))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [created] = await db
    .insert(conversations)
    .values({ title })
    .returning({ id: conversations.id });

  return created.id;
}

async function getConversationHistory(conversationId: number) {
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(50);

  return msgs.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));
}

router.post("/telegram/webhook", async (req: Request, res: Response) => {
  res.sendStatus(200);

  const update = req.body;

  if (!update.message) return;

  const message = update.message;
  const chatId: number = message.chat.id;
  const text: string | undefined = message.text;

  if (!text) return;

  if (text === "/start") {
    await sendTelegramMessage(
      chatId,
      "Hello! I'm an AI assistant powered by GPT. Send me a message and I'll do my best to help!\n\nUse /reset to start a new conversation."
    );
    return;
  }

  if (text === "/reset") {
    const title = `telegram_chat_${chatId}`;
    const existing = await db
      .select()
      .from(conversations)
      .where(eq(conversations.title, title))
      .limit(1);

    if (existing.length > 0) {
      await db
        .delete(messages)
        .where(eq(messages.conversationId, existing[0].id));
    }

    await sendTelegramMessage(chatId, "Conversation reset! Let's start fresh.");
    return;
  }

  try {
    await sendChatAction(chatId, "typing");

    const conversationId = await getOrCreateConversation(chatId);
    const history = await getConversationHistory(conversationId);

    await db.insert(messages).values({
      conversationId,
      role: "user",
      content: text,
    });

    const chatMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
      {
        role: "system",
        content:
          "You are a helpful, friendly AI assistant. Be concise but thorough. Format responses clearly.",
      },
      ...history,
      { role: "user", content: text },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: chatMessages,
    });

    const assistantReply = response.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response.";

    await db.insert(messages).values({
      conversationId,
      role: "assistant",
      content: assistantReply,
    });

    await sendTelegramMessage(chatId, assistantReply);
  } catch (err) {
    console.error("Error handling Telegram message:", err);
    await sendTelegramMessage(
      chatId,
      "Sorry, something went wrong. Please try again."
    );
  }
});

router.get("/telegram/setup-webhook", async (req: Request, res: Response) => {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

  const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const result = await response.json() as { ok: boolean; description?: string };

  if (result.ok) {
    res.json({ success: true, webhookUrl });
  } else {
    res.status(500).json({ success: false, error: result.description });
  }
});

router.get("/telegram/webhook-info", async (_req: Request, res: Response) => {
  const response = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
  const result = await response.json();
  res.json(result);
});

export default router;
