import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";

dotenv.config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

class DeepSeekMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: "deepseek-mcp-kali",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupHandlers() {
    this.server.setRequestHandler("tools/list", async () => ({
      tools: [
        {
          name: "deepseek_query",
          description: "Query DeepSeek AI model with network chunking support",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The prompt to send to DeepSeek",
              },
              chunkSize: {
                type: "number",
                description: "Size of network chunks (default: 4096)",
                default: 4096,
              },
              temperature: {
                type: "number",
                description: "Sampling temperature (0-2)",
                default: 0.7,
              },
            },
            required: ["prompt"],
          },
        },
        {
          name: "kali_command",
          description: "Execute Kali Linux commands (use with caution)",
          inputSchema: {
            type: "object",
            properties: {
              command: {
                type: "string",
                description: "The command to execute",
              },
            },
            required: ["command"],
          },
        },
      ],
    }));

    this.server.setRequestHandler("tools/call", async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "deepseek_query":
            return await this.queryDeepSeek(args);
          case "kali_command":
            return await this.executeKaliCommand(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
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

    this.server.setRequestHandler("resources/list", async () => ({
      resources: [
        {
          uri: "config://deepseek",
          name: "DeepSeek Configuration",
          mimeType: "application/json",
          description: "Current DeepSeek configuration",
        },
      ],
    }));

    this.server.setRequestHandler("resources/read", async (request) => {
      const { uri } = request.params;

      if (uri === "config://deepseek") {
        const config = await fs.readFile("config/deepseek-config.json", "utf-8");
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: config,
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  async queryDeepSeek(args) {
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === "your_deepseek_api_key_here") {
      throw new Error("DEEPSEEK_API_KEY not configured. Please set it in .env file");
    }

    const { prompt, temperature = 0.7, chunkSize = 4096 } = args;

    const chunks = this.chunkText(prompt, chunkSize);
    let fullResponse = "";

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const response = await axios.post(
        DEEPSEEK_API_URL,
        {
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: "user",
              content: chunk,
            },
          ],
          temperature,
          stream: false,
        },
        {
          headers: {
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      fullResponse += response.data.choices[0].message.content;

      if (chunks.length > 1) {
        fullResponse += `\n\n--- Chunk ${i + 1}/${chunks.length} ---\n\n`;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: fullResponse,
        },
      ],
    };
  }

  async executeKaliCommand(args) {
    const { command } = args;
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    try {
      const { stdout, stderr } = await execAsync(command);
      return {
        content: [
          {
            type: "text",
            text: `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Command failed: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  chunkText(text, chunkSize) {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("DeepSeek MCP Server running on stdio");
  }
}

const server = new DeepSeekMCPServer();
server.run().catch(console.error);
