import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.WEB_SERVER_PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../web/public")));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    mode: "auto-execution",
    apiConfigured: process.env.DEEPSEEK_API_KEY !== "your_deepseek_api_key_here",
  });
});

app.post("/api/execute", async (req, res) => {
  const { instruction } = req.body;

  if (!instruction) {
    return res.status(400).json({ error: "Instruction required" });
  }

  // Spawn MCP server in CLI mode
  const mcpProcess = spawn("node", ["src/mcp-server.js", "--cli"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  let output = "";
  let error = "";

  mcpProcess.stdout.on("data", (data) => {
    output += data.toString();
  });

  mcpProcess.stderr.on("data", (data) => {
    error += data.toString();
  });

  // Send user instruction
  mcpProcess.stdin.write(instruction + "\n");

  // Wait for response
  setTimeout(() => {
    mcpProcess.stdin.write("exit\n");
  }, 60000);

  mcpProcess.on("close", (code) => {
    res.json({
      success: true,
      output: output || error,
    });
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Kali MCP API running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Auto-execution mode enabled`);
});
EOF

# Verify the file was created
ls -lh src/api-server.js
