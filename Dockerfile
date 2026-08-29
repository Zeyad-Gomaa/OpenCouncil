# OpenCouncil — production container
#
# Node 22.5+ is required: persistence uses the built-in `node:sqlite` module,
# which is why there is no native addon to compile here.
FROM node:22-alpine AS base
WORKDIR /app

# --- dependencies ---
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts --no-audit

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The root build is the single source of truth: shared → server → web, then the
# static export is copied beside the server bundle for the CLI to serve.
RUN npm run build && npm prune --omit=dev --no-audit

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
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 4311
VOLUME ["/app/data"]
# Back up OPEN_COUNCIL_SECRET_KEY or the persisted /app/data/.secret_key with the database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://localhost:4311/api/v1/health').then(r=>{if(!r.ok)process.exit(1)})"
CMD ["node", "bin/opencouncil.js"]
