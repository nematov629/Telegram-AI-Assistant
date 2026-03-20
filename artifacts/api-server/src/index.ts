import app from "./app";

// Vercel serverless: request handler sifatida ishlaydi, `app.listen()` ni chaqirmaymiz.
// Local dev/test: oddiy Node process sifatida ishlatamiz.
if (!process.env.VERCEL) {
  const rawPort = process.env["PORT"] ?? "3000";
  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

export default app;
