FROM docker.1ms.run/library/node:20-bookworm-slim

WORKDIR /app

RUN sed -i 's#http://deb.debian.org/debian#http://mirrors.aliyun.com/debian#g' /etc/apt/sources.list.d/debian.sources \
  && sed -i 's#http://deb.debian.org/debian-security#http://mirrors.aliyun.com/debian-security#g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com && npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8787
ENV DATABASE_URL=file:./data/app.sqlite

EXPOSE 8787

CMD ["npm", "run", "start"]
