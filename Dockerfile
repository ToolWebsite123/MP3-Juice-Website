# ═══════════════════════════════════════════════════════════════════════
# 🐳 MP3JUICE PRODUCTION DOCKERFILE
# ═══════════════════════════════════════════════════════════════════════

FROM node:20-bookworm-slim AS base

# Install system dependencies (FFmpeg, Python 3, Curl, ca-certificates for yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Build Frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# 2. Setup Backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend/ ./backend/

# Set Environment Variables
ENV NODE_ENV=production
ENV PORT=5000
ENV SERVE_FRONTEND=true

EXPOSE 5000

# Start Application
CMD ["node", "backend/src/server.js"]
