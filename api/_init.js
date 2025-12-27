// api/_init.js
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { ChatOpenAI } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

let _cache = global.__RAG_CACHE || {};
global.__RAG_CACHE = _cache;

export async function initLangChain() {
  if (_cache.ready) return _cache;

  const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_KEY) {
    console.warn("OPENROUTER_API_KEY missing");
  }

  try {
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: OPENROUTER_KEY,
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      model: "text-embedding-3-small",
    });

    const chatModel = new ChatOpenAI({
      openAIApiKey: OPENROUTER_KEY,
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      modelName: "google/gemma-2b-it",
      temperature: 0.1,
      maxTokens: 500,
      timeout: 30000,
    });

    const vectorStore = new MemoryVectorStore(embeddings);
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    _cache = {
      embeddings,
      chatModel,
      vectorStore,
      textSplitter,
      userMemories: new Map(),
      documentsMetadata: new Map(),
      ready: true,
    };
    global.__RAG_CACHE = _cache;
    console.log("LangChain initialized.");
  } catch (e) {
    console.error("Failed to initialize LangChain:", e);
    _cache.ready = false;
  }

  return _cache;
}
