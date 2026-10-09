# 024-deployment-pipeline. Next.js standalone output (next.config.ts `output: 'standalone'`).
#
# NEXT_PUBLIC_API_BASE_URL is a BUILD argument, not a runtime variable: the sign-in, enrollment,
# recovery and accept-invitation forms call the API from the browser, and Next inlines
# NEXT_PUBLIC_* into the client bundle at build time. One image per API origin.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
