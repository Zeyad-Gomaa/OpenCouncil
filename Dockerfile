# OpenCouncil — production container
FROM node:20-alpine AS base
WORKDIR /app

# --- dependencies ---
FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w packages/shared \
 && npm run build -w apps/server \
 && npm run build -w apps/web \
 && npm prune --omit=dev

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps
COPY --from=build /app/bin ./bin
EXPOSE 4311
VOLUME ["/app/data"]
CMD ["node", "bin/opencouncil.js"]
