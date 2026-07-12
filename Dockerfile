FROM node:24-slim

WORKDIR /app

RUN corepack enable
ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @typesensekit/mcp build

ENV TYPESENSEKIT_MCP_PORT=3000
ENV TYPESENSEKIT_MCP_HOST=0.0.0.0
ENV TYPESENSEKIT_READ_ONLY=true
EXPOSE 3000

USER node

CMD ["node", "packages/mcp/dist/http.js"]
