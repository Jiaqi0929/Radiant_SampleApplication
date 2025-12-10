// api/upload.js
import { initLangChain } from "./_init.js";
import formidable from "formidable";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";

export const config = {
  api: { bodyParser: false } // ensure raw request available for formidable (Vercel uses this flag)
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const cache = await initLangChain();
  if (!cache.ready) return res.status(503).json({ error: "LangChain not initialized" });

  const form = new formidable.IncomingForm({ multiples: false, maxFileSize: 20 * 1024 * 1024 });
  form.parse(req, async (err, fields, files) => {
    try {
      if (err) return res.status(400).json({ error: "Upload parse error", details: err.message });
      const f = files.file || files?.pdf || Object.values(files)[0];
      if (!f) return res.status(400).json({ error: "No file uploaded" });

      const tmpPath = path.join("/tmp", `${uuidv4()}_${f.originalFilename || f.newFilename}`);
      // formidable may store in place; move/copy to tmpPath
      await fs.copyFile(f.filepath || f.path, tmpPath);

      // Load PDF via PDFLoader (expects filepath)
      const loader = new PDFLoader(tmpPath);
      const docs = await loader.load();

      // split
      const splitDocs = await cache.textSplitter.splitDocuments(docs);

      // Add metadata
      const docsWithMeta = splitDocs.map((d, idx) => ({
        ...d,
        metadata: {
          ...d.metadata,
          source: f.originalFilename || "uploaded.pdf",
          chunkId: uuidv4(),
          chunkIndex: idx,
          uploadedAt: new Date().toISOString()
        }
      }));

      await cache.vectorStore.addDocuments(docsWithMeta);

      // store doc metadata
      const documentId = uuidv4();
      cache.documentsMetadata.set(documentId, {
        id: documentId,
        filename: f.originalFilename || "uploaded.pdf",
        chunks: splitDocs.length,
        uploadedAt: new Date().toISOString(),
        size: (await fs.stat(tmpPath)).size
      });

      // cleanup tmp file
      await fs.unlink(tmpPath).catch(() => {});

      return res.json({
        success: true,
        message: "PDF processed with LangChain RAG",
        documentId,
        chunks: splitDocs.length,
        filename: f.originalFilename || "uploaded.pdf"
      });
    } catch (error) {
      console.error("Upload handler error:", error);
      return res.status(500).json({ error: "Upload failed", message: error.message });
    }
  });
}
