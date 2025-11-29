// index.js - Fixed for OpenRouter
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse";
import dotenv from "dotenv";

// LangChain imports
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAI } from "langchain/llms/openai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Multer setup
const upload = multer({ 
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Storage for documents and their content
let documents = [];
let documentContents = new Map();

// Initialize OpenRouter model - FIXED for OpenRouter
const createOpenRouterModel = (temperature = 0) => {
  return new OpenAI({
    openAIApiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    modelName: "openai/gpt-3.5-turbo", // OpenRouter model format
    temperature: temperature,
    maxTokens: 1000,
    // OpenRouter specific headers
    headers: {
      "HTTP-Referer": "http://localhost:3000", // Your site URL
      "X-Title": "AI Knowledge Assistant", // Your app name
    },
  });
};

// Helper function to call OpenRouter model
async function callOpenRouter(prompt, temperature = 0) {
  try {
    console.log("Calling OpenRouter with prompt:", prompt.substring(0, 100) + "...");
    
    const model = createOpenRouterModel(temperature);
    const response = await model.invoke(prompt);
    
    console.log("OpenRouter response received");
    return response;
  } catch (error) {
    console.error("OpenRouter API error:", error);
    
    // Provide more specific error messages
    if (error.message.includes("401")) {
      throw new Error("OpenRouter API key is invalid or missing");
    } else if (error.message.includes("404")) {
      throw new Error("OpenRouter model not found. Try 'google/gemini-pro' instead");
    } else if (error.message.includes("429")) {
      throw new Error("OpenRouter rate limit exceeded. Please try again later");
    } else {
      throw new Error("OpenRouter API error: " + error.message);
    }
  }
}

// Alternative: Direct fetch to OpenRouter (fallback method)
async function callOpenRouterDirect(prompt, temperature = 0) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Knowledge Assistant"
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo", // or "google/gemini-pro"
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: temperature
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Direct OpenRouter call failed:", error);
    throw error;
  }
}

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Upload PDF
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const buffer = fs.readFileSync(filePath);
    
    // Parse PDF
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    if (!text || text.trim().length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "No text found in PDF" });
    }

    // Store document content
    const documentId = Date.now();
    documentContents.set(documentId, text);

    // Store document info
    const documentInfo = {
      id: documentId,
      filename: req.file.originalname,
      size: req.file.size,
      textLength: text.length,
      uploadedAt: new Date().toISOString()
    };

    documents.push(documentInfo);

    // Clean up
    fs.unlinkSync(filePath);

    res.json({ 
      success: true,
      message: "PDF uploaded and processed successfully!",
      document: documentInfo,
      totalDocuments: documents.length
    });

  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed: " + error.message });
  }
});

// Ask questions about specific documents
app.post("/ask", async (req, res) => {
  try {
    const { question, documentId } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: "No question provided" });
    }

    if (documents.length === 0) {
      return res.status(400).json({ error: "No documents uploaded yet" });
    }

    let context = "";
    
    // If specific document ID provided, use that document
    if (documentId) {
      const text = documentContents.get(parseInt(documentId));
      if (text) {
        context = text;
      }
    } else {
      // Otherwise use all documents
      const allText = Array.from(documentContents.values()).slice(0, 2).join("\n\n");
      context = allText;
    }

    if (!context) {
      return res.status(400).json({ error: "No document content found" });
    }

    const prompt = `Answer the question based on the following document content. Be specific and accurate.

Document Content:
${context.substring(0, 3000)}

Question: ${question}

Answer:`;

    // Try LangChain method first, then fallback to direct API call
    let answer;
    try {
      answer = await callOpenRouter(prompt);
    } catch (error) {
      console.log("LangChain method failed, trying direct API...");
      answer = await callOpenRouterDirect(prompt);
    }

    res.json({ 
      answer: answer,
      question: question,
      documentId: documentId || 'all'
    });

  } catch (error) {
    console.error("Ask error:", error);
    res.status(500).json({ error: "Failed to get answer: " + error.message });
  }
});

