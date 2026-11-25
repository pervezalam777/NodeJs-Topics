import express from "express";
import cors from "cors";
import usersRouter from "./routes/users.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "zod-demo-api" });
});

app.use("/api/users", usersRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError) {
    res.status(400).json({ message: "Malformed JSON request body" });
    return;
  }
  console.error(error);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
