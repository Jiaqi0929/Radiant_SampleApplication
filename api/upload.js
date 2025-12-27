// api/upload.js - Simplified version
import { initLangChain } from "./_init.js";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cache = await initLangChain();
  if (!cache.ready) {
    return res.status(503).json({ error: "LangChain not initialized" });
  }

  try {
    // For simplicity, accept base64 encoded PDF
    const { pdfBase64, filename = "uploaded.pdf" } = req.body;
    
    if (!pdfBase64) {
      return res.status(400).json({ error: "No PDF data provided" });
    }

    // Decode base64
    const buffer = Buffer.from(pdfBase64, 'base64');
    const tmpPath = path.join("/tmp", `${uuidv4()}_${filename}`);
    
    await fs.writeFile(tmpPath, buffer);

    // Load PDF
    let docs = [];
    try {
      const loader = new PDFLoader(tmpPath);
      docs = await loader.load();
    } catch (e) {
      console.error("PDF load failed:", e);
      return res.status(400).json({ error: "Failed to read PDF", details: e.message });
    }

    if (!docs || docs.length === 0) {
      await fs.unlink(tmpPath).catch(() => {});
      return res.status(400).json({ error: "PDF has no readable content" });
    }

    const splitDocs = await cache.textSplitter.splitDocuments(docs);

    const docsWithMeta = splitDocs.map((d, idx) => ({
      ...d,
      metadata: {
        ...d.metadata,
        source: filename,
        chunkId: uuidv4(),
        chunkIndex: idx,
        uploadedAt: new Date().toISOString(),
      },
    }));

    await cache.vectorStore.addDocuments(docsWithMeta);

    const documentId = uuidv4();
    cache.documentsMetadata.set(documentId, {
      id: documentId,
      filename: filename,
      chunks: splitDocs.length,
      uploadedAt: new Date().toISOString(),
      size: buffer.length,
    });

    await fs.unlink(tmpPath).catch(() => {});

    return res.json({
      success: true,
      message: "PDF uploaded and processed",
      documentId,
      chunks: splitDocs.length,
      filename: filename,
    });
  } catch (e) {
    console.error("Upload handler error:", e);
    return res.status(500).json({ error: "Upload failed", message: e.message });
  }
}
