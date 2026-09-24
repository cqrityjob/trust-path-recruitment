# Public multi-architecture manifest digests verified 2026-09-24. Keep runtime.json in sync.
FROM oven/bun:1.3.14-debian@sha256:9dba1a1b43ce28c9d7931bfc4eb00feb63b0114720a0277a8f939ae4dfc9db6f AS build
WORKDIR /build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY scripts/security-work-processor*.ts scripts/
COPY scripts/security-work-processor-runtime.json scripts/
COPY src/lib/security-work/processing/ src/lib/security-work/processing/
RUN bun run scripts/security-work-processor-build.ts /artifact

FROM node:22.23.3-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
ENV NODE_ENV=production SW_PROCESSOR_HOST=0.0.0.0 SW_PROCESSOR_PORT=8789
WORKDIR /app
COPY --from=build /artifact/ ./
USER node
RUN node verify.mjs
EXPOSE 8789
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node --input-type=module -e 'const r=await fetch("http://127.0.0.1:8789/healthz",{signal:AbortSignal.timeout(2000)});if(!r.ok)process.exit(1);const d=await r.json();if(d.status!=="ok"||d.parserVersion!=="sw-text-1.0.0")process.exit(1)'
CMD ["node", "server.mjs"]
