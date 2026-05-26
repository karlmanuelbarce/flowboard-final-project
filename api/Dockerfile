FROM node:22-alpine

WORKDIR /app

# tini: signal handling. openssl/libc6-compat: Prisma engine. python3/make/g++: bcrypt build.
RUN apk add --no-cache tini openssl libc6-compat python3 make g++

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy schema before generating so the client is built during image build.
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "dev"]
