import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

// ========== LANGCHAIN IMPORTS ==========
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { ChatOpenAI } from "@langchain/openai";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { BufferMemory } from "langchain/memory";
import { ConversationChain } from "langchain/chains";
import { PromptTemplate } from "langchain/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
// =======================================

dotenv.config();

const app = express();

// Middleware - IMPORTANT for Vercel
app.use(cors());
app.use(express.json());

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ========== LANGCHAIN SETUP ==========

console.log("🔍 Checking OpenRouter API key...");
console.log("API Key exists:", !!process.env.OPENROUTER_API_KEY);

let embeddings, chatModel, vectorStore;

try {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("❌ OPENROUTER_API_KEY is missing!");
    console.log("Please add OPENROUTER_API_KEY to Vercel environment variables");
  } else {
    console.log("✅ Initializing LangChain with OpenRouter...");
    
    // 1. Embeddings with OpenRouter - FIXED MODEL
    embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
      },
      model: "text-embedding-ada-002"  // CHANGED THIS
    });
    
    console.log("✅ Embeddings initialized");

    // 2. Lightweight LLM (Gemma 2B) - FIXED MODEL NAME
    chatModel = new ChatOpenAI({
      openAIApiKey: process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
      },
      modelName: "google/gemma-2b-it",  // CHANGED TO 2B VERSION
      temperature: 0.1,
      maxTokens: 500,  // REDUCED
      timeout: 30000   // ADDED TIMEOUT
    });
    
    console.log("✅ Chat model initialized");

    // 3. Vector Store for RAG
    vectorStore = new MemoryVectorStore(embeddings);
    console.log("✅ Vector store initialized");
  }
} catch (error) {
  console.error("❌ LangChain initialization failed:", error.message);
  console.error("Full error:", error);
}

// ========== LANGCHAIN COMPONENTS ==========

// 4. Text Splitter for chunking
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

// 5. Memory Management
const userMemories = new Map();

// 6. Document Metadata Storage
const documentsMetadata = new Map();

// ========== ROUTES WITH LANGCHAIN ==========

// Simple test endpoint
app.get("/api/status", (req, res) => {
  const hasApiKey = !!process.env.OPENROUTER_API_KEY;
  const langChainReady = !!(embeddings && chatModel && vectorStore);
  
  res.json({
    api: "RAG LangChain System",
    status: "running",
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      openRouterApiKey: hasApiKey ? "configured" : "MISSING",
      langChain: langChainReady ? "ready" : "not ready"
    },
    endpoints: {
      health: "/api/health",
      status: "/api/status",
      upload: "/api/upload",
      ask: "/api/ask",
      summarize: "/api/summarize",
      chat: "/api/chat",
      documents: "/api/documents"
    }
  });
});

// Debug endpoint
app.get("/api/debug", (req, res) => {
  res.json({
    status: "debug",
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
      keyPreview: process.env.OPENROUTER_API_KEY ? 
        process.env.OPENROUTER_API_KEY.substring(0, 10) + "..." : 
        "MISSING"
    },
    langChain: {
      embeddings: !!embeddings,
      chatModel: !!chatModel,
      vectorStore: !!vectorStore
    },
    memory: {
      users: userMemories.size,
      documents: documentsMetadata.size
    }
  });
});

// Serve frontend
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy" });
});

// 1. UPLOAD & RAG PROCESSING
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    // Check if LangChain is initialized
    if (!embeddings || !chatModel || !vectorStore) {
      return res.status(503).json({ 
        error: "LangChain not initialized",
        message: "Please check OPENROUTER_API_KEY environment variable",
        help: "Add your OpenRouter API key in Vercel project settings"
      });
    }

    console.log("🔄 Processing PDF with LangChain...");

    // LANGCHAIN: Load PDF
    const blob = new Blob([req.file.buffer], { type: "application/pdf" });
    const loader = new PDFLoader(blob);
    const docs = await loader.load();

    // LANGCHAIN: Split text into chunks
    const splitDocs = await textSplitter.splitDocuments(docs);
    console.log(`📄 Split into ${splitDocs.length} chunks`);

    // Add metadata
    const docsWithMetadata = splitDocs.map((doc, index) => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        source: req.file.originalname,
        chunkId: uuidv4(),
        chunkIndex: index,
        uploadedAt: new Date().toISOString()
      }
    }));

    // LANGCHAIN: Add to vector store (RAG)
    await vectorStore.addDocuments(docsWithMetadata);
    console.log("✅ Documents added to vector store");

    // Store metadata
    const documentId = uuidv4();
    documentsMetadata.set(documentId, {
      id: documentId,
      filename: req.file.originalname,
      chunks: splitDocs.length,
      uploadedAt: new Date().toISOString(),
      size: req.file.size
    });

    res.json({
      success: true,
      message: "PDF processed with LangChain RAG",
      documentId,
      chunks: splitDocs.length,
      filename: req.file.originalname
    });

  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "PDF processing failed: " + error.message });
  }
});

