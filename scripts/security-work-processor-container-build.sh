#!/usr/bin/env bash
# Local image only. No push, deploy, credentials or whole-checkout build context.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd "$script_dir/.." && pwd)"
docker_bin="${SW_PROCESSOR_DOCKER_BIN:-docker}"
image_name="${1:-sw-processor:local}"
target_platform="${SW_PROCESSOR_PLATFORM:-linux/amd64}"
context_dir="$(mktemp -d "${TMPDIR:-/tmp}/sw-processor-build.XXXXXX")"
trap 'rm -rf "$context_dir"' EXIT
mkdir -p "$context_dir/scripts" "$context_dir/src/lib/security-work/processing" "$context_dir/deploy/security-work-processor"
cp "$root_dir/package.json" "$root_dir/bun.lock" "$context_dir/"
for name in security-work-processor.ts security-work-processor-build.ts security-work-processor-verify.ts security-work-processor-config-check.ts security-work-processor-runtime.json; do
  cp "$root_dir/scripts/$name" "$context_dir/scripts/"
done
for name in contracts.ts extract.server.ts extract-transport.server.ts attestation.server.ts; do
  cp "$root_dir/src/lib/security-work/processing/$name" "$context_dir/src/lib/security-work/processing/"
done
cp "$root_dir/deploy/security-work-processor/Dockerfile" "$context_dir/deploy/security-work-processor/"
"$docker_bin" build --platform "$target_platform" -f "$context_dir/deploy/security-work-processor/Dockerfile" -t "$image_name" "$context_dir"
