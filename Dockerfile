FROM node:20
WORKDIR /app
COPY package*.json .
RUN npm i
COPY . .
RUN apt-get update && apt-get install -y \
    chromium \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"
EXPOSE 3000
CMD ["node", "index.js"]