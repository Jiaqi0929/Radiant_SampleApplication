// api/upload.js
import { initLangChain } from "./_init.js";
import formidable from "formidable";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const cache = await initLangChain();
    if (!cache?.ready) {
      return res.status(503).json({ error: "LangChain not initialized" });
    }

    const form = new formidable.IncomingForm({
      multiples: false,
      maxFileSize: 20 * 1024 * 1024
    });

    form.parse(req, async (err, fields, files) => {
      try {
        if (err) {
          return res.status(400).json({ error: "Upload parse error", details: err.message });
        }

        const f = files.file || files?.pdf || Object.values(files)[0];
        if (!f) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        const tmpPath = path.join(
          "/tmp",
          `${uuidv4()}_${f.originalFilename || f.newFilename || "upload.pdf"}`
        );

        await fs.copyFile(f.filepath || f.path, tmpPath);

        // ---- LOAD PDF ----
        const loader = new PDFLoader(tmpPath);
        const docs = await loader.load();

        // 🚨 CRITICAL GUARD
        if (!docs || docs.length === 0) {
          await fs.unlink(tmpPath).catch(() => {});
          return res.status(400).json({
            error: "No readable text found in PDF",
            message: "This PDF may be scanned or image-based. Please upload a text-based PDF."
          });
        }

        // 🚨 REMOVE EMPTY PAGE CONTENT
        const validDocs = docs.filter(
          d => typeof d.pageContent === "string" && d.pageContent.trim().length > 0
        );

        if (validDocs.length === 0) {
          await fs.unlink(tmpPath).catch(() => {});
          return res.status(400).json({
            error: "PDF contains no extractable text",
            message: "All pages were empty after extraction."
          });
        }

        // ---- SPLIT SAFELY ----
        const splitDocs = await cache.textSplitter.splitDocuments(validDocs);

        if (!splitDocs || splitDocs.length === 0) {
          await fs.unlink(tmpPath).catch(() => {});
          return res.status(400).json({
            error: "Text splitting failed",
            message: "Unable to split extracted PDF text."
          });
        }

        // ---- ADD METADATA ----
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

        const documentId = uuidv4();
        const stats = await fs.stat(tmpPath);

        cache.documentsMetadata.set(documentId, {
          id: documentId,
          filename: f.originalFilename || "uploaded.pdf",
          chunks: splitDocs.length,
          uploadedAt: new Date().toISOString(),
          size: stats.size
        });

        await fs.unlink(tmpPath).catch(() => {});

        return res.json({
          success: true,
          message: "PDF processed successfully",
          documentId,
          chunks: splitDocs.length,
          filename: f.originalFilename || "uploaded.pdf"
        });
      } catch (innerError) {
        console.error("Upload processing error:", innerError);
        return res.status(500).json({
          error: "Upload failed",
          message: innerError.message
        });
      }
    });
  } catch (outerError) {
    console.error("Upload handler fatal error:", outerError);
    return res.status(500).json({
      error: "Server error",
      message: outerError.message
    });
  }
}
