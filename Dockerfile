FROM node:22.23.5-bookworm-slim

# Prismaがデータベースとの接続に使うライブラリ。
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit && ./node_modules/.bin/prisma generate

COPY index.js run.sh ./
COPY lib ./lib
COPY public ./public
COPY views ./views
COPY scripts ./scripts
COPY test ./test

USER node
EXPOSE 8000
CMD ["sh", "run.sh"]
