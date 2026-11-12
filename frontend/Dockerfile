# Production image of the web app: the React app is built once, then nginx serves the files and forwards
# /api and /uploads to the API container. Built by docker-compose.prod.yml with the repository root as context.
# Development uses frontend/Dockerfile.dev instead (Vite dev server).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --include-workspace-root=false --ignore-scripts --no-audit --no-fund
COPY frontend/index.html frontend/vite.config.js frontend/
COPY frontend/public frontend/public
COPY frontend/src frontend/src

# Fixed for production: the real API on the same address, never mock data or the fake-location switch.
ENV VITE_API_URL= \
  VITE_USE_MOCKS=false \
  VITE_DEV_FAKE_LOCATION=false
# Optional map settings from .env.production (empty = the app's built-in default).
ARG VITE_MAP_TILE_URL=
ARG VITE_MAP_ATTRIBUTION=
ARG VITE_MAP_DARKEN=
ARG VITE_MAP_BASE=
ARG VITE_MAP_VIEW=
ARG VITE_ROUTING_URL=
WORKDIR /app/frontend
RUN npx vite build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
# Writes /etc/nginx/trusted-proxies.conf from TRUSTED_PROXIES before nginx starts.
COPY --chmod=755 frontend/docker-trusted-proxies.sh /docker-entrypoint.d/40-trusted-proxies.sh
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
