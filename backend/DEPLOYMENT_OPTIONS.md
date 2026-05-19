# Backend Deployment Guide - Where & How

This guide covers the best platforms to deploy your GoBahrain backend and step-by-step instructions.

---

## 🎯 Recommended Platforms (Easiest to Hardest)

### Quick Comparison

| Platform | Ease | Cost | Best For |
|----------|------|------|----------|
| **Railway** ⭐ | Easiest | $5-10/mo | Quick deployment, scaling |
| **Render** ⭐ | Very Easy | $7/mo | Simple setup, good UI |
| **Fly.io** | Easy | $5/mo | Edge deployment, fast |
| **DigitalOcean** | Medium | $6/mo | Control, reliability |
| **AWS/GCP** | Hard | Variable | Enterprise scale |

---

## 🚀 Option 1: Railway (RECOMMENDED - Easiest)

**Why Railway?**
- ✅ Deploy in 2 minutes
- ✅ Automatic HTTPS
- ✅ Environment variables UI
- ✅ Auto-deploys from GitHub
- ✅ Great for Node.js

### Step-by-Step

#### 1. Sign Up
```
Go to: https://railway.app
Sign up with GitHub
```

#### 2. Create New Project
```
Click "New Project"
→ Select "Deploy from GitHub repo"
→ Connect your repository
→ Select "backend" folder as root
```

#### 3. Configure Environment Variables

In Railway dashboard, add these variables:

```bash
# Required
NODE_ENV=production
PORT=4000

# AI Services
OPENAI_API_KEY=sk-proj-...
PINECONE_API_KEY=pcsk_...
PINECONE_HOST=https://...

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Security
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
ADMIN_API_KEY=your-secure-key

# Optional
LOG_LEVEL=info
RAG_MIN_PINECONE_SCORE=0.7
```

#### 4. Deploy Settings

Railway will auto-detect Node.js. If not, configure:

**Build Command**: (leave empty, Railway auto-detects)
**Start Command**: `npm start`
**Root Directory**: `/backend`

#### 5. Deploy!

```
Click "Deploy"
Wait 2-3 minutes
Railway will give you a URL like: https://your-app.railway.app
```

#### 6. Test Deployment

```bash
curl https://your-app.railway.app/health
```

**Cost**: $5-10/month (includes 512MB RAM, automatic scaling)

---

## 🚀 Option 2: Render

**Why Render?**
- ✅ Free tier available (with limitations)
- ✅ Easy setup
- ✅ Auto-scaling
- ✅ Good documentation

### Step-by-Step

#### 1. Sign Up
```
Go to: https://render.com
Sign up with GitHub
```

#### 2. Create New Web Service
```
Dashboard → New → Web Service
Connect your GitHub repository
Select "backend" folder
```

#### 3. Configure Service

```yaml
Name: gobahrain-api
Environment: Node
Region: Oregon (US West) or closest to your users
Branch: main
Root Directory: backend
Build Command: npm install
Start Command: npm start
```

#### 4. Add Environment Variables

Same as Railway (see above)

#### 5. Choose Plan

**Free Tier** (for testing):
- 512MB RAM
- Spins down after 15 min inactivity
- Slow cold starts

**Paid Tier** ($7/month):
- Always on
- 512MB RAM
- Better performance

#### 6. Deploy

```
Click "Create Web Service"
Wait for build to complete
URL will be: https://gobahrain-api.onrender.com
```

**Cost**: Free (limited) or $7/month

---

## 🚀 Option 3: Fly.io

**Why Fly.io?**
- ✅ Deploy close to users (edge computing)
- ✅ Good performance
- ✅ Flexible scaling

### Step-by-Step

#### 1. Install Fly CLI

```bash
# macOS
brew install flyctl

# Or using curl
curl -L https://fly.io/install.sh | sh
```

#### 2. Sign Up & Login

```bash
fly auth signup
# or
fly auth login
```

#### 3. Initialize Fly App

```bash
cd /Users/mac/19feb/GoBahrain/backend
fly launch
```

Answer the prompts:
- App name: `gobahrain-api`
- Region: Choose closest to your users
- Postgres database: No (using Supabase)
- Redis: No (using in-memory cache)

#### 4. Configure `fly.toml`

Fly creates this file. Update it:

```toml
app = "gobahrain-api"
primary_region = "lhr" # London or nearest

[build]
  [build.args]
    NODE_VERSION = "18"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

#### 5. Set Secrets

```bash
fly secrets set \
  OPENAI_API_KEY="sk-proj-..." \
  PINECONE_API_KEY="pcsk_..." \
  PINECONE_HOST="https://..." \
  SUPABASE_URL="https://..." \
  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
  CORS_ORIGINS="https://yourdomain.com" \
  ADMIN_API_KEY="your-key"
```

#### 6. Deploy

```bash
fly deploy
```

#### 7. Open Your App

```bash
fly open
# Or visit: https://gobahrain-api.fly.dev
```

**Cost**: ~$5/month (512MB RAM)

---

## 🚀 Option 4: DigitalOcean App Platform

**Why DigitalOcean?**
- ✅ Reliable infrastructure
- ✅ Simple pricing
- ✅ Good performance

### Step-by-Step

#### 1. Sign Up
```
Go to: https://cloud.digitalocean.com
Create account
```

#### 2. Create App

```
Apps → Create App
→ Connect GitHub
→ Select repository
→ Choose "backend" folder
```

#### 3. Configure

```
Type: Web Service
Build Command: npm install
Run Command: npm start
HTTP Port: 4000
Instance Size: Basic ($6/month)
```

#### 4. Environment Variables

Add all your env vars in the UI (same as Railway)

#### 5. Deploy

```
Click "Create Resources"
Wait for deployment
URL: https://your-app.ondigitalocean.app
```

**Cost**: $6/month (512MB RAM)

---

## 🚀 Option 5: VPS (DigitalOcean Droplet)

**Why VPS?**
- ✅ Full control
- ✅ Can run multiple apps
- ✅ Cheapest for multiple services

### Step-by-Step

#### 1. Create Droplet

```
DigitalOcean → Droplets → Create
Choose: Ubuntu 22.04 LTS
Plan: Basic $6/month (1GB RAM)
Region: Nearest to users
```

#### 2. SSH into Server

```bash
ssh root@your-droplet-ip
```

#### 3. Install Node.js

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Verify
node --version
npm --version
```

