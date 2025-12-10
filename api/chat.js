// api/chat.js
import { initLangChain } from "./_init.js";
import { ConversationChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { message, userId = "default", clearMemory = false } = req.body || {};
  if (!message) return res.status(400).json({ error: "No message provided" });

  const cache = await initLangChain();
  if (!cache.ready) return res.status(503).json({ error: "LangChain not initialized" });

  if (clearMemory && cache.userMemories.has(userId)) {
    cache.userMemories.delete(userId);
  }
  if (!cache.userMemories.has(userId)) {
    cache.userMemories.set(userId, new BufferMemory({ returnMessages: true, memoryKey: "history" }));
  }
  const memory = cache.userMemories.get(userId);

  const chain = new ConversationChain({ llm: cache.chatModel, memory });

  let response;
  try {
    response = await chain.call({ input: message });
  } catch (e) {
    console.error("Chat error:", e);
    return res.status(500).json({ error: "Chat failed", message: e.message });
  }

  // Attempt to get memory length safely
  let memCount = 0;
  try {
    memCount = (await memory.chatHistory.getMessages()).length;
  } catch {}

  return res.json({
    response: response.response || response.output || "",
    userId,
    memoryLength: memCount,
    timestamp: new Date().toISOString()
  });
}
