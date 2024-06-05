.PHONY: build
.PHONY: buildBranch

NAME=footprint-defilama-adapters
REGISTRY=docker-registry.footprint.network
PROD_REGISTRY=docker-registry.footprint.network
NAMESPACE=xed
MEXL_NAMESPACE=mexl
BRANCH_NAME=$(shell git rev-parse --abbrev-ref HEAD)

build:
	echo building ${NAME}:${TAG}
	docker build --platform linux/amd64 -t ${PROD_REGISTRY}/${MEXL_NAMESPACE}/${NAME}:${TAG} .
	docker push "${PROD_REGISTRY}/${MEXL_NAMESPACE}/${NAME}:${TAG}"
