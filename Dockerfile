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

# Keep pristine copies of bundled defaults so the entrypoint can seed them
# into a fresh volume (the volume mount hides /app/server/data/).
RUN mkdir -p /app/server/data-defaults && \
    cp -r /app/server/data/control-icons /app/server/data-defaults/control-icons 2>/dev/null || true && \
    cp /app/server/data/config.example.json /app/server/data-defaults/config.example.json 2>/dev/null || true

# Copy and prepare the entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 80 443

ENV NODE_ENV=production

# Health check — tries HTTP first, falls back to HTTPS (self-signed OK via --no-check-certificate).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:80/api/status 2>/dev/null || wget -qO- --no-check-certificate https://localhost:443/api/status 2>/dev/null || exit 1

# The server looks for data in server/data/ by default.
# All configuration is managed through config.json (editable via the browser UI).
# See docs/03-Installation.md for details.

WORKDIR /app/server
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
