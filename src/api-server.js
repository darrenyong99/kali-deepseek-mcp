import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import { execSync, exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, "../.env");

dotenv.config({ path: envPath });

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.WEB_SERVER_PORT || 8080;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "../web/public")));

// Memory storage for execution history
let executionHistory = [];
const MAX_HISTORY = 20; // Keep last 20 executions

// Lazy-load tool packages only when needed
const TOOL_PACKAGES = {
  ping: "iputils-ping",
  nslookup: "dnsutils",
  dig: "dnsutils",
  host: "dnsutils",
  nmap: "nmap",
  traceroute: "traceroute",
  whois: "whois",
  curl: "curl",
  wget: "wget",
  netstat: "net-tools",
  ifconfig: "net-tools",
  arp: "net-tools",
};

console.log("[INIT] Kali MCP Optimized - On-Demand Install");

app.get("/api/health", (req, res) => {
  const hasKey = DEEPSEEK_API_KEY && !DEEPSEEK_API_KEY.includes("YOUR_ACTUAL");
  res.json({ 
    status: "ok", 
    apiConfigured: hasKey,
    historyCount: executionHistory.length
  });
});

app.get("/api/history", (req, res) => {
  res.json({ history: executionHistory });
});

function addToHistory(entry) {
  executionHistory.unshift({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  
  if (executionHistory.length > MAX_HISTORY) {
    executionHistory = executionHistory.slice(0, MAX_HISTORY);
  }
}

async function installTool(toolName, packageName) {
  try {
    console.log(`[INSTALL] ${packageName}`);
    // Silent install, no output
    execSync(`apt-get install -y ${packageName}`, {
      timeout: 120000,
      stdio: "ignore",
    });
    console.log(`[INSTALL] ✅ ${packageName}`);
    return true;
  } catch (error) {
    console.log(`[INSTALL] ⚠️ ${packageName}`);
    return false;
  }
}

async function toolExists(toolName) {
  try {
    execSync(`which ${toolName}`, { timeout: 2000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function executeKaliCommand(toolName, args) {
  console.log(`[EXEC] ${toolName} ${args}`);

  // Check if tool exists
  let exists = await toolExists(toolName);

  // If not, try to install
  if (!exists && TOOL_PACKAGES[toolName]) {
    const pkg = TOOL_PACKAGES[toolName];
    const installed = await installTool(toolName, pkg);
    if (installed) {
      exists = await toolExists(toolName);
    }
  }

  if (!exists) {
    return `ERROR: ${toolName} not available`;
  }

  try {
    // Add timeout to prevent hanging (especially for ping)
    let finalArgs = args;
    
    // Auto-limit ping to 4 packets if user didn't specify
    if (toolName === "ping" && !args.includes("-c") && !args.includes("-n")) {
      finalArgs = `-c 4 ${args}`;
    }

    const { stdout, stderr } = await execAsync(`${toolName} ${finalArgs}`, {
      timeout: 15000, // Shorter timeout
      maxBuffer: 10 * 1024 * 1024,
      shell: "/bin/bash",
    });

    const result = (stdout || stderr || "Success").substring(0, 1500);
    console.log(`[EXEC] ✅`);
    return result;
  } catch (error) {
    const msg = error.message || error.toString();
    return `TIMEOUT/ERROR: ${msg.substring(0, 200)}`;
  }
}

app.post("/api/execute", async (req, res) => {
  const { instruction } = req.body;

  if (!instruction) return res.status(400).json({ error: "Instruction required" });
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY.includes("YOUR_ACTUAL")) {
    return res.status(400).json({ error: "API key not configured" });
  }

  try {
    // Ultra-fast prompt - minimal tokens
    const systemPrompt = `Kali Linux pentesting AI. Execute tools immediately.
Tools: ping nslookup dig host nmap traceroute whois curl wget netstat ifconfig

Request: "${instruction}"

EXECUTE: [tool] [args]
NO TALK. JUST EXECUTE.`;

    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [{ role: "user", content: systemPrompt }],
        temperature: 0.2,
        max_tokens: 100, // Minimal tokens
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const aiResponse = response.data.choices[0].message.content;
    const execMatch = aiResponse.match(/EXECUTE:\s*(\w+)\s+(.+?)(?:\n|$)/);

    if (execMatch) {
      const [, tool, args] = execMatch;
      const output = await executeKaliCommand(tool, args);

      // Quick analysis
      const analysisResponse = await axios.post(
        DEEPSEEK_API_URL,
        {
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: "user",
              content: `1 sentence analysis: ${tool} ${args} returned: ${output.substring(0, 300)}`,
            },
          ],
          temperature: 0.2,
          max_tokens: 80,
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 20000,
        }
      );

      const analysis = analysisResponse.data.choices[0].message.content;
      const entry = {
        command: `${tool} ${args}`,
        output,
        analysis,
      };

      addToHistory(entry);

      return res.json({
        success: true,
        executed: true,
        ...entry,
        historyCount: executionHistory.length,
      });
    }

    return res.json({
      success: true,
      executed: false,
      response: aiResponse,
    });

  } catch (error) {
    console.error("[ERROR]", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Add new tool dynamically
app.post("/api/add-tool", (req, res) => {
  const { toolName, packageName } = req.body;
  
  if (!toolName || !packageName) {
    return res.status(400).json({ error: "Need toolName and packageName" });
  }

  TOOL_PACKAGES[toolName] = packageName;
  console.log(`[TOOLS] Added: ${toolName} -> ${packageName}`);
  
  res.json({ success: true, message: `Added ${toolName}` });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Kali MCP Optimized\n`);
});
