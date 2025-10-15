cat > scripts/stop.sh << 'EOF'
#!/bin/bash
echo "🛑 Stopping MCP DeepSeek Server..."
pkill -f "node src/web-server.js"
echo "✅ Server stopped"
EOF

chmod +x scripts/stop.sh
