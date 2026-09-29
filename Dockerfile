# Build frontend (Vite → ./dist), then run API + static files with tsx.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# Coolify sets PORT; fall back matches local API default
ENV PORT=8787

COPY package.json package-lock.json ./
# Runtime needs tsx (devDependency) to run TypeScript server
RUN npm ci --omit=dev && npm install tsx@4.20.5 --no-save \
  && mkdir -p uploads

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

EXPOSE 8787

# Mount a Coolify volume at /app/uploads to persist avatars/media
CMD ["npx", "tsx", "server/index.ts"]
