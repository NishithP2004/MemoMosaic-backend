FROM node:20

ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

WORKDIR /app/

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm i

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]