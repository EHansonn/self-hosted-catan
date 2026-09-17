FROM node:24.21.0-alpine3.24@sha256:be80f76cf40ec8e42b9bec49f60a55e0660f30af58d3e5a25530785b30ea67e2 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24.21.0-alpine3.24@sha256:be80f76cf40ec8e42b9bec49f60a55e0660f30af58d3e5a25530785b30ea67e2 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/app/data STATIC_DIR=/app/dist/client APP_NAME=Crossroads
WORKDIR /app
RUN rm -rf /opt/yarn-v1.22.22 /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && mkdir -p /app/data \
    && chown node:node /app/data
COPY --from=build --chown=node:node /app/dist/client ./dist/client
COPY --from=build --chown=node:node /app/dist/node/server.cjs ./dist/node/server.cjs
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--max-old-space-size=160", "dist/node/server.cjs"]
