// api/documents.js
import { initLangChain } from "./_init.js";

export default async function handler(req, res) {
  const cache = await initLangChain();
  if (!cache.ready) return res.status(503).json({ error: "LangChain not initialized" });

  const documents = Array.from(cache.documentsMetadata.values());
  res.json({ totalDocuments: documents.length, documents });
}
