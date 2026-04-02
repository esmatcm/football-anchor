FROM node:20-bullseye AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev --no-audit --no-fund

COPY . .
RUN npm run build && npx tsc -p tsconfig.server.json

FROM node:20-bullseye-slim AS runtime
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/build ./build
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3100
ENV DB_PATH=/app/data/data.db
EXPOSE 3100

CMD ["node", "build/server.js"]