// 2. RAG QUERY (Retrieval Augmented Generation)
app.post("/api/ask", async (req, res) => {
  try {
    const { question, userId = "default" } = req.body;
    if (!question) return res.status(400).json({ error: "No question provided" });

    console.log("🔍 Performing RAG query...");

    // ADD THIS CHECK
    if (!vectorStore) {
      return res.status(503).json({ 
        error: "AI system not ready",
        message: "Please check OPENROUTER_API_KEY or try again",
        details: "Vector store not initialized"
      });
    }

    // LANGCHAIN: Semantic search with error handling
    let relevantDocs = [];
    try {
      relevantDocs = await vectorStore.similaritySearch(question, 3);  // REDUCED TO 3
      console.log(`📚 Found ${relevantDocs.length} relevant chunks`);
    } catch (searchError) {
      console.log("⚠️ No documents in vector store");
      relevantDocs = [];
    }

    // Build context
    const context = relevantDocs.map((doc, index) => 
      `[Source ${index + 1} from "${doc.metadata?.source || 'document'}"]:\n${doc.pageContent}\n`
    ).join("\n");

    // ADD THIS CHECK
    if (!chatModel) {
      return res.json({
        answer: "AI model is still loading. Please try again in a moment.",
        sources: [],
        userId: userId,
        relevantChunks: 0,
        modelStatus: "loading"
      });
    }

    // Get or create user memory
    if (!userMemories.has(userId)) {
      userMemories.set(userId, new BufferMemory({
        returnMessages: true,
        memoryKey: "history",
      }));
    }
    const memory = userMemories.get(userId);

    // LANGCHAIN: Create conversation chain with memory
    const chain = new ConversationChain({ 
      llm: chatModel,
      memory: memory
    });

    // RAG prompt
    const ragPrompt = `
    CONTEXT FROM DOCUMENTS:
    ${context}

    CONVERSATION HISTORY: [Available in memory]

    USER QUESTION: ${question}

    INSTRUCTIONS:
    - Answer conversationally like a helpful assistant
    - Use **bold** for important terms and key points
    - Use bullet points • for lists when helpful
    - Use numbered lists for steps or sequences
    - Break into clear paragraphs for readability
    - Be concise but thorough
    - If information comes from documents, mention it naturally
    - If context doesn't have the answer, say so politely and offer general help

    Please provide a helpful, well-formatted response:`;

     // LANGCHAIN: Generate response with timeout
    let response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      response = await chain.call({ 
        input: ragPrompt,
        signal: controller.signal 
      });
      
      clearTimeout(timeout);
    } catch (aiError) {
      console.error("AI generation error:", aiError);
      response = { response: "I'm having trouble generating a response right now." };
    }

    res.json({
      answer: response.response,
      sources: relevantDocs.map(doc => ({
        source: doc.metadata?.source || 'Unknown',
        page: doc.metadata?.loc?.pageNumber || 'N/A',
        contentPreview: doc.pageContent?.substring(0, 150) + '...' || '',
        chunkId: doc.metadata?.chunkId || 'unknown'
      })),
      userId: userId,
      relevantChunks: relevantDocs.length
    });

  } catch (error) {
    console.error("RAG Query error:", error);
    res.status(500).json({ 
      error: "RAG query failed",
      message: error.message
    });
  }
});

