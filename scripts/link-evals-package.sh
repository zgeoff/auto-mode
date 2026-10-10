#!/usr/bin/env bash
# Bun cannot install a workspace's dependency on the root package
# (oven-sh/bun#36594), so the evals package reaches auto-mode through this link.
set -euo pipefail

mkdir -p evals/node_modules
ln -sfn ../.. evals/node_modules/auto-mode
