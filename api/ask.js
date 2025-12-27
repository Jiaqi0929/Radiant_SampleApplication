// api/ask.js
import { initLangChain } from "./_init.js";
import { ConversationChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = {};
  try {
    body = req.body ?? {};
  } catch {
    body = {};
  }

  const question = body.question;
  const userId = body.userId || "default";

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Invalid or missing question" });
  }

  const cache = await initLangChain();
  if (!cache.ready) return res.status(503).json({ error: "LangChain not initialized" });

  let relevantDocs = [];
  try {
    relevantDocs = await cache.vectorStore.similaritySearch(question, 3);
  } catch (e) {
    console.warn("similaritySearch error:", e);
  }

  const context = relevantDocs
    .map(
      (doc, i) =>
        `[Source ${i + 1} from "${doc.metadata?.source || "doc"}"]:\n${doc.pageContent}\n`
    )
    .join("\n");

  if (!cache.userMemories.has(userId)) {
    cache.userMemories.set(
      userId,
      new BufferMemory({ returnMessages: true, memoryKey: "history" })
    );
  }

  const memory = cache.userMemories.get(userId);
  const chain = new ConversationChain({ llm: cache.chatModel, memory });

  const ragPrompt = `
CONTEXT FROM DOCUMENTS:
${context || "NO DOCUMENT CONTEXT AVAILABLE."}

USER QUESTION: ${question}

INSTRUCTIONS:
- Answer conversationally as a helpful assistant.
- Use **bold** for important terms and • bullet points where helpful.
- If context has the answer, use it and cite the source.
- If not, say you don't have a direct answer and offer general help.
`;

  let response;
  try {
    response = await chain.call({ input: ragPrompt });
  } catch (e) {
    console.error("AI generation error:", e);
    return res.status(500).json({ error: "AI generation failed", message: e.message });
  }

  const answer = typeof response === "string" ? response : response?.response || response?.output || "";

  return res.json({
    answer,
    sources: relevantDocs.map(doc => ({
      source: doc.metadata?.source || "Unknown",
      page: doc.metadata?.loc?.pageNumber || "N/A",
      contentPreview: (doc.pageContent || "").substring(0, 150) + "...",
      chunkId: doc.metadata?.chunkId || "unknown",
    })),
    userId,
    relevantChunks: relevantDocs.length,
  });
}
