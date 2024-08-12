FROM node:20

# Install necessary libraries for Puppeteer
RUN apt-get update && apt-get install -y \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon-x11-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxshmfence1 \
    libxss1 \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y \
    chromium \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

WORKDIR /app/
COPY package*.json /app/
RUN npm i
COPY . /app/

EXPOSE 3000
CMD ["node", "index.js"]