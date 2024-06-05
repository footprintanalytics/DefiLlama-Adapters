FROM node:16-alpine as base

WORKDIR /app
COPY package.json .
COPY package-lock.json .
RUN apk add --no-cache python3 build-base
RUN npm install --production --build-from-source && mv node_modules prod_node_modules
RUN npm install --build-from-source

FROM node:16-alpine as build
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY src ./src
COPY projects ./projects
COPY typings ./typings
COPY liquidations ./liquidations
COPY utils ./utils

COPY package.json ./

FROM node:16-alpine as prod
RUN npm install pm2 -g
RUN echo http://mirrors.aliyun.com/alpine/v3.6/main/ > /etc/apk/repositories && \
	echo http://mirrors.aliyun.com/alpine/v3.6/community/ >> /etc/apk/repositories && \
	apk update && apk add ca-certificates && \
	apk add -U tzdata && apk add curl

WORKDIR /app
RUN mkdir logs
RUN mkdir downloads

#CMD ["npm","start"]
EXPOSE 3000

COPY bin ./bin
COPY ./bin/docker_entryponit.sh .

COPY --from=base /app/prod_node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/projects ./projects
COPY --from=build /app/typings ./typings
COPY --from=build /app/liquidations ./liquidations
COPY --from=build /app/utils ./utils
COPY --from=build /app/package.json .

RUN chmod +x ./docker_entryponit.sh

# Start process.yml
ENTRYPOINT ["./docker_entryponit.sh"]
