# Quick Start - Production Deployment

## Prerequisites

- Node.js 18+ installed
- Supabase project (URL + service role key)
- OpenAI API key
- Pinecone index
- (Optional) Domain with SSL certificate

---

## Step 1: Install Dependencies

```bash
cd backend
npm install
```

Dependencies installed:
- `express` - Web server
- `helmet` - Security headers
- `compression` - Response compression
- `express-rate-limit` - Rate limiting
- `lru-cache` - In-memory caching
- `pino` & `pino-http` - Structured logging
- `zod` - Input validation
- `@supabase/supabase-js` - Database client

---

## Step 2: Configure Environment

Create `backend/.env`:

```bash
# Required - AI Services
OPENAI_API_KEY=sk-proj-YOUR_KEY_HERE
PINECONE_API_KEY=pcsk_YOUR_KEY_HERE
PINECONE_HOST=https://gobahrain-xxx.svc.aped-xxxx-xxxx.pinecone.io

# Required - Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Production Settings
NODE_ENV=production
PORT=4000
LOG_LEVEL=info

# CORS - Add your domains (comma-separated)
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Admin Key (generate a secure random string)
ADMIN_API_KEY=admin_$(openssl rand -hex 32)

# Optional - RAG Configuration
RAG_MIN_PINECONE_SCORE=0.7
PINECONE_RAG_NAMESPACE=
```

**Security Note**: Never commit `.env` to git!

---

## Step 3: Run Database Migration

In Supabase SQL Editor, run:

```sql
-- File: database/migrations/009_community_optimizations.sql
```

This creates:
- 5 indexes for query performance
- 2 atomic upvote functions
- 1 optimized comment counting function

Verify:

```sql
-- Check indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'community';

-- Check functions
SELECT proname FROM pg_proc WHERE proname LIKE '%community%';
```

Expected indexes:
- `idx_community_trending`
- `idx_community_recent`
- `idx_community_user_posts`
- `idx_community_client_posts`
- `idx_community_hashtags`
- `idx_community_comment_aggregate`

---

## Step 4: Start Backend

### Development (with auto-reload)

```bash
npm run dev
```

### Production

```bash
npm start
```

Or with PM2:

```bash
npm install -g pm2
pm2 start src/index.js --name gobahrain-api
pm2 save
pm2 startup
```

---

## Step 5: Verify Deployment

### Health Check

```bash
curl http://localhost:4000/health
```

Expected:
```json
{
  "status": "ok",
  "timestamp": "2026-05-19T18:00:00.000Z",
  "uptime": 10
}
```

### Test Chat Endpoint

```bash
curl -X POST http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "best restaurants in Manama"}'
```

Expected:
```json
{
  "reply": "Here are some great restaurants...",
  "grounded": true,
  "retrieved_count": 5,
  "latency_ms": 450,
  "timings": {
    "embedding_ms": 120,
    "pinecone_ms": 180,
    "supabase_ms": 45,
    "chat_ms": 105
  }
}
```

### Test AI Plan Endpoint

```bash
curl -X POST http://localhost:4000/api/ai-plan/hydrated-catalog \
  -H "Content-Type: application/json" \
  -d '{
    "preferenceLabels": ["beach", "culture"],
    "foodLabels": ["Arabic", "Seafood"]
  }'
```

### Check Cache Stats

```bash
curl http://localhost:4000/metrics
```

Expected:
```json
{
  "cache": {
    "embeddings": { "size": 2, "max": 500 },
    "pinecone": { "size": 1, "max": 200 },
    ...
  },
  "memory": {
    "heapUsed": 85,
    "heapTotal": 120,
    "rss": 145
  },
  "uptime": 120
}
```

---

## Step 6: Update Frontend

Update `EXPO_PUBLIC_AI_BACKEND_URL` in your app's `.env`:

```bash
# Development
EXPO_PUBLIC_AI_BACKEND_URL=http://localhost:4000

# Production
EXPO_PUBLIC_AI_BACKEND_URL=https://api.yourdomain.com
```

Restart Expo:

```bash
npm start
```

---

## Step 7: Production Checklist

