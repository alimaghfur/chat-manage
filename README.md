# WhatsApp API Gateway

Multi-session WhatsApp REST API with Dashboard, Webhooks, and full management capabilities.

## Features

### Core
- REST API with full WhatsApp functionality
- Multi-session support (manage multiple WhatsApp accounts)
- Webhooks with HMAC-SHA256 signature verification
- API Key authentication with CIDR whitelisting
- Swagger/OpenAPI interactive documentation
- Rate limiting (per-key configurable)
- Audit logging

### Messaging
- Text messages (send/receive)
- Media messages (images, videos, documents, audio)
- Message reactions (emoji)
- Bulk messaging with configurable delay
- Message status tracking (sent/delivered/read)
- Reply to messages (quoted)

### Advanced
- Groups API (create, manage participants, send messages)
- Labels management (organize chats)
- Auto-replies (keyword-based with regex support)
- Broadcast campaigns
- Proxy support (per-session SOCKS5)

### Infrastructure
- SQLite (zero-config) or PostgreSQL
- Optional Redis caching
- Optional S3/MinIO media storage
- Docker one-command deployment
- Health checks (Kubernetes-ready)
- Data export/import migration tools

## Quick Start

### Option 1: Docker (Recommended)

```bash
docker-compose up -d
```

### Option 2: Manual

```bash
# Install dependencies
cd api && npm install

# Setup database
cp .env.example .env
npx prisma db push

# Start server
npm run dev
```

## API Documentation

Once running, visit: **http://localhost:3001/api-docs**

## Authentication

All API endpoints (except /health) require an API key:

```bash
# Header
curl -H "x-api-key: YOUR_KEY" http://localhost:3001/api/sessions

# Query param
curl http://localhost:3001/api/sessions?apiKey=YOUR_KEY
```

### Generate API Key

Use the master key to create API keys:

```bash
curl -X POST http://localhost:3001/api/keys \
  -H "x-api-key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Production", "rateLimit": 200}'
```

## Connect WhatsApp

### Via Pairing Code (Recommended)

```bash
curl -X POST http://localhost:3001/api/sessions/SESSION_ID/connect \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"method": "pairing", "phoneNumber": "628123456789"}'
```

### Via QR Code

```bash
curl -X POST http://localhost:3001/api/sessions/SESSION_ID/connect \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"method": "qr"}'
```

Listen on WebSocket for `qr` event.

## Send Messages

```bash
# Text
curl -X POST http://localhost:3001/api/messages/text \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "...", "to": "628xxx@s.whatsapp.net", "text": "Hello!"}'

# Media
curl -X POST http://localhost:3001/api/messages/media \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "...", "to": "628xxx@s.whatsapp.net", "type": "image", "mediaUrl": "https://...", "caption": "Check this!"}'
```

## Webhooks

Register webhook endpoints to receive real-time events:

```bash
curl -X POST http://localhost:3001/api/webhooks \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-server.com/webhook", "events": ["message", "status"], "secret": "my-secret"}'
```

Events: `message`, `status`, `connection`, `*` (all)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | file:./dev.db | Database connection string |
| PORT | 3001 | Server port |
| API_MASTER_KEY | - | Master key for /api/keys |
| REDIS_URL | - | Redis connection (optional) |
| S3_ENDPOINT | - | S3/MinIO endpoint (optional) |
| RATE_LIMIT_MAX_REQUESTS | 100 | Default rate limit per minute |

## License

MIT
