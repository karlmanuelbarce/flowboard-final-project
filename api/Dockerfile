FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache tini

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "dev"]
