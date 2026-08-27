# OpenCouncil — production container
#
# Node 22.5+ is required: persistence uses the built-in `node:sqlite` module,
# which is why there is no native addon to compile here.
FROM node:22-alpine AS base
WORKDIR /app

# --- dependencies ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The root build is the single source of truth: shared → server → web, then the
# static export is copied beside the server bundle for the CLI to serve.
RUN npm run build && npm prune --omit=dev

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
# Containers must bind all interfaces or the published port is unreachable.
ENV HOST=0.0.0.0
ENV PORT=4311
ENV DATABASE_PATH=/app/data/opencouncil.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/bin ./bin
EXPOSE 4311
VOLUME ["/app/data"]
# Set OPEN_COUNCIL_SECRET_KEY or provider API keys will not survive a restart.
CMD ["node", "bin/opencouncil.js"]
