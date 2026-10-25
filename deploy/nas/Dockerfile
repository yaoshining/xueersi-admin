FROM node:24.22.0-bookworm-slim AS dependencies
WORKDIR /runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24.22.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies --chown=1000:1000 /runtime/node_modules ./node_modules
COPY --chown=1000:1000 package.json ./package.json
COPY --chown=1000:1000 app ./
COPY --chown=1000:1000 healthcheck.mjs ./healthcheck.mjs
USER 1000:1000
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
