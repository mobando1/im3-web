# IM3 Systems — production image
# Base: Node 22 + Debian Bookworm (12). Bookworm tiene los nombres estándar
# de paquetes (libasound2, no libasound2t64), evitando los líos de Ubuntu Noble.
FROM node:22-bookworm-slim

# Chromium + librerías que necesita para correr headless en Linux.
# Esto es lo que rompía con nixpacks — Bookworm las provee tal cual.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
      libnss3 \
      libxss1 \
      libasound2 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libxkbcommon0 \
      libxshmfence1 \
      ca-certificates \
      wget \
 && rm -rf /var/lib/apt/lists/*

# Le decimos a puppeteer que use el chromium del sistema. Sin esto, npm ci
# intentaría descargar 170MB extra durante el build.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

# Capa de deps separada para que cambios en el código no invaliden node_modules cache
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Código + build (vite client + esbuild server → dist/)
COPY . .
RUN npm run build

# Railway inyecta PORT al runtime
EXPOSE 3000
CMD ["npm", "run", "start"]
