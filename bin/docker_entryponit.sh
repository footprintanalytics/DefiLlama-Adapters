#!/bin/sh
if [ ${NODE_ENV} = "development" ]; then
    exec pm2-runtime ./bin/development_processes_docker.yml
elif [ ${NODE_ENV} = "production" ]; then
    exec pm2-runtime ./bin/production_processes_docker.yml
elif [ ${NODE_ENV} = "preview" ]; then
    exec pm2-runtime ./bin/development_processes_docker.yml
fi
