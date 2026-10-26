# 024-deployment-pipeline. One image, two commands:
#   node dist/src/main.js          — the API (default)
#   node dist/drizzle/migrate.js   — the one-shot migration job, run before the API starts
# Only the migration job is given DATABASE_URL_MIGRATION; the running API never holds the
# owner connection (.env.example, research.md D4).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY drizzle ./drizzle
COPY scripts ./scripts
RUN npm run build

FROM node:22-bookworm-slim AS runtime
# The commit this image was built from; GET /health reports it so deploy.yml can wait for this
# release rather than for any healthy container (024 D9).
ARG BUILD_SHA=unknown
ENV NODE_ENV=production \
    BUILD_SHA=${BUILD_SHA}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
# migrate.js reads the .sql files from its own directory; tsc does not copy them.
COPY drizzle/*.sql ./dist/drizzle/
USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
