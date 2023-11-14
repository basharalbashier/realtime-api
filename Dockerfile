FROM node:18

RUN npm install -g  pnpm

WORKDIR /usr/src/app

COPY   package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 8080
CMD [ "pnpm","start" ]