import { Router, type IRouter, type Request, type Response } from "express";
import { Telegraf, Markup } from "telegraf";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const userState = new Map<number, string>();

async function askAI(mode: string, text: string): Promise<string> {
  let prompt = "";

  if (mode === "translation") {
    prompt = `You are an English-Uzbek translator.
Translate the following word or sentence into natural Uzbek.
Return ONLY the Uzbek translation.
No explanations, no bullet points, no extra text.

Text: ${text}`;
  } else if (mode === "synonyms") {
    prompt = `You are an English vocabulary teacher for Uzbek speakers.
For the word: "${text}"
Return ONLY 5–7 English synonyms.
Output format: one line per synonym: <synonym> - <Uzbek meaning>.
No examples and no explanations.

Remember: output only synonyms lines.`;
  } else if (mode === "sentence") {
    prompt = `You are an English teacher.
Using the word or phrase: "${text}"
Write exactly 8 example sentences.
Output format: exactly 8 lines, numbered 1–8 like "1. ..." through "8. ...".
No headings and no extra text.

Now write the 8 sentences.`;
  } else if (mode === "grammar") {
    prompt = `You are an English grammar checker for Uzbek learners.
Analyze this sentence: "${text}"

If it is correct, return exactly one line:
OK: <sentence>

If it has errors, return exactly these 3 lines:
1) Corrected: <corrected sentence>
2) Errors: <short bullet list of each error (including tense/grammar)> 
3) Rule: <tense/grammar rule name>

No other text. No explanations.`;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.choices[0]?.message?.content ?? "";
  return (content.trim() || "Javob olishda xatolik yuz berdi.").trim();
}

bot.start((ctx) => {
  ctx.reply(
    "Assalomu aleykum! 👋 -- Hello!\nQanday yordam kerak? -- How can I help you?",
    Markup.inlineKeyboard([
      [Markup.button.callback("🔤 Translation", "translation")],
      [Markup.button.callback("📚 Synonyms", "synonyms")],
      [Markup.button.callback("✍️ Sentence", "sentence")],
      [Markup.button.callback("✅ Grammar", "grammar")],
    ])
  );
});

bot.on("callback_query", async (ctx) => {
  if (!("data" in ctx.callbackQuery)) return;

  const choice = ctx.callbackQuery.data;
  const userId = ctx.from.id;

  userState.set(userId, choice);

  const prompts: Record<string, string> = {
    translation: "So'z yoki gapni yozing, men Uzbekchaga tarjima qilaman:\n_Write a word or sentence to translate into Uzbek:_",
    synonyms: "So'zni yozing, men sinonimlarini chiqaraman:\n_Write a word to get its synonyms:_",
    sentence: "So'zni yozing, men 8 ta jumla tuzaman:\n_Write a word to get 8 example sentences:_",
    grammar: "Gap yozing, men grammatik xatolarni tekshiraman:\n_Write a sentence to check its grammar:_",
  };

  await ctx.reply(prompts[choice] ?? "So'z yozing:", { parse_mode: "Markdown" });
  await ctx.answerCbQuery();
});

bot.on("text", async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  if (text.startsWith("/")) return;

  const mode = userState.get(userId);

  if (!mode) {
    await ctx.reply(
      "Iltimos, avval bo'limni tanlang 👇\n_Please select a mode first:_",
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🔤 Translation", "translation")],
          [Markup.button.callback("📚 Synonyms", "synonyms")],
          [Markup.button.callback("✍️ Sentence", "sentence")],
          [Markup.button.callback("✅ Grammar", "grammar")],
        ]),
      }
    );
    return;
  }

  await ctx.sendChatAction("typing");

  try {
    const reply = await askAI(mode, text);
    await ctx.reply(reply);
  } catch (err) {
    console.error("AI error:", err);
    await ctx.reply("Xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
  }
});

// Vercel serverless: avval 200 qayt, keyin process — timeout oldini olish uchun
router.post("/telegram/webhook", async (req: Request, res: Response) => {
  res.sendStatus(200);

  // Serverless runtime request promise tugaguncha ishlashni davom ettiradi.
  // Telegram update qayta ishlashi AI so'rovlari bilan davom etgani uchun
  // handleUpdate promise'ni "yutib yubormaslik" muhim.
  return bot.handleUpdate(req.body).catch((err) => {
    console.error("Webhook error:", err);
  });
});

router.get("/telegram/setup-webhook", async (req: Request, res: Response) => {
  // Vercel URL ni avtomatik aniqlash
  const host =
    process.env.VERCEL_URL ??
    (req.headers["x-forwarded-host"] as string | undefined) ??
    req.headers.host;
  const protocol =
    process.env.VERCEL_URL
      ? "https"
      : ((req.headers["x-forwarded-proto"] as string | undefined) ?? "https");
  const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

  try {
    const result = await bot.telegram.setWebhook(webhookUrl);
    if (result) {
      res.json({ success: true, webhookUrl });
    } else {
      res.status(500).json({ success: false });
    }
  } catch (err) {
    console.error("setWebhook error:", err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.get("/telegram/webhook-info", async (_req: Request, res: Response) => {
  try {
    const info = await bot.telegram.getWebhookInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
