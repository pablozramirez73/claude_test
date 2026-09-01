# MISURA — container image
#
# Everything that touches the camera, motion sensors, and MediaPipe/WASM runs
# in the VIEWER'S BROWSER on the host machine, not inside the container — a
# Telegram Mini App is just a web page. Docker here only needs to serve that
# page; no camera/device passthrough into the container is required. Because
# the browser treats `http://localhost:<port>` as a secure context, camera
# access works over plain HTTP as long as you open it via localhost.
#
# Two targets:
#   dev        - `npm run dev` with hot reload, for local development.
#   production - static build served by nginx (default target), for
#                "just run the app" / closer to a real deployment.
#
# Usage (see docker-compose.yml for the easiest path):
#   docker build --target dev -t misura:dev .
#   docker build --target production -t misura:prod .   # or: docker build -t misura:prod .

FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

# ---- dev: hot-reloading Vite dev server -------------------------------
FROM base AS dev
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- build: compile the static production bundle -----------------------
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

# ---- production: nginx serving the static bundle ------------------------
FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
