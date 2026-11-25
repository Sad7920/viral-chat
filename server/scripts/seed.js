import path from "node:path";
import { pathToFileURL } from "node:url";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { models } from "../src/allowlist.js";

export const DEMO_EMAIL = "demo@lumen.test";
// Development only. Not a production credential.
export const DEMO_PASSWORD = "demo-pass-dev-only";

const MODEL = models[0].id;
const COUNT = 60;
const DAY = 24 * 60 * 60 * 1000;

const TOPICS = [
  [
    "My Friday payout hasn't arrived",
    "Studio pays out on Fridays. Starter has no payouts. I can't see your account, so I can't confirm this transfer.",
  ],
  [
    "My card payment failed",
    "A failed card is retried twice over 3 days. If both fail, the account becomes read-only. I can't see the payment from here.",
  ],
  [
    "How do I change from Starter to Studio?",
    "Studio is $12 a month, with unlimited invoices and Friday payouts. Change it under Billing, then Plan.",
  ],
  [
    "What does Practice include?",
    "Practice is $29 a month, with unlimited invoices and next-business-day payouts.",
  ],
  [
    "When is an invoice due?",
    "Invoices default to net 14. That is 14 days after the invoice date.",
  ],
  [
    "Can you tell me my balance?",
    "I can't see your account, so I won't guess a balance. Use Escalate. People are here weekdays, 9 to 17 US Eastern.",
  ],
  [
    "Is sales tax included?",
    "I can't help with tax. I can help with invoices, payouts, subscriptions, and failed payments.",
  ],
  [
    "Can you review this contract?",
    "I can't help with legal questions. I can help with invoices, payouts, subscriptions, and failed payments.",
  ],
  [
    "What is the weather today?",
    "I only help with Lumen Ledger billing. I can help with invoices, payouts, subscriptions, and failed payments.",
  ],
  [
    "How many invoices are on Starter?",
    "Starter is free and includes 3 invoices a month. It does not include payouts.",
  ],
];

const MARKDOWN = `To change a plan:

- Open Billing, then Plan.
- Choose Studio at $12 a month, or Practice at $29 a month.
- Confirm. Studio pays out on Fridays. Practice pays out the next business day.

The page path is:

\`\`\`
/billing/plan
\`\`\`
`;

function daysAgo(days, extraMs = 0) {
  const date = new Date();
  date.setUTCHours(15, 0, 0, 0);
  return new Date(date.getTime() - days * DAY + extraMs);
}

function pushPair(messages, base, question, answer, at, incomplete = false) {
  const repliedAt = new Date(at.getTime() + 1000);
  messages.push(
    { ...base, _id: new mongoose.Types.ObjectId(), role: "user", content: question, createdAt: at },
    {
      ...base,
      _id: new mongoose.Types.ObjectId(),
      role: "assistant",
      content: answer,
      model: MODEL,
      incomplete,
      createdAt: repliedAt,
    },
  );
  return repliedAt;
}

export async function seed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed when NODE_ENV=production");
  }

  const users = mongoose.connection.collection("users");
  const conversations = mongoose.connection.collection("conversations");
  const messages = mongoose.connection.collection("messages");
  const existing = await users.findOne({ email: DEMO_EMAIL });
  if (existing) {
    await messages.deleteMany({ userId: existing._id });
    await conversations.deleteMany({ userId: existing._id });
    await users.deleteOne({ _id: existing._id });
  }

  const userId = new mongoose.Types.ObjectId();
  await users.insertOne({
    _id: userId,
    email: DEMO_EMAIL,
    passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
    createdAt: new Date(),
  });

  const conversationDocs = [];
  const messageDocs = [];
  for (let i = 0; i < COUNT; i += 1) {
    const topic = TOPICS[i % TOPICS.length];
    const openedAt = daysAgo(COUNT - 1 - i);
    const conversationId = new mongoose.Types.ObjectId();
    const base = { conversationId, userId, incomplete: false };
    let title = topic[0].slice(0, 48);
    let updatedAt = openedAt;
    let escalation = null;

    if (i === 0) {
      title = "Switching plans";
      for (let n = 0; n < 60; n += 1) {
        const item = TOPICS[n % TOPICS.length];
        const answer = n === 3 ? MARKDOWN : item[1];
        updatedAt = pushPair(
          messageDocs,
          base,
          item[0],
          answer,
          daysAgo(COUNT - 1 - i, n * 60_000),
        );
      }
    } else if (i === 1) {
      title = "Failed card";
      updatedAt = pushPair(
        messageDocs,
        base,
        topic[0],
        "A failed card is retried twice over 3 days, then the",
        openedAt,
        true,
      );
    } else {
      if (i === 2) {
        escalation = {
          summary: "Friday payout still missing. Please check the transfer.",
          createdAt: openedAt,
        };
      }
      updatedAt = pushPair(messageDocs, base, topic[0], topic[1], openedAt);
    }

    conversationDocs.push({
      _id: conversationId,
      userId,
      title,
      escalation,
      createdAt: openedAt,
      updatedAt,
    });
  }

  await conversations.insertMany(conversationDocs);
  await messages.insertMany(messageDocs);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isDirectRun()) {
  dotenv.config({ quiet: true });
  try {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
    await mongoose.connect(process.env.MONGODB_URI);
    await seed();
    console.error(`seeded ${DEMO_EMAIL}`);
    await mongoose.disconnect();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
