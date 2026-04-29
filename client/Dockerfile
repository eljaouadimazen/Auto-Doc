FROM node:22-alpine AS builder

WORKDIR /app/client

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM nginx:alpine

COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

RUN apk add --no-cache envsubst

COPY --from=builder /app/public /usr/share/nginx/html

COPY entrypoint.sh /docker-entrypoint.d/99-envsubst.sh
RUN chmod +x /docker-entrypoint.d/99-envsubst.sh

ENV BACKEND_HOST=localhost
ENV BACKEND_PORT=3000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
