# =============================================================
# RustPanel Agent - Dockerfile (Multi-stage, optimized)
# =============================================================

# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit

COPY . .
RUN npm run build

# Prune devDependencies
RUN npm prune --omit=dev && npm cache clean --force

# ---- Stage 2: Runtime ----
FROM node:20-alpine

# Runtime deps for better-sqlite3 (only sqlite-libs, not build tools)
RUN apk add --no-cache sqlite-libs

WORKDIR /app

# Copy only production artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production

# Run as root for Docker socket access (/var/run/docker.sock).
# The socket is mounted read-only (:ro) and the container has no
# network exposure, so running as root is acceptable here.
# To run as non-root, rebuild with --build-arg RUN_AS=node and
# ensure the docker GID matches (getent group docker | cut -d: -f3).
ARG RUN_AS=root
USER ${RUN_AS}

CMD ["node", "dist/index.js"]