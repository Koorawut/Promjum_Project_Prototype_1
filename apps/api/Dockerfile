FROM node:22-slim AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api ./apps/api
COPY apps/web/package.json ./apps/web/package.json

RUN npm install

WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
