// api/summarize.js
import { initLangChain } from "./_init.js";
import { PromptTemplate } from "langchain/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { text, documentId } = req.body || {};
  if (!text && !documentId) return res.status(400).json({ error: "Provide text or documentId" });

  const cache = await initLangChain();
  if (!cache.ready) return res.status(503).json({ error: "LangChain not initialized" });

  let textToSummarize = "";
  let documentName = "";
  let type = "text";

  if (documentId) {
    const document = cache.documentsMetadata.get(documentId);
    if (!document) return res.status(404).json({ error: "Document not found" });

    // retrieve many documents and filter by source filename
    const allDocs = await cache.vectorStore.similaritySearch("", 200);
    const documentChunks = allDocs.filter(d => d.metadata?.source === document.filename);
    if (!documentChunks.length) return res.status(404).json({ error: "No content for document" });

    textToSummarize = documentChunks.map(c => c.pageContent).join("\n\n");
    documentName = document.filename;
    type = "document";
  } else {
    textToSummarize = text;
    type = "text";
  }

  if (!textToSummarize) return res.status(400).json({ error: "No text available to summarize" });

  const simpleSummaryPrompt = PromptTemplate.fromTemplate(`
Please provide a comprehensive yet concise summary of the following text.

TEXT TO SUMMARIZE:
{text}

SUMMARY:
  `);

  const summaryChain = RunnableSequence.from([
    simpleSummaryPrompt,
    cache.chatModel,
    new StringOutputParser()
  ]);

  // Limit input size for performance
  const inputText = textToSummarize.substring(0, 3000);

  let summary;
  try {
    summary = await summaryChain.invoke({ text: inputText });
  } catch (e) {
    console.error("Summary generation error:", e);
    return res.status(500).json({ error: "Summary failed", message: e.message });
  }

  return res.json({
    summary: summary,
    originalLength: textToSummarize.length,
    summaryLength: summary.length,
    type,
    ...(documentName && { documentName })
  });
}
