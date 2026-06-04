# --- build stage ---
FROM node:24-alpine AS build
WORKDIR /app
# NEXT_PUBLIC_* is inlined at build time, so the browser API URL is a build arg.
ARG NEXT_PUBLIC_API_URL=http://localhost:4020
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package.json package-lock.json* ./
RUN npm install --include=dev
COPY . .
RUN npm run build

# --- runtime stage (Next.js standalone) ---
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3020
CMD ["node", "server.js"]