// 3. TEXT SUMMARIZATION
app.post("/api/summarize", async (req, res) => {
  try {
    const { text, documentId } = req.body;

    if (!text && !documentId) {
      return res.status(400).json({ error: "Provide text or documentId" });
    }

    console.log("📝 Performing text summarization...");

    let textToSummarize = "";
    let documentName = "";
    let type = "text";

    // If documentId provided, summarize the document
    if (documentId) {
      console.log(`🔍 Summarizing document: ${documentId}`);
      
      // Get document metadata
      const document = documentsMetadata.get(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Get all chunks for this document
      const allDocs = await vectorStore.similaritySearch("", 100);
      const documentChunks = allDocs.filter(doc => 
        doc.metadata.source === document.filename
      );

      if (documentChunks.length === 0) {
        return res.status(404).json({ error: "No content found for this document" });
      }

      // Combine all chunks
      textToSummarize = documentChunks.map(chunk => chunk.pageContent).join("\n\n");
      documentName = document.filename;
      type = "document";
      
      console.log(`📄 Found ${documentChunks.length} chunks from document: ${documentName}`);
    } else {
      // Use provided text
      textToSummarize = text;
      type = "text";
    }

    if (!textToSummarize || textToSummarize.length === 0) {
      return res.status(400).json({ error: "No text available to summarize" });
    }

    // Use a simpler prompt that works better with the model
    const simpleSummaryPrompt = PromptTemplate.fromTemplate(`
Please provide a comprehensive yet concise summary of the following text. Focus on:

**MAIN POINTS:**
- Key ideas and concepts
- Important findings
- Major conclusions

**STRUCTURE:**
- Start with an overview
- List key points with bullet points
- End with main takeaways

TEXT TO SUMMARIZE:
{text}

Please use clear formatting with **bold** for important terms and • bullet points for lists.

SUMMARY:`);

    const summaryChain = RunnableSequence.from([
      simpleSummaryPrompt,
      chatModel,
      new StringOutputParser()
    ]);

    // LANGCHAIN: Generate summary
    console.log(`📋 Summarizing text (${textToSummarize.length} characters)...`);
    const summary = await summaryChain.invoke({ 
      text: textToSummarize.substring(0, 3000)  // Limit text length for performance
    });

    console.log(`✅ Summary generated: ${summary.length} characters`);

    res.json({
      summary: summary,
      originalLength: textToSummarize.length,
      summaryLength: summary.length,
      type: type,
      ...(documentName && { documentName: documentName })
    });

  } catch (error) {
    console.error("Summarize error:", error);
    res.status(500).json({ error: "Summarization failed: " + error.message });
  }
});

// 4. CHAT WITH MEMORY MANAGEMENT
app.post("/api/chat", async (req, res) => {
  try {
    const { message, userId = "default", clearMemory = false } = req.body;
    if (!message) return res.status(400).json({ error: "No message provided" });

    // Clear memory if requested
    if (clearMemory && userMemories.has(userId)) {
      userMemories.delete(userId);
    }

    // Get or create user memory
    if (!userMemories.has(userId)) {
      userMemories.set(userId, new BufferMemory({
        returnMessages: true,
        memoryKey: "history",
      }));
    }
    const memory = userMemories.get(userId);

    // LANGCHAIN: Create conversation chain
    const chain = new ConversationChain({ 
      llm: chatModel,
      memory: memory
    });

    // LANGCHAIN: Generate response with memory
    const response = await chain.call({ input: message });

    res.json({
      response: response.response,
      userId: userId,
      memoryLength: (await memory.chatHistory.getMessages()).length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Chat failed: " + error.message });
  }
});

// 5. MEMORY MANAGEMENT
app.get("/api/memory/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userMemories.has(userId)) {
      return res.json({ 
        userId: userId,
        messageCount: 0,
        recentMessages: [],
        status: "No memory found"
      });
    }
    
    const memory = userMemories.get(userId);
    const chatHistory = await memory.chatHistory.getMessages();
    
    const recentMessages = chatHistory.slice(-10).map(msg => ({
      type: msg._getType(),
      content: msg.content,
      timestamp: new Date().toISOString()
    }));
    
    res.json({ 
      userId: userId,
      messageCount: chatHistory.length,
      recentMessages: recentMessages,
      status: "Memory retrieved successfully"
    });
    
  } catch (error) {
    console.error("Memory retrieval error:", error);
    res.status(500).json({ 
      error: "Memory retrieval failed: " + error.message,
      userId: req.params.userId
    });
  }
});

app.delete("/api/memory/:userId", (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userMemories.has(userId)) {
      return res.json({ 
        success: false, 
        message: "No memory found for this user",
        userId: userId
      });
    }
    
    const deleted = userMemories.delete(userId);
    
    res.json({ 
      success: true, 
      message: deleted ? "Memory cleared successfully" : "No memory found",
      userId: userId,
      deleted: deleted
    });
    
  } catch (error) {
    console.error("Memory deletion error:", error);
    res.status(500).json({ 
      success: false,
      error: "Memory deletion failed: " + error.message 
    });
  }
});

// 6. DOCUMENT MANAGEMENT
app.get("/api/documents", (req, res) => {
  const documents = Array.from(documentsMetadata.values());
  res.json({
    totalDocuments: documents.length,
    documents: documents
  });
});

// 7. HEALTH CHECK
app.get("/api/healthh", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    system: {
      usingLangChain: true,
      framework: "Node.js + LangChain",
      features: [
        "Retrieval Augmented Generation (RAG)",
        "Lightweight LLM (Gemma 2B)", 
        "Text Summarization",
        "Memory Management",
        "Vector Store",
        "PDF Processing"
      ],
      components: {
        vectorStore: "MemoryVectorStore",
        embeddings: "OpenAIEmbeddings",
        llm: "ChatOpenAI (Gemma 2B)",
        memory: "BufferMemory",
        textSplitter: "RecursiveCharacterTextSplitter"
      }
    },
    stats: {
      documents: documentsMetadata.size,
      activeUsers: userMemories.size
    }
  });
});

app.get("/api", (req, res) => {
  res.json({ 
    message: "RAG LangChain API is running!",
    endpoints: [
      "GET /api/health - Basic health check",
      "GET /api/healthh - Detailed health check",
      "POST /api/upload - Upload PDF for RAG processing",
      "POST /api/ask - Ask questions about documents",
      "POST /api/summarize - Summarize text or documents",
      "POST /api/chat - Chat with memory",
      "GET /api/documents - List uploaded documents",
      "GET /api/memory/:userId - Get conversation memory",
      "DELETE /api/memory/:userId - Clear memory"
    ],
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ========== EXPORT FOR VERCEL ==========
export default app;
