// api/chat.js
import { initLangChain } from "./_init.js";
import { ConversationChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ✅ Safe body parsing
  let body = {};
  try {
    body = req.body ?? {};
  } catch {
    body = {};
  }

  const message = body.message;
  const userId = body.userId || "default";
  const clearMemory = body.clearMemory === true;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Invalid or missing message" });
  }

  const cache = await initLangChain();
  if (!cache.ready) {
    return res.status(503).json({ error: "LangChain not initialized" });
  }

  // Memory handling
  if (clearMemory && cache.userMemories.has(userId)) {
    cache.userMemories.delete(userId);
  }

  if (!cache.userMemories.has(userId)) {
    cache.userMemories.set(
      userId,
      new BufferMemory({ returnMessages: true, memoryKey: "history" })
    );
  }

  const memory = cache.userMemories.get(userId);
  const chain = new ConversationChain({
    llm: cache.chatModel,
    memory
  });

  let response;
  try {
    response = await chain.call({ input: message });
  } catch (e) {
    console.error("Chat error:", e);
    return res.status(500).json({
      error: "Chat failed",
      message: e.message
    });
  }

  // ✅ Safe response extraction
  let reply = "";
  if (typeof response === "string") {
    reply = response;
  } else {
    reply = response?.response || response?.output || "";
  }

  // Memory count (safe)
  let memCount = 0;
  try {
    memCount = (await memory.chatHistory.getMessages()).length;
  } catch {}

  return res.json({
    response: reply,
    userId,
    memoryLength: memCount,
    timestamp: new Date().toISOString()
  });
}
