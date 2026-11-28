# asset-serve viewer as a container. The CLI (`asset-serve add`) stays on the
# host and writes ~/.asset-serve/registry.json; this image only serves it.
# Run with compose.yaml, which sets up the mounts and the local-only port.

FROM node:24-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.6.5 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-slim
# git reads the roadmap repos' HEAD for action tokens. The repos are host-owned
# read-only mounts, so trust them or git refuses with "dubious ownership".
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/* \
    && git config --system --add safe.directory '*'
WORKDIR /app
ENV NODE_ENV=production \
    ASSET_SERVE_HOME=/data \
    ASSET_SERVE_HOST=0.0.0.0 \
    ASSET_SERVE_PORT=7777
COPY --from=build /app /app
EXPOSE 7777
CMD ["node", "node_modules/vite/bin/vite.js", "preview", "--port", "7777", "--strictPort"]
