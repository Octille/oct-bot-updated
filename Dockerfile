# OctBot 3.0. Lavalink runs in its own container (see docker-compose.yml).
#   docker compose up -d --build

# ── Build: compile TypeScript ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app
# mongodb-memory-server (tests only) would otherwise download a MongoDB binary here
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ── Run: production dependencies, compiled code and assets only ────────────────────────
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY assets ./assets
USER node
CMD ["node", "dist/index.js"]
