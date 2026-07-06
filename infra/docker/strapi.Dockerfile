# Strapi 5 (админ-панель контента). Контекст сборки — корень монорепо.
# Ставится npm-ом (package-lock.json из генератора Strapi).

FROM node:20-alpine AS build
WORKDIR /app
COPY apps/strapi/package.json apps/strapi/package-lock.json ./
RUN npm ci
COPY apps/strapi/ ./
# Секреты для build не нужны: собирается только админ-бандл
RUN NODE_ENV=production npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/config ./config
COPY --from=build /app/database ./database
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/favicon.png* ./
EXPOSE 1337
CMD ["npm", "run", "start"]
