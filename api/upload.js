// api/upload.js
import { initLangChain } from "./_init.js";
import { v4 as uuidv4 } from "uuid";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("📤 Upload endpoint called");
    
    const cache = await initLangChain();
    if (!cache.ready) {
      return res.status(503).json({ error: "LangChain not initialized" });
    }

    const { text, filename = "uploaded.txt" } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "No text provided" });
    }

    // Create a simple document from text
    const docs = [{
      pageContent: text,
      metadata: {
        source: filename,
        uploadedAt: new Date().toISOString(),
      }
    }];

    // Split the text
    const splitDocs = await cache.textSplitter.splitDocuments(docs);

    // Add metadata to each chunk
    const docsWithMeta = splitDocs.map((doc, idx) => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        chunkId: uuidv4(),
        chunkIndex: idx,
      },
    }));

    // Add to vector store
    await cache.vectorStore.addDocuments(docsWithMeta);

    // Store document metadata
    const documentId = uuidv4();
    cache.documentsMetadata.set(documentId, {
      id: documentId,
      filename: filename,
      chunks: splitDocs.length,
      uploadedAt: new Date().toISOString(),
      size: text.length,
    });

    return res.json({
      success: true,
      message: "Text uploaded and processed",
      documentId: documentId,
      chunks: splitDocs.length,
      filename: filename,
    });

  } catch (error) {
    console.error("❌ Upload error:", error);
    return res.status(500).json({ 
      error: "Upload failed", 
      message: error.message 
    });
  }
}
