FROM alpine AS base

# Disable the runtime transpiler cache by default inside Docker containers.
# On ephemeral containers, the cache is not useful
ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=${BUN_RUNTIME_TRANSPILER_CACHE_PATH}
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV OPENCODE_DISABLE_DEFAULT_PLUGINS=1
RUN apk add libgcc libstdc++ ripgrep xdg-utils

FROM base AS build-amd64
COPY packages/opencode/dist/@costrict/cs-linux-x64-baseline-musl/bin/cs /usr/local/bin/cs

FROM base AS build-arm64
COPY packages/opencode/dist/@costrict/cs-linux-arm64-musl/bin/cs /usr/local/bin/cs

ARG TARGETARCH
FROM build-${TARGETARCH}
RUN cs --version
ENTRYPOINT ["cs"]
