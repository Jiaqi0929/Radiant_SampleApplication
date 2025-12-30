// api/upload.js
import { initLangChain } from "./_init.js";
import { v4 as uuidv4 } from "uuid";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // TEMP test: no LangChain yet
    return res.status(200).json({
      success: true,
      message: "Upload received"
    });
  } catch (err) {
    return res.status(500).json({ error: "Upload failed" });
  }
}
