import { Router, type IRouter, type Request, type Response } from "express";
import { db, conversations, messages } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { eq } from "drizzle-orm";

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

async function askEnglishTeacher(sentence: string): Promise<string> {
  const prompt = `You are an English teacher.

1. Translate the sentence into Uzbek naturally
2. Give key vocabulary (English → Uzbek)
3. Give 2 example sentences
4. Explain grammar simply

Sentence: ${sentence}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0]?.message?.content ?? "Sorry, I couldn't generate a response.";
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
      "👋 *Welcome!* Send me any English sentence and I will:\n\n" +
        "1️⃣ Translate it into Uzbek\n" +
        "2️⃣ Give key vocabulary (English → Uzbek)\n" +
        "3️⃣ Give 2 example sentences\n" +
        "4️⃣ Explain the grammar\n\n" +
        "Just send me an English sentence to get started!"
    );
    return;
  }

  try {
    await sendChatAction(chatId, "typing");

    const reply = await askEnglishTeacher(text);

    const conversationId = await getOrCreateConversation(chatId);
    await db.insert(messages).values([
      { conversationId, role: "user", content: text },
      { conversationId, role: "assistant", content: reply },
    ]);

    await sendTelegramMessage(chatId, reply);
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
  const result = (await response.json()) as { ok: boolean; description?: string };

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
