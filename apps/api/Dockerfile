FROM node:22-slim AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api ./apps/api
COPY apps/web/package.json ./apps/web/package.json

ENV NODE_ENV=development
RUN npm install --include=dev

WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build
RUN test -f dist/main.js || (echo "BUILD FAILED: dist/main.js missing" && exit 1)

ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
