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
Translate the following word or sentence into Uzbek naturally.
Also provide:
- Literal meaning
- Usage notes if relevant

Word/Sentence: ${text}`;
  } else if (mode === "synonyms") {
    prompt = `You are an English vocabulary teacher for Uzbek speakers.
For the word: "${text}"
Provide:
1. 5–7 English synonyms
2. For each synonym: Uzbek meaning in parentheses
3. One short example sentence for each synonym`;
  } else if (mode === "sentence") {
    prompt = `You are an English teacher.
Using the word or phrase: "${text}"
Write exactly 8 example sentences.
Number them 1–8.
Use different tenses and contexts. Keep sentences clear and natural.`;
  } else if (mode === "grammar") {
    prompt = `You are an English grammar checker for Uzbek learners.
Analyze this sentence: "${text}"

Provide:
1. ✅ Corrected sentence (if errors found, otherwise confirm it's correct)
2. ❌ Errors found (list each error and why it's wrong)
3. 📚 Grammar rule (name the tense or grammar point used)
4. 💡 Explanation (simple explanation in both English and Uzbek)`;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0]?.message?.content ?? "Javob olishda xatolik yuz berdi.";
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

router.post("/telegram/webhook", bot.webhookCallback("/api/telegram/webhook"));

router.get("/telegram/setup-webhook", async (req: Request, res: Response) => {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;

  const result = await bot.telegram.setWebhook(webhookUrl);
  if (result) {
    res.json({ success: true, webhookUrl });
  } else {
    res.status(500).json({ success: false });
  }
});

router.get("/telegram/webhook-info", async (_req: Request, res: Response) => {
  const info = await bot.telegram.getWebhookInfo();
  res.json(info);
});

export default router;
