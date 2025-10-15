#!/bin/bash
echo "🚀 Starting MCP DeepSeek Server..."
cd "$(dirname "$0")/.."
npm run web

chmod +x scripts/start.sh
