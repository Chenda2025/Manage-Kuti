# Coolify / production: Vite build → dist, then API + static with tsx
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# tsx is a production dependency (see package.json)
RUN npm ci --omit=dev && npm cache clean --force \
  && mkdir -p uploads

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/public ./public

# Coolify sets PORT at runtime — do not hardcode
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Mount Coolify volume at /app/uploads to persist avatars/media
CMD ["npm", "start"]
