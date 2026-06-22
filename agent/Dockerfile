# =============================================================
# RustPanel Agent - Dockerfile
# Lightweight Node.js container with Docker socket access
# =============================================================

FROM node:20-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit

COPY . .
RUN npm run build

# Prune devDependencies to keep the image lightweight
RUN npm prune --omit=dev && npm cache clean --force

# Remove source and dev files
RUN rm -rf src tsconfig.json

# Non-root user (but needs docker socket access)
# Note: In Docker Swarm, the socket is mounted with proper permissions

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
