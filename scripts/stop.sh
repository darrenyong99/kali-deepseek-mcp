#!/bin/bash
echo "🛑 Stopping MCP DeepSeek Server..."
pkill -f "node src/web-server.js"
echo "✅ Server stopped"
chmod +x scripts/stop.sh
