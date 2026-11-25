import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcrypt";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { DEMO_EMAIL, DEMO_PASSWORD, seed } from "../scripts/seed.js";

test("seed loads one demo account and is idempotent", { timeout: 180_000 }, async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await assert.rejects(seed(), /production/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }

  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  try {
    await seed();
    await assertSeed();
    const conversations = await mongoose.connection.collection("conversations").countDocuments();
    const messages = await mongoose.connection.collection("messages").countDocuments();
    await seed();
    await assertSeed();
    assert.equal(await mongoose.connection.collection("users").countDocuments(), 1);
    assert.equal(
      await mongoose.connection.collection("conversations").countDocuments(),
      conversations,
    );
    assert.equal(await mongoose.connection.collection("messages").countDocuments(), messages);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
});

async function assertSeed() {
  const db = mongoose.connection;
  const users = await db.collection("users").find({ email: DEMO_EMAIL }).toArray();
  assert.equal(users.length, 1);
  assert.equal(await bcrypt.compare(DEMO_PASSWORD, users[0].passwordHash), true);

  const conversations = await db
    .collection("conversations")
    .find({ userId: users[0]._id })
    .toArray();
  assert.equal(conversations.length, 60);
  const times = conversations.map((doc) => doc.updatedAt.getTime());
  assert.ok(Math.max(...times) - Math.min(...times) >= 58 * 24 * 60 * 60 * 1000);

  const escalated = conversations.filter((doc) => doc.escalation);
  assert.equal(escalated.length, 1);
  assert.equal(typeof escalated[0].escalation.summary, "string");
  assert.ok(escalated[0].escalation.summary.length > 0);

  const grouped = await db
    .collection("messages")
    .aggregate([
      { $match: { userId: users[0]._id } },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ])
    .toArray();
  assert.ok(grouped.some((row) => row.count >= 120));
  const markdown = await db.collection("messages").findOne({
    userId: users[0]._id,
    content: { $regex: /\n- [^\n]+\n[\s\S]*```/ },
  });
  assert.ok(markdown);

  const incomplete = await db.collection("messages").find({ incomplete: true }).toArray();
  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].role, "assistant");
  const last = await db
    .collection("messages")
    .find({ conversationId: incomplete[0].conversationId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(1)
    .next();
  assert.equal(String(last._id), String(incomplete[0]._id));
}
