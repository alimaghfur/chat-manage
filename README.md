# WhatsApp Cloud API Gateway

Multi-session WhatsApp REST API Gateway using the **official Meta WhatsApp Cloud API** (Graph API v21.0), with Dashboard, Webhooks, and full management capabilities.

## Features

### Core
- REST API with full WhatsApp Cloud API functionality
- Multi-session support (manage multiple WhatsApp Business numbers)
- Official Meta WhatsApp Cloud API (no unofficial libraries)
- Webhooks with HMAC-SHA256 signature verification
- API Key authentication with CIDR whitelisting
- Swagger/OpenAPI interactive documentation
- Rate limiting (per-key configurable)
- Audit logging

### Messaging
- Text messages (send/receive)
- Media messages (images, videos, documents, audio)
- Template messages (pre-approved templates)
- Message reactions (emoji)
- Mark as read
- Bulk messaging with configurable delay
- Message status tracking (sent/delivered/read)

### Advanced
- Groups API (create, manage participants, send messages)
- Labels management (organize chats)
- Auto-replies (keyword-based with regex support)
- Broadcast campaigns
- Business Profile management

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

All API endpoints (except /health and /webhook) require an API key:

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


## Connect WhatsApp (Cloud API Setup)

### Prerequisites

1. **Create a Meta Business Account** at [business.facebook.com](https://business.facebook.com)
2. **Create a WhatsApp Business App** in [Meta Developers](https://developers.facebook.com)
3. **Get your credentials** from the WhatsApp section of your app:
   - **Phone Number ID** - Your WhatsApp Business phone number ID
   - **Access Token** - Permanent or temporary access token
   - **WhatsApp Business Account ID** - Your WABA ID

### Configure Webhook URL

In Meta Developers Console:
1. Go to WhatsApp > Configuration
2. Set Webhook URL to: `https://your-server.com/webhook`
3. Set Verify Token to match your `WA_WEBHOOK_VERIFY_TOKEN` env var
4. Subscribe to: `messages`, `message_deliveries`, `message_reads`

### Add Session via API

```bash
# Create a session with Cloud API credentials
curl -X POST http://localhost:3001/api/sessions \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Business",
    "phoneNumberId": "123456789012345",
    "accessToken": "EAABx...",
    "waBusinessId": "987654321098765"
  }'
```

### Verify Token

```bash
# Verify the token works
curl -X POST http://localhost:3001/api/sessions/SESSION_ID/connect \
  -H "x-api-key: YOUR_KEY"
```

## Send Messages

```bash
# Text
curl -X POST http://localhost:3001/api/messages/text \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "...", "to": "15551234567", "text": "Hello!"}'

# Media
curl -X POST http://localhost:3001/api/messages/media \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "...", "to": "15551234567", "type": "image", "mediaUrl": "https://...", "caption": "Check this!"}'

# Template
curl -X POST http://localhost:3001/api/messages/template \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "...", "to": "15551234567", "templateName": "hello_world", "languageCode": "en_US"}'

# Mark as Read
curl -X POST http://localhost:3001/api/messages/read \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "...", "messageId": "wamid.xxx"}'
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
| WA_CLOUD_API_URL | https://graph.facebook.com/v21.0 | Meta Graph API base URL |
| WA_WEBHOOK_VERIFY_TOKEN | - | Token for Meta webhook verification |
| REDIS_URL | - | Redis connection (optional) |
| S3_ENDPOINT | - | S3/MinIO endpoint (optional) |
| RATE_LIMIT_MAX_REQUESTS | 100 | Default rate limit per minute |

## Migration from Baileys

This version uses the official WhatsApp Cloud API instead of the unofficial Baileys library:

- **No QR codes or pairing codes** - Sessions are configured with API credentials
- **No local session storage** - No `sessions/` directory needed
- **No socket connections** - All communication via HTTP REST API
- **Official & supported** - Uses Meta's official Graph API
- **Webhook-based receiving** - Messages come in via Meta webhooks

## License

MIT
