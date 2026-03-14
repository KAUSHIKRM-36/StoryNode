# Docker Setup and Deployment Guide

## Local Development with Docker

### Prerequisites
- Docker Desktop installed and running
- Docker Compose installed (comes with Docker Desktop)

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/KAUSHIKRM-36/StoryNode.git
   cd StoryNode
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Build and run with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

4. **Access the application:**
   - Open browser and go to `http://localhost:3000`
   - MySQL runs on `localhost:3306`

### Docker Compose Commands

- **Start services:** `docker-compose up`
- **Start in background:** `docker-compose up -d`
- **Stop services:** `docker-compose down`
- **View logs:** `docker-compose logs -f app`
- **Rebuild image:** `docker-compose up --build`

---

## GitHub Actions CI/CD Pipeline

The repository includes three GitHub Actions workflows:

### 1. **Docker Build Pipeline** (`docker-build.yml`)
- Builds Docker image on every push to main
- Pushes to GitHub Container Registry (ghcr.io)
- Tags with branch name, commit SHA, and latest

### 2. **Node.js CI** (`node-ci.yml`)
- Runs on all pushes and pull requests
- Tests against Node.js 18.x and 20.x
- Runs linter and tests (if configured)

### 3. **Deploy to Railway** (`deploy-railway.yml`)
- Automatically deploys to Railway on main branch push
- Requires Railway token configured as secret

---

## Railway Deployment

### Option 1: Connect GitHub Repo (Recommended)

1. **Create Railway Account:**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Authorize and select this repository

3. **Configure Variables in Railway Dashboard:**
   ```
   MYSQL_HOST=<railway-mysql-url>
   MYSQL_USER=<your-username>
   MYSQL_PASSWORD=<your-password>
   MYSQL_DATABASE=blogging_platform
   SESSION_SECRET=<strong-secret-key>
   PORT=3000
   NODE_ENV=production
   ```

4. **Add MySQL Service:**
   - In Railway project, click "Add"
   - Select "MySQL"
   - Configure with same credentials as above

5. **Deploy:**
   - Railway auto-deploys when you push to main
   - View logs in Railway dashboard

### Option 2: CLI Deployment

1. **Install Railway CLI:**
   ```bash
   npm i -g @railway/cli
   ```

2. **Login:**
   ```bash
   railway login
   ```

3. **Initialize project:**
   ```bash
   railway init
   ```

4. **Link to existing project:**
   ```bash
   railway link [project-id]
   ```

5. **Deploy:**
   ```bash
   railway up
   ```

---

## GitHub Secrets for CI/CD

Add these secrets to your GitHub repository settings:

### For Docker Build:
- `GITHUB_TOKEN` - Automatically available

### For Railway Deployment:
- `RAILWAY_TOKEN` - Get from Railway dashboard (Settings → Tokens)
- `RAILWAY_SERVICE` - Your Railway service name (optional, can be set in workflow)

### Steps to Add Secrets:
1. Go to GitHub repo → Settings
2. Click "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Add each secret with its value

---

## Environment Variables Reference

```env
# Database
MYSQL_HOST=db              # Use 'db' for Docker, Railway MySQL URL for production
MYSQL_USER=root
MYSQL_PASSWORD=yourpassword
MYSQL_DATABASE=blogging_platform

# Server
PORT=3000
NODE_ENV=production

# Session
SESSION_SECRET=your-secret-key-here
```

---

## Useful Links

- [Railway Documentation](https://docs.railway.app)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Documentation](https://docs.docker.com)
- [Docker Compose Documentation](https://docs.docker.com/compose)

---

## Troubleshooting

### Docker issues:
- Ensure Docker daemon is running
- Check port 3000 and 3306 are not in use
- Run `docker-compose logs -f` to view detailed logs

### Railway deployment issues:
- Check Railway logs in dashboard
- Verify all environment variables are set
- Ensure MySQL service is running and accessible

### GitHub Actions issues:
- Check Actions tab in GitHub repo for workflow runs
- View detailed logs for each step
- Ensure secrets are correctly configured
