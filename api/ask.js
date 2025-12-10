// api/ask.js
import { initLangChain } from "./_init.js";
import { ConversationChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { question, userId = "default" } = req.body || {};
  if (!question) return res.status(400).json({ error: "No question provided" });

  const cache = await initLangChain();
  if (!cache.ready) return res.status(503).json({ error: "LangChain not initialized" });

  // find similar docs (safe even when empty)
  let relevantDocs = [];
  try {
    relevantDocs = await cache.vectorStore.similaritySearch(question, 3);
  } catch (e) {
    console.warn("similaritySearch error", e);
    relevantDocs = [];
  }

  const context = relevantDocs.map((doc, i) => 
    `[Source ${i+1} from "${doc.metadata?.source || 'doc'}"]:\n${doc.pageContent}\n`
  ).join("\n");

  // memory
  if (!cache.userMemories.has(userId)) {
    cache.userMemories.set(userId, new BufferMemory({ returnMessages: true, memoryKey: "history" }));
  }
  const memory = cache.userMemories.get(userId);

  const chain = new ConversationChain({ llm: cache.chatModel, memory });

  const ragPrompt = `
CONTEXT FROM DOCUMENTS:
${context}

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

  return res.json({
    answer: response.response || response.output || "",
    sources: relevantDocs.map(doc => ({
      source: doc.metadata?.source || "Unknown",
      page: doc.metadata?.loc?.pageNumber || "N/A",
      contentPreview: (doc.pageContent || "").substring(0, 150) + "...",
      chunkId: doc.metadata?.chunkId || "unknown"
    })),
    userId,
    relevantChunks: relevantDocs.length
  });
}
