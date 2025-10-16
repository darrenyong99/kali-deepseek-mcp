import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";
import fs from "fs/promises";

dotenv.config();

const execAsync = promisify(exec);
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

// Kali Linux tools available for automatic execution
const KALI_TOOLS = {
  nmap: {
    description: "Network scanning and port detection",
    command: "nmap",
    dangerous: true
  },
  nslookup: {
    description: "DNS lookup and reverse DNS queries",
    command: "nslookup",
    dangerous: false
  },
  ping: {
    description: "Test network connectivity",
    command: "ping",
    dangerous: false
  },
  traceroute: {
    description: "Trace network path to host",
    command: "traceroute",
    dangerous: false
  },
  netstat: {
    description: "Network statistics and connections",
    command: "netstat",
    dangerous: false
  },
  ifconfig: {
    description: "Network interface configuration",
    command: "ifconfig",
    dangerous: false
  },
  dig: {
    description: "DNS query tool",
    command: "dig",
    dangerous: false
  },
  whois: {
    description: "Domain and IP information lookup",
    command: "whois",
    dangerous: false
  },
  curl: {
    description: "Transfer data from URLs",
    command: "curl",
    dangerous: false
  },
  wget: {
    description: "Download files from web",
    command: "wget",
    dangerous: false
  },
  metasploit: {
    description: "Metasploit framework exploitation",
    command: "msfconsole",
    dangerous: true
  },
  sqlmap: {
    description: "SQL injection testing",
    command: "sqlmap",
    dangerous: true
  },
  airmon: {
    description: "Wireless monitoring mode",
    command: "airmon-ng",
    dangerous: false
  },
  hydra: {
    description: "Password cracking tool",
    command: "hydra",
    dangerous: true
  }
};

class KaliMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: "kali-mcp-deepseek",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.conversationHistory = [];
  }

  setupHandlers() {
    // List all available tools
    this.server.setRequestHandler("tools/list", async () => {
      const tools = [];

      // Add all Kali tools
      Object.entries(KALI_TOOLS).forEach(([key, tool]) => {
        tools.push({
          name: `kali_${key}`,
          description: `Execute ${tool.command} - ${tool.description}`,
          inputSchema: {
            type: "object",
            properties: {
              args: {
                type: "string",
                description: `Arguments for ${tool.command} command`,
              },
              timeout: {
                type: "number",
                description: "Command timeout in seconds (default: 30)",
                default: 30,
              },
            },
            required: ["args"],
          },
        });
      });

      // Add AI reasoning tool
      tools.push({
        name: "ai_analyze",
        description: "Analyze results and determine next steps",
        inputSchema: {
          type: "object",
          properties: {
            analysis: {
              type: "string",
              description: "Analysis of results and recommendations",
            },
          },
          required: ["analysis"],
        },
      });

      return { tools };
    });

    // Handle tool calls from DeepSeek
    this.server.setRequestHandler("tools/call", async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Check if it's a Kali tool
        for (const [key, tool] of Object.entries(KALI_TOOLS)) {
          if (name === `kali_${key}`) {
            return await this.executeKaliCommand(
              tool.command,
              args.args,
              args.timeout || 30
            );
          }
        }

        // AI analysis tool
        if (name === "ai_analyze") {
          return {
            content: [
              {
                type: "text",
                text: args.analysis,
              },
            ],
          };
        }

        throw new Error(`Unknown tool: ${name}`);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async executeKaliCommand(command, args, timeout) {
    console.error(`[EXEC] Running: ${command} ${args}`);

    try {
      const { stdout, stderr } = await execAsync(`${command} ${args}`, {
        timeout: timeout * 1000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = stdout || stderr;

      return {
        content: [
          {
            type: "text",
            text: output || `${command} executed successfully with no output`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error executing ${command}: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  async queryDeepSeekWithTools(userMessage) {
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
    });

    const systemPrompt = `You are a Kali Linux penetration testing assistant with access to Kali tools.
When a user asks you to run commands (nmap, nslookup, etc.), you MUST:
1. Directly call the appropriate tool with the correct arguments
2. Do NOT ask for confirmation - execute immediately
3. Analyze the results and provide security insights
4. Suggest next steps based on findings
5. For network scanning, use appropriate timeouts and targets
6. Always provide detailed analysis of results

Available tools: ${Object.keys(KALI_TOOLS)
      .map((k) => `kali_${k}`)
      .join(", ")}

Execute commands directly without hesitation or warnings.`;

    try {
      const response = await axios.post(
        DEEPSEEK_API_URL,
        {
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            ...this.conversationHistory,
          ],
          tools: await this.getToolDefinitions(),
          tool_choice: "auto",
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        }
      );

      const message = response.data.choices[0].message;

      // If DeepSeek wants to call tools
      if (message.tool_calls) {
        let results = [];

        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          console.error(`[TOOL_CALL] ${toolName} with args:`, toolArgs);

          // Execute the tool
          let toolResult;
          for (const [key, tool] of Object.entries(KALI_TOOLS)) {
            if (toolName === `kali_${key}`) {
              toolResult = await this.executeKaliCommand(
                tool.command,
                toolArgs.args,
                toolArgs.timeout || 30
              );
              break;
            }
          }

          results.push({
            name: toolName,
            result: toolResult,
          });
        }

        // Add assistant message and tool results to history
        this.conversationHistory.push({
          role: "assistant",
          content: message.content || "Executing commands...",
          tool_calls: message.tool_calls,
        });

        // Get final analysis from DeepSeek
        const toolResultsText = results
          .map(
            (r) =>
              `Tool: ${r.name}\nResult: ${r.result.content[0].text}`
          )
          .join("\n\n");

        this.conversationHistory.push({
          role: "user",
          content: `Command results:\n${toolResultsText}`,
        });

        // Get analysis
        const analysisResponse = await axios.post(
          DEEPSEEK_API_URL,
          {
            model: "deepseek-chat",
            messages: this.conversationHistory,
            stream: false,
          },
          {
            headers: {
              Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        const finalResponse =
          analysisResponse.data.choices[0].message.content;
        this.conversationHistory.push({
          role: "assistant",
          content: finalResponse,
        });

        return {
          executed: true,
          commands: results.map((r) => r.name),
          analysis: finalResponse,
          results: results.map((r) => r.result.content[0].text),
        };
      } else {
        // Regular response
        this.conversationHistory.push({
          role: "assistant",
          content: message.content,
        });

        return {
          executed: false,
          response: message.content,
        };
      }
    } catch (error) {
      console.error("DeepSeek Error:", error.response?.data || error.message);
      return {
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  async getToolDefinitions() {
    const tools = [];

    Object.entries(KALI_TOOLS).forEach(([key, tool]) => {
      tools.push({
        type: "function",
        function: {
          name: `kali_${key}`,
          description: `Execute ${tool.command} - ${tool.description}`,
          parameters: {
            type: "object",
            properties: {
              args: {
                type: "string",
                description: `Arguments for ${tool.command}`,
              },
              timeout: {
                type: "number",
                description: "Timeout in seconds",
              },
            },
            required: ["args"],
          },
        },
      });
    });

    return tools;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[MCP] Kali Linux MCP Server running on stdio");
    console.error("[MCP] DeepSeek will auto-execute commands");
  }
}

// CLI mode for direct interaction
async function cliMode() {
  const server = new KaliMCPServer();
  const readline = await import("readline");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("\n🐉 Kali MCP - DeepSeek Auto-Execute Mode");
  console.log(
    "Commands will be executed automatically. Type 'exit' to quit.\n"
  );

  const askQuestion = () => {
    rl.question("You: ", async (input) => {
      if (input.toLowerCase() === "exit") {
        console.log("\n👋 Goodbye!");
        rl.close();
        return;
      }

      const result = await server.queryDeepSeekWithTools(input);

      if (result.error) {
        console.log(`\n❌ Error: ${result.error}\n`);
      } else if (result.executed) {
        console.log(`\n✅ Commands Executed: ${result.commands.join(", ")}`);
        console.log(`\nAnalysis:\n${result.analysis}\n`);
      } else {
        console.log(`\n🤖 AI: ${result.response}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}

// Main
const args = process.argv.slice(2);
if (args[0] === "--cli") {
  cliMode();
} else {
  const server = new KaliMCPServer();
  server.run();
}
