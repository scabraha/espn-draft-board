FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY package.json ./
COPY src ./src
COPY public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "src/server.js"]
