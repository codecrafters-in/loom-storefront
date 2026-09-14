# The storefront as a Node server (server/node.mjs). See docs/DEPLOY.md.
#
#   docker build -t loom-storefront --build-arg VITE_API_BASE_URL=https://odoo.example.com/loom/api/v1/shop .
#   docker run -p 3000:3000 -e SITE_URL=https://shop.example.com loom-storefront

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_DATA_SOURCE=api
ARG VITE_API_BASE_URL
ENV VITE_DATA_SOURCE=$VITE_DATA_SOURCE VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-build ./server-build
COPY server ./server
COPY scripts/lib/csp.mjs ./scripts/lib/csp.mjs
USER node
EXPOSE 3000
CMD ["node", "server/node.mjs"]
