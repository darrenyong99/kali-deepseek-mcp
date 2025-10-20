import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, "../.env");

dotenv.config({ path: envPath });

const execAsync = promisify(exec);
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

const KALI_TOOLS = {
  nmap: "Network scanning - nmap [target] [options]",
  nslookup: "DNS lookup - nslookup [domain]",
  ping: "Test connectivity - ping -c 4 [host]",
  traceroute: "Trace route - traceroute [host]",
  netstat: "Network stats - netstat -tuln",
  ifconfig: "Network config - ifconfig",
  dig: "DNS query - dig [domain]",
  whois: "Domain info - whois [domain]",
  curl: "HTTP requests - curl [url]",
  wget: "Download - wget [url]",
  ncat: "Network tool - ncat [options]",
  tcpdump: "Packet capture - tcpdump [options]",
};

async function executeCommand(command, args) {
  console.log(`\n⏳ Executing: ${command} ${args}`);
  
  try {
    const { stdout, stderr } = await execAsync(`${command} ${args}`, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    return stdout || stderr || "Command executed successfully";
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

async function callDeepSeek(userMessage) {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY.includes("YOUR_ACTUAL")) {
    console.log("\n❌ ERROR: DEEPSEEK_API_KEY not set in .env file");
    return;
  }

  const toolsList = Object.entries(KALI_TOOLS)
    .map(([tool, desc]) => `- ${tool}: ${desc}`)
    .join("\n");

  const systemPrompt = `You are a Kali Linux penetration testing assistant.

AVAILABLE TOOLS (you MUST use these when user asks):
${toolsList}

INSTRUCTIONS:
1. When user asks to run ANY command, you MUST respond with a function call
2. Format: <EXECUTE_TOOL>tool_name|arguments</EXECUTE_TOOL>
3. Do NOT ask for permission - execute immediately
4. Provide security analysis of results
5. Suggest next steps

EXAMPLE:
User: "Check DNS for google.com"
Response: <EXECUTE_TOOL>nslookup|google.com</EXECUTE_TOOL>

User: "Scan ports on 192.168.1.1"
Response: <EXECUTE_TOOL>nmap|192.168.1.1 -p 1-1000</EXECUTE_TOOL>`;

  try {
    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: false,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    const responseText = response.data.choices[0].message.content;
    console.log("\n🤖 AI Response:");
    console.log(responseText);

    // Check if DeepSeek wants to execute a tool
    const toolMatch = responseText.match(/<EXECUTE_TOOL>(\w+)\|([^<]+)<\/EXECUTE_TOOL>/);
    
    if (toolMatch) {
      const [, tool, args] = toolMatch;
      
      if (KALI_TOOLS[tool]) {
        const result = await executeCommand(tool, args);
        console.log("\n📊 Command Output:");
        console.log(result);

        // Get analysis from DeepSeek
        const analysisResponse = await axios.post(
          DEEPSEEK_API_URL,
          {
            model: DEEPSEEK_MODEL,
            messages: [
              { role: "system", content: "Analyze the command output and provide security insights." },
              { 
                role: "user", 
                content: `Command: ${tool} ${args}\n\nOutput:\n${result}` 
              },
            ],
            stream: false,
          },
          {
            headers: {
              Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log("\n📈 Analysis:");
        console.log(analysisResponse.data.choices[0].message.content);
      }
    }
  } catch (error) {
    console.error("\n❌ Error:", error.response?.data?.error?.message || error.message);
  }
}

async function main() {
  console.log("\n🐉 Kali Linux - DeepSeek Auto-Execute Mode");
  console.log("=" .repeat(50));
  console.log(`✅ API Key configured: ${!!DEEPSEEK_API_KEY && !DEEPSEEK_API_KEY.includes("YOUR_ACTUAL")}`);
  console.log("Commands execute automatically. Type 'exit' to quit.\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question("You: ", async (input) => {
      if (input.toLowerCase() === "exit") {
        console.log("\n👋 Goodbye!");
        rl.close();
        return;
      }

      if (input.trim()) {
        await callDeepSeek(input);
      }

      console.log("\n" + "=".repeat(50));
      askQuestion();
    });
  };

  askQuestion();
}

main();
