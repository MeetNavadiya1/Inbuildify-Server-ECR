# Base — runtime image shared by every stage
FROM node:22.14.0-bookworm-slim AS base

# Puppeteer launches Chromium with --no-sandbox in pdf.service.js, so we run the
# system Chromium and skip Puppeteer's ~300MB bundled download.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=development \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Chromium + the fonts a headless render needs for correct PDFs, plus tini as a
# PID 1 that reaps the zombie processes Chromium leaves behind.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
      fonts-noto-cjk \
      ca-certificates \
      tini \
      wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Deps — install ALL dependencies (native modules get compiled here)
FROM base AS deps

# Toolchain for any dependency without a prebuilt binary (bcrypt, sharp, pg-native…).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy only manifests first so this layer is cached until deps actually change.
COPY package.json package-lock.json ./
RUN npm ci

# Development — nodemon hot reload (source is bind-mounted by compose)
FROM base AS development

# node_modules comes from the image; compose keeps it in a named volume so the
# Windows host bind-mount can't shadow the Linux-built native modules.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 5000
ENTRYPOINT ["tini", "--"]
CMD ["npm", "start"]