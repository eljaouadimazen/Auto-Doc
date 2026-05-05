# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm ci --only=production --legacy-peer-deps

# Production stage
FROM node:22-alpine

# Install SQLite runtime library
RUN apk add --no-cache sqlite-libs

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy built dependencies and source
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/

# Create data directory for SQLite
RUN mkdir -p data && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["npm", "start"]