// SUMMARIZE UPLOADED FILES
app.post("/summarize", async (req, res) => {
  try {
    const { documentId } = req.body;
    
    if (documents.length === 0) {
      return res.status(400).json({ error: "No documents uploaded yet" });
    }

    let textToSummarize = "";
    let targetDocument = null;

    // If specific document ID provided, summarize that document
    if (documentId) {
      const text = documentContents.get(parseInt(documentId));
      if (text) {
        textToSummarize = text;
        targetDocument = documents.find(doc => doc.id === parseInt(documentId));
      } else {
        return res.status(400).json({ error: "Document not found" });
      }
    } else {
      // Otherwise summarize the first document
      const firstDoc = documents[0];
      textToSummarize = documentContents.get(firstDoc.id);
      targetDocument = firstDoc;
    }

    if (!textToSummarize) {
      return res.status(400).json({ error: "No document content found to summarize" });
    }

    const prompt = `Please provide a comprehensive summary of the following document. Focus on the main points, key findings, and important details.

Document: ${targetDocument.filename}
Content:
${textToSummarize.substring(0, 4000)}

Please provide a well-structured summary with key points:`;

    let summary;
    try {
      summary = await callOpenRouter(prompt);
    } catch (error) {
      console.log("LangChain method failed, trying direct API...");
      summary = await callOpenRouterDirect(prompt);
    }

    res.json({ 
      summary: summary,
      document: targetDocument,
      originalLength: textToSummarize.length,
      summaryLength: summary.length
    });

  } catch (error) {
    console.error("Summarize error:", error);
    res.status(500).json({ error: "Summarization failed: " + error.message });
  }
});

// SUMMARIZE CUSTOM TEXT
app.post("/summarize-text", async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }

    const prompt = `Please provide a clear and concise summary of the following text:

${text.substring(0, 3000)}

Summary:`;

    let summary;
    try {
      summary = await callOpenRouter(prompt);
    } catch (error) {
      console.log("LangChain method failed, trying direct API...");
      summary = await callOpenRouterDirect(prompt);
    }

    res.json({ 
      summary: summary,
      originalLength: text.length,
      summaryLength: summary.length
    });

  } catch (error) {
    console.error("Summarize text error:", error);
    res.status(500).json({ error: "Text summarization failed: " + error.message });
  }
});

// GENERAL CHAT
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "No message provided" });
    }

    const prompt = `You are a helpful AI assistant. Please respond to the user's message in a friendly and informative way.

User: ${message}

Assistant:`;

    let response;
    try {
      response = await callOpenRouter(prompt, 0.7);
    } catch (error) {
      console.log("LangChain method failed, trying direct API...");
      response = await callOpenRouterDirect(prompt, 0.7);
    }

    res.json({ 
      response: response,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Chat failed: " + error.message });
  }
});

// Get documents info
app.get("/documents", (req, res) => {
  res.json({
    total: documents.length,
    documents: documents
  });
});

// Test OpenRouter connection
app.get("/test-openrouter", async (req, res) => {
  try {
    const testPrompt = "Hello! Please respond with 'OpenRouter is working!' if you can read this.";
    const response = await callOpenRouterDirect(testPrompt);
    res.json({ 
      status: "success", 
      message: "OpenRouter connection test passed",
      response: response 
    });
  } catch (error) {
    res.status(500).json({ 
      status: "error", 
      message: "OpenRouter connection test failed",
      error: error.message 
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    documents: documents.length,
    usingOpenRouter: true,
    apiKey: process.env.OPENROUTER_API_KEY ? "Set" : "Not set",
    features: ["upload", "ask", "summarize", "summarize-text", "chat"]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔗 Using OpenRouter API`);
  console.log(`🔑 OpenRouter Key: ${process.env.OPENROUTER_API_KEY ? 'Set' : 'NOT SET - Please check .env file'}`);
  console.log(`✨ Available features: Upload, Ask Questions, Summarize Files, General Chat`);
  
  // Test OpenRouter connection on startup
  if (process.env.OPENROUTER_API_KEY) {
    console.log(`🧪 Testing OpenRouter connection...`);
  }
});