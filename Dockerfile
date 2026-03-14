# Use official Node.js runtime as base image
FROM node:18-alpine

# Install bash and other utilities (for better compatibility)
RUN apk add --no-cache bash curl

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (including devDependencies for wait-on)
RUN npm ci

# Copy application code
COPY . .

# Copy and make start script executable
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Expose port 3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Start the application
CMD ["/app/start.sh"]
