# ─── Сборка фронтенда ─────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html vite.config.ts ./
COPY src ./src

RUN pnpm build

# ─── Production-образ ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache tini wget

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY server ./server
COPY --from=frontend /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV STATIC_DIR=/app/dist
ENV DATA_DIR=/app/data
ENV SERVE_STATIC=true

EXPOSE 8787
VOLUME ["/app/data"]

WORKDIR /app/server
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
