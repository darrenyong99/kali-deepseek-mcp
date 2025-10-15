#!/bin/bash
echo "🚀 Deploying MCP Kali Linux Server..."

cd "$(dirname "$0")/.."

# Pull latest from git if in a repo
if [ -d ".git" ]; then
    echo "📦 Pulling latest changes..."
    git pull origin main
fi

# Install dependencies
echo "📥 Installing dependencies..."
npm install

# Start the server
echo "🎯 Starting server..."
npm run web

echo "✅ Deployment complete!"
echo "📡 Web interface: http://0.0.0.0:8080"
chmod +x scripts/deploy.sh
