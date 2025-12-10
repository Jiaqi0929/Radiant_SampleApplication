// api/status.js
import { initLangChain } from "./_init.js";

export default async function handler(req, res) {
  const cache = await initLangChain();
  res.json({
    api: "RAG LangChain System",
    status: cache.ready ? "ready" : "initializing",
    timestamp: new Date().toISOString(),
    stats: {
      documents: cache.documentsMetadata?.size || 0,
      users: cache.userMemories?.size || 0
    }
  });
}