### Security

- [ ] Environment variables configured (no hardcoded keys)
- [ ] CORS restricted to your domains
- [ ] ADMIN_API_KEY set (for cache clearing)
- [ ] Helmet middleware active (check response headers)
- [ ] Rate limiting active (test with 31+ rapid requests)

### Performance

- [ ] Database migration applied (check indexes)
- [ ] Cache working (check `/metrics` after a few requests)
- [ ] HTTP cache headers present (check `Cache-Control` in responses)
- [ ] Compression active (check `Content-Encoding: gzip` in responses)

### Monitoring

- [ ] Health endpoint accessible: `/health`
- [ ] Metrics endpoint accessible: `/metrics`
- [ ] Logs showing structured JSON (if NODE_ENV=production)
- [ ] Error tracking configured (Sentry recommended)

---

## Common Issues

### "CORS policy violation"

Your frontend domain isn't in `CORS_ORIGINS`.

**Fix**: Add to `.env`:
```bash
CORS_ORIGINS=https://yourapp.com,http://localhost:19006
```

### "message is required" even with message

Request body isn't being parsed as JSON.

**Fix**: Check `Content-Type: application/json` header in request.

### "Supabase client fetch: ..." error

Service role key is wrong or Supabase URL is incorrect.

**Fix**: Verify keys in Supabase dashboard > Settings > API.

### Cache not working (always X-Cache: MISS)

Cache keys might be too unique (e.g., timestamps in body).

**Check**: `/metrics` endpoint - cache sizes should grow.

### High latency (>2s)

Cold start on first request is normal. Subsequent should be <500ms.

**Check**:
- Cache hit rate: aim for >40%
- Network: ensure backend and Supabase are in same region
- Pinecone: verify index has data

---

## Load Testing

### Install autocannon

```bash
npm install -g autocannon
```

### Test Chat Endpoint

```bash
autocannon -c 10 -d 30 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"best restaurants"}' \
  http://localhost:4000/chat
```

Target: 200+ req/sec with <500ms avg latency

### Test AI Plan Endpoint

```bash
autocannon -c 5 -d 30 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"day trip to Manama"}' \
  http://localhost:4000/api/ai-plan
```

Target: 50+ req/sec (OpenAI generation is slower)

---

## Scaling Beyond 1 Node

### Option 1: PM2 Cluster Mode

```bash
pm2 start src/index.js -i max --name gobahrain-api
```

Uses all CPU cores (4x-8x capacity).

### Option 2: Docker + Load Balancer

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 4000
CMD ["node", "src/index.js"]
```

Deploy multiple containers behind Nginx/ALB.

### Option 3: Serverless (AWS Lambda, Cloud Run)

**Note**: LRU cache won't persist between invocations. Consider Redis.

---

## Cost Optimization Tips

1. **Monitor cache hit rate** (`/metrics`) - aim for >50%
2. **Tune TTLs** in `cacheService.js` based on usage patterns
3. **Adjust rate limits** if abuse detected
4. **Use Supabase connection pooler** if high query volume
5. **Consider OpenAI batch API** for non-real-time requests

---

## Rollback Plan

If issues occur after deployment:

1. **Revert frontend**: Comment out `EXPO_PUBLIC_AI_BACKEND_URL`
2. **Database**: No destructive changes - indexes are additive
3. **Backend**: Stop PM2 service: `pm2 stop gobahrain-api`

Old client code still works - database functions are backwards compatible.

---

## Next Steps

- [ ] Set up monitoring (Datadog, New Relic, or CloudWatch)
- [ ] Configure alerting (uptime, error rate, cost thresholds)
- [ ] Add Sentry for error tracking
- [ ] Set up automated backups (Supabase handles DB, backup `.env` securely)
- [ ] Document API for team (consider OpenAPI/Swagger)
- [ ] Load test with realistic traffic patterns

---

## Support

- Backend docs: `backend/PRODUCTION_OPTIMIZATIONS.md`
- Database migrations: `database/migrations/009_community_optimizations.sql`
- Health check: `GET /health`
- Metrics: `GET /metrics`
