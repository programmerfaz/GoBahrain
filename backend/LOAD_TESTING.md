# Load Testing Guide - GoBahrain Backend

This guide shows you how to test your backend's capacity and verify it can handle production traffic.

---

## Quick Start - Install Testing Tools

```bash
# Install autocannon (fastest Node.js load testing tool)
npm install -g autocannon

# Alternative: Install k6 (more features, scripts)
brew install k6  # macOS
# or download from https://k6.io/docs/getting-started/installation/

# Alternative: Apache Bench (comes with macOS)
# No installation needed
```

---

## Test 1: Basic Health Check

**Goal**: Verify the server starts and responds

```bash
# Start your backend
cd backend
npm start

# In another terminal, test health endpoint
curl http://localhost:4000/health
```

**Expected Response**:
```json
{
  "status": "ok",
  "timestamp": "2026-05-19T20:39:00.000Z",
  "uptime": 10
}
```

✅ **Pass**: Server is running and responding

---

## Test 2: Single Request - Latency Test

**Goal**: Measure response time for one request

### Test Chat Endpoint

```bash
time curl -X POST http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"best restaurants in Manama"}'
```

**What to Check**:
- First request (cold start): 1-2 seconds is normal
- Second request (warm): Should be <500ms
- Third+ requests (cached): Should be <100ms with cache hit

### Test AI Plan Endpoint

```bash
time curl -X POST http://localhost:4000/api/ai-plan/hydrated-catalog \
  -H "Content-Type: application/json" \
  -d '{
    "preferenceLabels": ["beach", "culture"],
    "foodLabels": ["Arabic", "Seafood"]
  }'
```

**Expected**:
- First request: 2-4 seconds (4 embeddings + 4 Pinecone queries + Supabase)
- Cached requests: <200ms

---

## Test 3: Concurrent Users - Autocannon

**Goal**: Simulate multiple users hitting your API simultaneously

### Install Autocannon

```bash
npm install -g autocannon
```

### Test 10 Concurrent Users for 30 Seconds

```bash
# Test chat endpoint
autocannon -c 10 -d 30 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"best restaurants"}' \
  http://localhost:4000/chat
```

**Parameters**:
- `-c 10` = 10 concurrent connections (users)
- `-d 30` = Duration 30 seconds
- `-m POST` = HTTP POST method
- `-H` = Headers
- `-b` = Request body

**Expected Output**:
```
Running 30s test @ http://localhost:4000/chat
10 connections

┌─────────┬──────┬──────┬───────┬──────┬─────────┬─────────┬──────────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%  │ Avg     │ Stdev   │ Max      │
├─────────┼──────┼──────┼───────┼──────┼─────────┼─────────┼──────────┤
│ Latency │ 200ms│ 450ms│ 800ms │ 950ms│ 465ms   │ 180ms   │ 1200ms   │
└─────────┴──────┴──────┴───────┴──────┴─────────┴─────────┴──────────┘

Req/Sec   : 22
Bytes/Sec : 45 kB

6.6k requests in 30s, 1.35 MB read
```

**Good Results** ✅:
- Avg latency: <500ms
- p99 latency: <1000ms
- Throughput: >20 req/sec (with caching)
- Errors: 0

**Bad Results** ❌:
- Avg latency: >2000ms
- Errors: >1%
- Timeouts
- Server crashes

### Test Different Endpoints

```bash
# Test AI plan (slower, more expensive)
autocannon -c 5 -d 30 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"day trip to Manama"}' \
  http://localhost:4000/api/ai-plan

# Test hydrated catalog
autocannon -c 5 -d 30 -m POST \
  -H "Content-Type: application/json" \
  -b '{"preferenceLabels":["beach"],"foodLabels":["Arabic"]}' \
  http://localhost:4000/api/ai-plan/hydrated-catalog
```

---

## Test 4: Stress Test - Find Breaking Point

**Goal**: Find the maximum capacity before things break

### Gradual Ramp-Up

```bash
# Start with 5 users
autocannon -c 5 -d 30 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"restaurants"}' \
  http://localhost:4000/chat

# Increase to 10 users
autocannon -c 10 -d 30 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"restaurants"}' \
  http://localhost:4000/chat

# Increase to 20 users
autocannon -c 20 -d 30 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"restaurants"}' \
  http://localhost:4000/chat

# Increase to 50 users
autocannon -c 50 -d 30 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"restaurants"}' \
  http://localhost:4000/chat
```

**What to Watch**:
- When does latency exceed 1 second?
- When do errors start appearing?
- When does throughput stop increasing?

**Typical Breaking Points**:
- Single Node.js process: ~50-100 concurrent users
- With PM2 cluster (4 cores): ~200-400 concurrent users

---

## Test 5: Rate Limit Testing

**Goal**: Verify rate limiting works

