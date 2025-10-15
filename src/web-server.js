cat > src/web-server.js << 'EOF'
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.WEB_SERVER_PORT || 8080;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../web/public")));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    apiConfigured: DEEPSEEK_API_KEY !== "your_deepseek_api_key_here",
  });
});

app.post("/api/execute", async (req, res) => {
  try {
    const { instruction } = req.body;

    if (!instruction) {
      return res.status(400).json({ error: "Instruction is required" });
    }

    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === "your_deepseek_api_key_here") {
      return res.status(500).json({
        error: "DeepSeek API key not configured. Please set DEEPSEEK_API_KEY in .env file",
      });
    }

    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [{ role: "user", content: instruction }],
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const output = response.data.choices[0].message.content;

    res.json({
      success: true,
      output,
      model: DEEPSEEK_MODEL,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    res.status(500).json({
      error: error.response?.data?.error?.message || error.message,
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Web interface running on http://0.0.0.0:${PORT}`);
  console.log(`📡 API endpoint: http://0.0.0.0:${PORT}/api`);
});
EOF
