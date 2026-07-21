# --- Stage 1: build the web frontend ---
FROM node:22-alpine AS web-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --legacy-peer-deps
COPY web/ ./
RUN npm run build

# --- Stage 2: build the Go server, embedding the built frontend ---
FROM golang:1.26-alpine AS server-builder
WORKDIR /server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
COPY --from=web-builder /web/dist/ ./internal/webui/dist/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/reelix-server ./cmd/reelix-server

# --- Stage 3: slim runtime with ffmpeg ---
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=server-builder /out/reelix-server /usr/local/bin/reelix-server

ENV REELIX_HTTP_ADDR=:8096
ENV REELIX_DATA_DIR=/config
VOLUME ["/config", "/transcode"]
EXPOSE 8096

ENTRYPOINT ["/usr/local/bin/reelix-server"]
