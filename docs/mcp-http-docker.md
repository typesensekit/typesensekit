# MCP HTTP and Docker

TypesenseKit ships two MCP entrypoints:

- `typesensekit-mcp` for local stdio clients.
- `typesensekit-mcp-http` for stateless Streamable HTTP deployments.

## Run HTTP Locally

```sh
TYPESENSE_URL=http://localhost:8108 \
TYPESENSE_API_KEY=xyz \
TYPESENSEKIT_MCP_PORT=3000 \
pnpm --filter @typesensekit/mcp exec typesensekit-mcp-http
```

The HTTP endpoint defaults to `POST /mcp`. A lightweight health check is
available at `GET /healthz`.

Optional environment:

```sh
TYPESENSEKIT_MCP_PATH=/mcp
TYPESENSEKIT_READ_ONLY=true
TYPESENSE_CONNECTION_TIMEOUT_SECONDS=5
```

## Docker

Use the prebuilt image:

```sh
docker run --rm -p 3000:3000 \
  -e TYPESENSE_URL=https://your-cluster.typesense.net \
  -e TYPESENSE_API_KEY=your-scoped-api-key \
  -e TYPESENSEKIT_READ_ONLY=true \
  ghcr.io/akshitkrnagpal/typesensekit-mcp:latest
```

Build the image:

```sh
docker build -t typesensekit-mcp .
```

Run the image:

```sh
docker run --rm -p 3000:3000 \
  -e TYPESENSE_URL=https://your-cluster.typesense.net \
  -e TYPESENSE_API_KEY=your-scoped-api-key \
  -e TYPESENSEKIT_READ_ONLY=true \
  typesensekit-mcp
```

## Minimal Deploy Example

Deploy the container behind a platform or reverse proxy that provides TLS,
request logging, and rate limiting:

```yaml
services:
  - name: typesensekit-mcp
    type: web
    env: docker
    dockerfilePath: ./Dockerfile
    healthCheckPath: /healthz
    envVars:
      - key: TYPESENSE_URL
        sync: false
      - key: TYPESENSE_API_KEY
        sync: false
      - key: TYPESENSEKIT_READ_ONLY
        value: "true"
      - key: TYPESENSE_CONNECTION_TIMEOUT_SECONDS
        value: "5"
```

Keep the service private unless the client performs authentication in front of
it. TypesenseKit's HTTP entrypoint does not add its own authentication layer; it
relies on the deployment boundary and the scoped Typesense API key.