```bash
# Send 35 requests rapidly (limit is 30 per 15 minutes)
for i in {1..35}; do
  curl -X POST http://localhost:4000/chat \
    -H "Content-Type: application/json" \
    -d '{"message":"test"}' \
    -w "\nStatus: %{http_code}\n" &
done

wait
```

**Expected**:
- First 30 requests: Status 200
- Requests 31-35: Status 429 (Too Many Requests)

**Response on Rate Limit**:
```json
{
  "error": "Too many AI requests, please try again later"
}
```

---

## Test 6: Cache Performance Test

**Goal**: Verify caching is working and measure hit rate

### Test Cache Hit

```bash
# Request 1 (MISS - not in cache)
curl -X POST http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"best restaurants"}' \
  -i | grep X-Cache
# Expected: X-Cache: MISS

# Request 2 (HIT - in cache, much faster)
curl -X POST http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"best restaurants"}' \
  -i | grep X-Cache
# Expected: X-Cache: HIT
```

### Check Cache Statistics

```bash
curl http://localhost:4000/metrics | jq '.cache'
```

**Expected Output**:
```json
{
  "embeddings": { "size": 45, "max": 500 },
  "pinecone": { "size": 23, "max": 200 },
  "openai": { "size": 12, "max": 100 },
  "rag": { "size": 8, "max": 50 },
  "hydratedCatalog": { "size": 15, "max": 100 },
  "totalMemoryMB": 8
}
```

**Good Cache Performance** ✅:
- Cache size growing over time
- X-Cache: HIT on repeated requests
- Latency <100ms on cache hits

---

## Test 7: Sustained Load Test

**Goal**: Test if server can handle sustained traffic over time

```bash
# Run for 5 minutes with 10 concurrent users
autocannon -c 10 -d 300 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"restaurants"}' \
  http://localhost:4000/chat
```

**What to Watch**:
- Memory usage (should stabilize, not grow infinitely)
- CPU usage (should be steady)
- Latency (should remain consistent)
- No memory leaks (check with `curl http://localhost:4000/metrics`)

---

## Test 8: Real-World Scenario

**Goal**: Simulate actual user behavior with mixed endpoints

### Create Test Script

Save as `load-test.sh`:

```bash
#!/bin/bash

# Mix of different requests like real users
for i in {1..100}; do
  # 40% chat requests
  if [ $((RANDOM % 10)) -lt 4 ]; then
    curl -X POST http://localhost:4000/chat \
      -H "Content-Type: application/json" \
      -d '{"message":"restaurants"}' \
      -s -o /dev/null -w "Chat: %{http_code} %{time_total}s\n" &
  
  # 30% AI plan requests
  elif [ $((RANDOM % 10)) -lt 7 ]; then
    curl -X POST http://localhost:4000/api/ai-plan \
      -H "Content-Type: application/json" \
      -d '{"message":"day trip"}' \
      -s -o /dev/null -w "Plan: %{http_code} %{time_total}s\n" &
  
  # 20% hydrated catalog
  elif [ $((RANDOM % 10)) -lt 9 ]; then
    curl -X POST http://localhost:4000/api/ai-plan/hydrated-catalog \
      -H "Content-Type: application/json" \
      -d '{"preferenceLabels":["beach"]}' \
      -s -o /dev/null -w "Catalog: %{http_code} %{time_total}s\n" &
  
  # 10% metrics
  else
    curl http://localhost:4000/metrics \
      -s -o /dev/null -w "Metrics: %{http_code} %{time_total}s\n" &
  fi
  
  # Random delay between requests (0.5-2 seconds)
  sleep 0.$((RANDOM % 20 + 5))
done

wait
```

Run it:

```bash
chmod +x load-test.sh
./load-test.sh
```

---

## Test 9: Database Query Performance

**Goal**: Verify database optimizations are working

### Test Trending Feed Performance

```bash
# Run in Supabase SQL Editor
EXPLAIN ANALYZE
SELECT * FROM community
ORDER BY num_of_upvote DESC, created_at DESC, community_uuid DESC
LIMIT 15;
```

**Expected**:
- Execution time: <50ms
- Uses index: `idx_community_trending`

### Test User Posts Performance

```bash
EXPLAIN ANALYZE
SELECT * FROM community
WHERE user_a_uuid = 'some-user-uuid'
ORDER BY created_at DESC
LIMIT 20;
```

**Expected**:
- Execution time: <20ms
- Uses index: `idx_community_user_posts`

---

## Test 10: Monitoring Dashboard

**Goal**: Watch server metrics in real-time

### Method 1: Terminal Dashboard

```bash
# In one terminal: Start backend
cd backend && npm start

# In another terminal: Watch metrics
watch -n 2 'curl -s http://localhost:4000/metrics | jq'
```

### Method 2: Continuous Requests

```bash
# In terminal 1: Start backend
npm start

# In terminal 2: Generate load
autocannon -c 10 -d 300 http://localhost:4000/chat

# In terminal 3: Watch metrics
watch -n 2 'curl -s http://localhost:4000/metrics | jq ".cache, .memory"'
```

