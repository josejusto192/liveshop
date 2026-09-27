# Imagem do app para o Coolify. Aplica as migrações ao subir.
FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
