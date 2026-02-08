# ── Build stage: compile the React client ──────────────────────────────────
FROM node:20-alpine AS client-build

WORKDIR /build/client
COPY client/package.json client/package-lock.json* ./
RUN npm ci --ignore-scripts

COPY client/ ./
RUN npm run build

# ── Production stage ───────────────────────────────────────────────────────
FROM node:20-alpine

LABEL maintainer="JVSAutomate"
LABEL description="JVSHomeControl — local-first smart home dashboard"

# ffmpeg is needed for RTSP → HLS camera streaming
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install server dependencies
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev --ignore-scripts

# Copy server source
COPY server/ ./server/

# Copy built client into the location the server expects (server/../client/dist)
COPY --from=client-build /build/client/dist ./client/dist/

# Default data directory — mount a volume here to persist config, backgrounds, certs
RUN mkdir -p /app/server/data

EXPOSE 3000

ENV NODE_ENV=production

# Health check so orchestrators (Docker Compose, Portainer, K8s) can monitor
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/status || exit 1

# The server looks for data in server/data/ by default.
# Hubitat configuration is passed via environment variables:
#   HUBITAT_HOST, HUBITAT_APP_ID, HUBITAT_ACCESS_TOKEN
# See docs/03-Installation.md for the full list.

WORKDIR /app/server
CMD ["node", "server.js"]
