FROM node:18-slim

# 한글 폰트 및 크롬 구동 필수 패키지 설치
RUN apt-get update \
    && apt-get install -y wget gnupg curl \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | \
    gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
       fonts-nanum \
       --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/

COPY package*.json ./
RUN npm install

COPY . .



# RUN mkdir -p public/downloads && chmod -R 777 public/downloads

EXPOSE 3000
CMD ["node", "src/app.js"]