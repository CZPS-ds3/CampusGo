# Production image of the API (Express). Built by docker-compose.prod.yml with the repository root as context.
# Development uses backend/Dockerfile.dev instead (watch mode, demo players, code preview on).
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

# Runtime dependencies only. Installed inside Linux, so sharp gets its Linux build.
# --ignore-scripts skips the root postinstall (it writes .env files; settings come from .env.production).
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --include-workspace-root=false --omit=dev --ignore-scripts --no-audit --no-fund \
  && npm cache clean --force

COPY backend/index.js backend/
COPY backend/src backend/src
# The seed reads the photo list of the 8 pilot checkpoints from the frontend.
COPY frontend/src/api/places.json frontend/src/api/places.json

WORKDIR /app/backend
RUN mkdir -p uploads && chown -R node:node /app/backend/uploads
USER node
EXPOSE 3000

# Migrate and seed (both safe to repeat; the seed never overwrites quests admins changed, BR55), then start.
# No demo players and no watch mode. index.js refuses to start with development secrets or without SMTP.
CMD ["sh", "-c", "node src/db/migrate.js && node src/db/seed.js && exec node index.js"]
