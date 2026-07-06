# Backend NestJS. Контекст сборки — корень монорепо.
# Сборка и зависимости — bun (по bun.lock), рантайм — Node 20 (пин из .nvmrc).

FROM oven/bun:1.3.14-alpine AS deps
WORKDIR /app
COPY apps/backend/package.json apps/backend/bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/backend/ ./
RUN bun run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY apps/backend/package.json ./
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
