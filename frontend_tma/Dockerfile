# --- build ---------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# I modelli MediaPipe sono serviti dalla stessa origine dell'app.
RUN npm run fetch:models && npm run build

# --- runtime -------------------------------------------------------------
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
