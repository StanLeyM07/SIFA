# Sifa API — one endpoint, no disk, no database.
#
# Render can run this with its native Node runtime (see render.yaml); this
# image exists so the same backend moves to Fly.io, Railway or a plain VPS
# without changes. Worth having, because Render's free tier sleeps after
# ~15 minutes idle and the cold start is slow enough to notice.

# ── deps: production modules only ────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── build: needs devDependencies for tsc ─────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── runner: compiled JS + production modules ─────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Unprivileged: the node image already ships a `node` user.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

# Hosts inject PORT; the app reads it and falls back to 3001.
ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
