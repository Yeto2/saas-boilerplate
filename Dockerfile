# --- build stage ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --include=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage ---
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# node:sqlite is built in; ensure the data dir exists and is writable.
RUN mkdir -p /app/data && addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app/data
USER app
EXPOSE 4020
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:4020/health/live || exit 1
CMD ["node", "dist/server.js"]
