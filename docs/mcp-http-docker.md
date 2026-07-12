# MCP HTTP and Docker

TypesenseKit ships two MCP entrypoints:

- `typesensekit-mcp` for local stdio clients.
- `typesensekit-mcp-http` for stateless Streamable HTTP deployments.

## Run HTTP Locally

```sh
TYPESENSE_URL=http://localhost:8108 \
TYPESENSE_API_KEY=xyz \
TYPESENSEKIT_MCP_PORT=3000 \
TYPESENSEKIT_MCP_BEARER_TOKEN=replace-with-a-long-random-token \
pnpm --filter @typesensekit/mcp exec typesensekit-mcp-http
```

The HTTP endpoint defaults to `POST /mcp`. A lightweight health check is
available at `GET /healthz`.

Optional environment:

```sh
TYPESENSEKIT_MCP_PATH=/mcp
TYPESENSEKIT_MCP_HOST=127.0.0.1
TYPESENSEKIT_MCP_ALLOWED_ORIGINS=https://your-mcp-client.example
TYPESENSEKIT_MCP_MAX_BODY_BYTES=1048576
TYPESENSEKIT_MCP_BEARER_TOKEN=replace-with-a-long-random-token
TYPESENSEKIT_READ_ONLY=true
TYPESENSE_CONNECTION_TIMEOUT_SECONDS=5
```

## Docker

Build the image:

```sh
docker build -t typesensekit-mcp .
```

Run the image:

```sh
docker run --rm -p 3000:3000 \
  -e TYPESENSE_URL=https://your-cluster.typesense.net \
  -e TYPESENSE_API_KEY=your-scoped-api-key \
  -e TYPESENSEKIT_MCP_BEARER_TOKEN=replace-with-a-long-random-token \
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
      - key: TYPESENSEKIT_MCP_BEARER_TOKEN
        sync: false
      - key: TYPESENSEKIT_MCP_ALLOWED_ORIGINS
        value: "https://your-mcp-client.example"
      - key: TYPESENSE_CONNECTION_TIMEOUT_SECONDS
        value: "5"
```

The server binds to `127.0.0.1` by default. The Docker image explicitly binds to
`0.0.0.0` and therefore requires `TYPESENSEKIT_MCP_BEARER_TOKEN`. If an
authenticating reverse proxy owns the trust boundary, explicitly set
`TYPESENSEKIT_MCP_ALLOW_UNAUTHENTICATED=true` and keep the service unreachable
except through that proxy. Browser Origins are rejected unless they match the
local defaults or `TYPESENSEKIT_MCP_ALLOWED_ORIGINS`.
