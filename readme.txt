### Setup

1. Clone the repository:
```bash
git clone https://github.com/darrenyong99/mcp-kali-linux.git
cd mcp-kali-linux
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
nano .env
```

Add your DeepSeek API key to `.env`:
```
DEEPSEEK_API_KEY=your_actual_api_key_here
```

## Usage

### Start Web Interface
```bash
npm run web
```

Access at: `http://localhost:8080`

### Start MCP Server
```bash
npm run mcp
```

### Using Scripts
```bash
# Start server
./scripts/start.sh

# Stop server
./scripts/stop.sh

# Deploy (pull + install + start)
./scripts/deploy.sh
```

## Project Structure
```
mcp-deepseek-server/
├── config/
│   └── deepseek-config.json
├── src/
│   ├── mcp-server.js
│   └── web-server.js
├── web/
│   └── public/
│       └── index.html
├── scripts/
│   ├── start.sh
│   ├── stop.sh
│   └── deploy.sh
├── .env
├── package.json
└── README.md
```

## API Endpoints

- `GET /api/health` - Check server status
- `POST /api/execute` - Execute DeepSeek query

## License

MIT
EOF
