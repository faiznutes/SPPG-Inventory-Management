FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-factor 2 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm ci --include=dev --prefer-offline --no-audit --fund=false

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

CMD ["sh", "-c", "attempt=1; until [ $attempt -gt 5 ]; do npx prisma migrate deploy && break; echo \"Prisma migrate attempt $attempt failed, retrying...\"; attempt=$((attempt+1)); sleep 5; done; if [ $attempt -gt 5 ]; then echo 'Prisma migrate still failing after retries, continuing startup'; fi; node dist/index.js"]
