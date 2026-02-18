FROM node:20-alpine

ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

WORKDIR /app/

RUN apk update && apk add --no-cache chromium

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]