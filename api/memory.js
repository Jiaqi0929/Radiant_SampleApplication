// api/memory.js
import { initLangChain } from "./_init.js";

export default async function handler(req, res) {
  const cache = await initLangChain();
  if (!cache.ready) return res.status(503).json({ error: "LangChain not initialized" });

  const userId = req.query.userId || (req.method === "DELETE" ? req.body?.userId : "default");

  if (!userId) return res.status(400).json({ error: "userId is required" });

  if (req.method === "GET") {
    if (!cache.userMemories.has(userId)) {
      return res.json({ userId, messageCount: 0, recentMessages: [], status: "No memory found" });
    }
    const memory = cache.userMemories.get(userId);
    const chatHistory = await memory.chatHistory.getMessages();
    const recentMessages = chatHistory.slice(-10).map(msg => ({ type: msg._getType?.() || "msg", content: msg.content }));
    return res.json({ userId, messageCount: chatHistory.length, recentMessages, status: "Memory retrieved" });
  } else if (req.method === "DELETE") {
    const deleted = cache.userMemories.delete(userId);
    return res.json({ success: deleted, message: deleted ? "Memory cleared" : "No memory found", userId });
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}