**What to Watch**:
- Cache sizes increasing ✅
- Memory stable (not growing infinitely) ✅
- Heap usage <512MB ✅

---

## Performance Benchmarks

### Expected Results by Endpoint

| Endpoint | Cold Start | Warm (Uncached) | Cached | Throughput |
|----------|------------|-----------------|--------|------------|
| `/health` | 5ms | 5ms | 5ms | 1000 req/sec |
| `/metrics` | 10ms | 10ms | 10ms | 500 req/sec |
| `/chat` | 1500ms | 450ms | 80ms | 200 req/sec |
| `/api/ai-plan` | 2000ms | 800ms | 100ms | 100 req/sec |
| `/api/ai-plan/hydrated-catalog` | 4000ms | 1200ms | 150ms | 50 req/sec |

### Capacity by Configuration

| Setup | Concurrent Users | Requests/Hour | Requests/Day |
|-------|------------------|---------------|--------------|
| Single process | 50-100 | 10,000 | 240,000 |
| PM2 cluster (4 cores) | 200-400 | 40,000 | 960,000 |
| 3 instances + LB | 600-1200 | 120,000 | 2,880,000 |

---

## Troubleshooting Load Test Issues

### Issue: High Error Rate

**Symptoms**: >5% of requests fail

**Possible Causes**:
1. Rate limiting triggered
2. Database connection pool exhausted
3. OpenAI/Pinecone API errors
4. Memory exhaustion

**Debug**:
```bash
# Check logs
tail -f backend/logs/*.log

# Check memory
curl http://localhost:4000/metrics | jq '.memory'

# Check rate limit headers
curl -i http://localhost:4000/chat | grep RateLimit
```

### Issue: High Latency

**Symptoms**: p99 latency >2 seconds

**Possible Causes**:
1. Cache not working
2. Cold start
3. Slow database queries
4. Network issues

**Debug**:
```bash
# Check cache hit rate
curl http://localhost:4000/metrics | jq '.cache'

# Check X-Cache header
curl -i http://localhost:4000/chat | grep X-Cache

# Run multiple identical requests
for i in {1..5}; do
  time curl -X POST http://localhost:4000/chat \
    -H "Content-Type: application/json" \
    -d '{"message":"restaurants"}'
done
```

### Issue: Memory Leak

**Symptoms**: Memory grows continuously

**Debug**:
```bash
# Watch memory over time
watch -n 5 'curl -s http://localhost:4000/metrics | jq ".memory"'

# If heapUsed keeps growing: restart and investigate
pm2 restart gobahrain-api
```

### Issue: Server Crashes

**Symptoms**: Server stops responding under load

**Possible Causes**:
1. Out of memory
2. Uncaught exceptions
3. Event loop blocked

**Fix**:
```bash
# Use PM2 for automatic restarts
pm2 start backend/src/index.js --name gobahrain-api --max-memory-restart 1G

# Enable error logging
LOG_LEVEL=debug npm start
```

---

## Production Monitoring Setup

### After deployment, monitor these metrics:

1. **Request Rate**
   - Target: 10-100 req/sec sustained
   - Alert if: >500 req/sec (possible attack)

2. **Latency (p95)**
   - Target: <500ms
   - Alert if: >1000ms for 5 minutes

3. **Error Rate**
   - Target: <1%
   - Alert if: >5%

4. **Cache Hit Rate**
   - Target: >40%
   - Alert if: <20% (cache not working)

5. **Memory Usage**
   - Target: <512MB
   - Alert if: >1GB or growing >10MB/hour

6. **API Costs**
   - Target: <$20/day
   - Alert if: >$50/day (possible abuse)

---

## Quick Load Test Commands

```bash
# Quick smoke test (1 minute, 10 users)
autocannon -c 10 -d 60 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"test"}' \
  http://localhost:4000/chat

# Medium load test (5 minutes, 20 users)
autocannon -c 20 -d 300 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"test"}' \
  http://localhost:4000/chat

# Stress test (find breaking point)
autocannon -c 50 -d 60 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"test"}' \
  http://localhost:4000/chat

# Cache performance test
autocannon -c 10 -d 60 -m POST \
  -H "Content-Type: application/json" \
  -b '{"message":"same message"}' \
  http://localhost:4000/chat
```

---

## Next Steps

After load testing:

1. ✅ Verify all endpoints respond correctly
2. ✅ Confirm cache hit rate >40%
3. ✅ Ensure latency <500ms (p95)
4. ✅ Check rate limiting works
5. ✅ Monitor memory doesn't leak
6. ✅ Test sustained load (5+ minutes)
7. 📝 Document your capacity limits
8. 🚀 Deploy to production
9. 📊 Set up monitoring alerts
10. 🔄 Re-test after major changes