#### 4. Install PM2

```bash
npm install -g pm2
```

#### 5. Clone Your Repository

```bash
cd /var/www
git clone https://github.com/yourusername/GoBahrain.git
cd GoBahrain/backend
npm install --production
```

#### 6. Create Environment File

```bash
nano .env
```

Paste your environment variables, save and exit (Ctrl+X, Y, Enter)

#### 7. Start with PM2

```bash
pm2 start src/index.js --name gobahrain-api
pm2 save
pm2 startup
```

#### 8. Setup Nginx (Reverse Proxy)

```bash
# Install Nginx
apt install -y nginx

# Create config
nano /etc/nginx/sites-available/gobahrain
```

Paste this config:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable site:

```bash
ln -s /etc/nginx/sites-available/gobahrain /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

#### 9. Setup SSL (HTTPS)

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificate
certbot --nginx -d your-domain.com
```

#### 10. Setup Firewall

```bash
ufw allow 22  # SSH
ufw allow 80  # HTTP
ufw allow 443 # HTTPS
ufw enable
```

**Cost**: $6/month (but you can host multiple apps)

---

## 🎯 Which One Should You Choose?

### Choose **Railway** if:
- ✅ You want the fastest deployment
- ✅ You're new to deployment
- ✅ You want auto-deploys from GitHub

### Choose **Render** if:
- ✅ You want a free tier to test
- ✅ You prefer a simple UI
- ✅ Cost is important

### Choose **Fly.io** if:
- ✅ You want edge deployment
- ✅ You need low latency globally
- ✅ You're comfortable with CLI

### Choose **DigitalOcean VPS** if:
- ✅ You want full control
- ✅ You'll host multiple services
- ✅ You're comfortable with Linux

---

## 📋 Pre-Deployment Checklist

Before deploying to any platform:

- [ ] Run database migration (`009_community_optimizations.sql`)
- [ ] Set all environment variables
- [ ] Update `CORS_ORIGINS` with your domain
- [ ] Set `NODE_ENV=production`
- [ ] Test locally first
- [ ] Prepare your domain (if using custom domain)

---

## 🔒 Security Checklist

After deployment:

- [ ] HTTPS enabled (automatic on most platforms)
- [ ] Environment variables set (never in code)
- [ ] CORS restricted to your domains
- [ ] Rate limiting active
- [ ] Health endpoint responding
- [ ] Metrics endpoint accessible

---

## 📊 Post-Deployment Testing

After deploying, test your backend:

```bash
# Replace with your deployed URL
BACKEND_URL="https://your-app.railway.app"

# Test health
curl $BACKEND_URL/health

# Test metrics
curl $BACKEND_URL/metrics

# Test chat endpoint
curl -X POST $BACKEND_URL/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"test deployment"}'
```

---

## 🔄 Continuous Deployment

### Auto-deploy on git push (Railway/Render)

Already configured! Just push to GitHub:

```bash
git add .
git commit -m "Update backend"
git push origin main
```

Platform will auto-deploy in 2-3 minutes.

### Manual deploy (Fly.io)

```bash
cd backend
fly deploy
```

### Update VPS

```bash
ssh root@your-droplet-ip
cd /var/www/GoBahrain/backend
git pull
npm install
pm2 restart gobahrain-api
```

---

## 💰 Cost Comparison (Monthly)

| Platform | Free Tier | Paid Tier | Notes |
|----------|-----------|-----------|-------|
| **Railway** | $5 credit | $10/month | Best value |
| **Render** | Limited | $7/month | Good free tier |
| **Fly.io** | $5 credit | $5-10/month | Pay as you go |
| **DO App Platform** | No | $6/month | Simple |
| **DO Droplet** | No | $6/month | Multi-use |
| **AWS/GCP** | 1 year free | Variable | Complex pricing |

**Recommended for starters**: Railway ($10/month) or Render free tier

---

## 🆘 Troubleshooting

### Deployment fails

1. Check build logs in platform dashboard
2. Verify `package.json` has correct `start` script
3. Ensure `NODE_ENV=production` is set

### App crashes on startup

1. Check environment variables are set
2. View logs in platform dashboard
3. Test locally first

### Can't connect to backend

1. Check CORS settings
2. Verify URL is correct (https, not http)
3. Check platform firewall settings

---

## 📞 Need Help?

Each platform has excellent documentation:

- **Railway**: https://docs.railway.app
- **Render**: https://render.com/docs
- **Fly.io**: https://fly.io/docs
- **DigitalOcean**: https://docs.digitalocean.com

---

## ✅ Quick Start Recommendation

**For fastest deployment (< 5 minutes):**

1. Go to https://railway.app
2. Sign up with GitHub
3. Connect your repository
4. Add environment variables
5. Deploy!

**Your backend will be live and handling requests in minutes!** 🚀
