# 🚀 Quick Start: Docker, CI/CD & Railway Deployment

## ✅ What's Been Set Up

Your repository now has:
- ✅ **Dockerfile** - Production-ready container image
- ✅ **docker-compose.yml** - Local dev environment with MySQL
- ✅ **GitHub Actions Workflows** - CI/CD pipeline
- ✅ **Railway Configuration** - Ready for deployment
- ✅ **Database Init Script** - Auto-creates tables

---

## 🐳 Quick Test: Run Locally with Docker

### 1. Build and Start Local Environment

```bash
# Navigate to your project
cd StoryNode

# Copy environment variables
cp .env.example .env

# Build and start with Docker Compose
docker-compose up --build
```

### 2. Access Your App
- **App URL:** http://localhost:3000
- **Database:** localhost:3306
- **Credentials in .env**

### 3. Stop Services
```bash
docker-compose down
```

---

## 🔐 GitHub Actions Setup (IMPORTANT!)

You have 3 CI/CD workflows ready. Add these secrets to enable them:

### Step 1: Generate Railway Token
1. Go to [railway.app](https://railway.app) → Settings → Tokens
2. Create a new token and copy it

### Step 2: Add GitHub Secrets
1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Click **"New repository secret"** and add:

| Secret Name | Value | Where to Get |
|------------|-------|-------------|
| `RAILWAY_TOKEN` | Your Railway token | Railway dashboard → Settings |
| `RAILWAY_SERVICE` | Your service name | (Optional - set in Railway) |

### Step 3: Verify Workflows
1. Go to your repo → Actions tab
2. You should see 3 workflows:
   - **Build and Push Docker Image** - Builds on every push
   - **Node.js CI** - Tests code
   - **Deploy to Railway** - Auto-deploys to Railway

---

## 🚂 Railway Deployment (Free Tier)

### Option A: GitHub Integration (Recommended)

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Click "Login with GitHub"
   - Authorize the app

2. **Create New Project**
   - Click "New Project"
   - Choose "Deploy from GitHub repo"
   - Select `KAUSHIKRM-36/StoryNode`

3. **Add MySQL Database**
   - In your Railway project, click "Add"
   - Select "MySQL"
   - Use default credentials or configure your own
   - Note the connection URL

4. **Configure Environment Variables in Railway**
   - Click your web service
   - Go to "Variables" tab
   - Add these variables:
     ```
     PORT=3000
     NODE_ENV=production
     MYSQL_HOST=<mysql-service-hostname>
     MYSQL_USER=root
     MYSQL_PASSWORD=<your-password>
     MYSQL_DATABASE=blogging_platform
     SESSION_SECRET=<generate-a-strong-random-string>
     ```

5. **Deploy**
   - Railway auto-deploys when you push to `main` branch
   - Check deployment status in Railway dashboard

### Option B: Using Railway CLI

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Link your project (if not linked)
railway init

# 4. Deploy
railway up

# 5. View logs
railway logs
```

### Option C: Manual Docker Deployment (if not using GitHub)

```bash
# 1. Build image
docker build -t bloggweb:latest .

# 2. Push to registry (optional, for Railway)
# Then deploy to Railway using the image

# 3. Or run locally in production mode:
docker run -e NODE_ENV=production \
  -e MYSQL_HOST=<db-host> \
  -e MYSQL_USER=<user> \
  -e MYSQL_PASSWORD=<pass> \
  -e MYSQL_DATABASE=blogging_platform \
  -p 3000:3000 bloggweb:latest
```

---

## 📊 CI/CD Pipeline Workflows Explained

### 1. **node-ci.yml** - Runs on every push/PR
- Tests against Node 18.x and 20.x
- Installs dependencies
- Runs linter (if configured)
- Runs tests (if configured)

### 2. **docker-build.yml** - Builds Docker image
- Builds on every push to `main`
- Pushes to GitHub Container Registry
- Auto-tags with:
  - Branch name
  - Commit SHA
  - `latest` tag

### 3. **deploy-railway.yml** - Deploys to Railway
- Triggers on push to `main` after Docker build
- Uses `RAILWAY_TOKEN` secret
- Auto-deploys your app to production

---

## 🔍 Troubleshooting

### Docker Issues
```bash
# Check logs
docker-compose logs -f app

# Rebuild everything
docker-compose down && docker-compose up --build

# Clean up everything
docker-compose down -v
```

### Railway Deployment Issues
- Check Railway dashboard → Logs tab
- Verify all environment variables are set
- Ensure MySQL service is running
- Check if port 3000 is correctly exposed

### GitHub Actions Not Running
- Check Actions tab → Workflows
- Verify branch is `main`
- Check if RAILWAY_TOKEN secret is set correctly
- Look at the workflow logs for error details

### Database Connection Issues
```bash
# Verify MySQL is accessible
docker-compose exec db mysql -u root -p blogging_platform

# Check app logs for database errors
docker-compose logs app
```

---

## 📦 File Structure After Setup

```
StoryNode/
├── Dockerfile                 # Container image definition
├── docker-compose.yml         # Local dev environment
├── Procfile                   # Railway process definition
├── railway.json              # Railway config
├── start.sh                  # App startup script
├── init.sql                  # Database initialization
├── .env.example              # Environment template
├── .dockerignore             # Docker build exclusions
├── .github/workflows/
│   ├── docker-build.yml      # Docker build workflow
│   ├── node-ci.yml           # Node.js CI workflow
│   └── deploy-railway.yml    # Railway deploy workflow
├── DOCKER_DEPLOYMENT.md      # Detailed deployment guide
└── [existing files]
```

---

## 🎯 Next Steps

1. ✅ **Add GitHub Secrets** (RAILWAY_TOKEN required for deployment)
2. ✅ **Connect Railway to GitHub** (for auto-deployment)
3. ✅ **Test Locally** - Run `docker-compose up --build`
4. ✅ **Monitor Workflows** - Check Actions tab on GitHub
5. ✅ **Deploy** - Push to main branch (auto-triggers CI/CD → Railway)

---

## 📚 Useful Links

- 🚂 [Railway Documentation](https://docs.railway.app)
- 🐳 [Docker Guide](https://docs.docker.com)
- ⚙️ [GitHub Actions](https://docs.github.com/en/actions)
- 🐘 [MySQL Documentation](https://dev.mysql.com/doc)
- 🚀 [Node.js Best Practices](https://nodejs.org/en/docs/guides)

---

## 💡 Pro Tips

**Local Development:**
```bash
# Watch for changes
docker-compose up

# Reset database
docker-compose down -v && docker-compose up
```

**Production Environment:**
- Use strong `SESSION_SECRET` (min 32 characters)
- Set `NODE_ENV=production`
- Enable HTTPS in production (Railway does this automatically)

**Monitoring:**
- Railway provides real-time logs
- GitHub Actions shows build status
- Check Database health in Railway dashboard

---

**You're all set! 🎉 Your app is containerized and ready to deploy!**
