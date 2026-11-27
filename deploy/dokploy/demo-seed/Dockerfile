# PROTOTYPE ONLY — the demo seed as a one-shot job on the Dokploy host. See docker-compose.yml here.
#
# Built from backend/ source (the production image excludes drizzle/demo by design, and must keep
# doing so). Never referenced by deploy.yml or by deploy/dokploy/docker-compose.yml.
FROM node:22-bookworm-slim
WORKDIR /app
# backend/.dockerignore leaves the lockfile out of the context, hence install rather than ci.
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
