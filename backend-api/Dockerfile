FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npx prisma generate && npm run build

FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260226060000_multi_tenant_roles/migration.sql && (npx prisma migrate resolve --applied 20260226060000_multi_tenant_roles || true) && npx prisma migrate deploy && node dist/index.js"]
