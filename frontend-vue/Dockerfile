FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-factor 2 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm ci --prefer-offline --no-audit --fund=false

COPY . .

ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
