cat > scripts/start.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting MCP DeepSeek Server..."
cd "$(dirname "$0")/.."
npm run web
EOF

chmod +x scripts/start.sh
