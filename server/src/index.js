import dotenv from "dotenv";
import { defaultModel } from "./allowlist.js";
import { createApp } from "./app.js";
import { connectDb } from "./db.js";
import { parseEnv } from "./env.js";
import { Conversation } from "./models/Conversation.js";
import { Message } from "./models/Message.js";
import { User } from "./models/User.js";

dotenv.config({ quiet: true });

try {
  const parsed = parseEnv();
  const env = { ...parsed, OPENROUTER_MODEL: defaultModel(parsed) };
  await connectDb(env.MONGODB_URI);
  console.error("connected to MongoDB");
  await Promise.all([User.init(), Conversation.init(), Message.init()]);
  const app = createApp({ env });
  const server = app.listen(env.PORT, () => {
    console.error(`listening on ${env.PORT}`);
  });
  server.on("error", (err) => {
    console.error(err.message);
    process.exit(1);
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
