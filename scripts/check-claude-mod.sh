#!/usr/bin/env bash
set -euo pipefail

mod_test_config_dir=$(mktemp -d /tmp/auto-mode-mod-check.XXXXXX)
trap 'rm -rf "$mod_test_config_dir"' EXIT

claude_mod_bin=$(command -v claude)
env -i PATH="$PATH" CLAUDE_CONFIG_DIR="$mod_test_config_dir" "$claude_mod_bin" plugin validate mods/auto-mode
env -i PATH="$PATH" CLAUDE_CONFIG_DIR="$mod_test_config_dir" "$claude_mod_bin" plugin test mods/auto-mode
