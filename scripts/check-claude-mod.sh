#!/usr/bin/env bash
set -euo pipefail

mod_test_config_dir=$(mktemp -d /tmp/auto-mode-mod-check.XXXXXX)
trap 'rm -rf "$mod_test_config_dir"' EXIT

claude_mod_bin=$(command -v claude)
mkdir -p "$mod_test_config_dir/mod/.claude-plugin"
cp mods/auto-mode/.claude-plugin/plugin.json "$mod_test_config_dir/mod/.claude-plugin/"
cp -R mods/auto-mode/hooks "$mod_test_config_dir/mod/hooks"
cp -R mods/auto-mode/contract "$mod_test_config_dir/mod/contract"
find "$mod_test_config_dir/mod/contract" -name '*.test.ts' -delete
find "$mod_test_config_dir/mod/hooks" -name '*.claude-check.ts' -exec sh -c 'mv "$1" "${1%.claude-check.ts}.test.ts"' sh {} \;
cp mods/auto-mode/tsconfig.json "$mod_test_config_dir/mod/"
env -i PATH="$PATH" CLAUDE_CONFIG_DIR="$mod_test_config_dir/config" "$claude_mod_bin" plugin validate "$mod_test_config_dir/mod"
env -i PATH="$PATH" CLAUDE_CONFIG_DIR="$mod_test_config_dir/config" "$claude_mod_bin" plugin test "$mod_test_config_dir/mod"
