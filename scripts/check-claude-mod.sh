#!/usr/bin/env bash
set -euo pipefail

mod_test_config_dir=$(mktemp -d /tmp/auto-mode-mod-check.XXXXXX)
trap 'rm -rf "$mod_test_config_dir"' EXIT

claude_mod_bin=$(command -v claude)
mkdir -p "$mod_test_config_dir/mod/.claude-plugin" "$mod_test_config_dir/mod/hooks"
cp mods/auto-mode/.claude-plugin/plugin.json "$mod_test_config_dir/mod/.claude-plugin/"
cp mods/auto-mode/hooks/{hooks.json,register.ts,build-prompt-context.ts,parse-decision.ts,types.ts,testing.d.ts} "$mod_test_config_dir/mod/hooks/"
cp mods/auto-mode/hooks/register.claude-check.ts "$mod_test_config_dir/mod/hooks/register.test.ts"
cp mods/auto-mode/hooks/build-prompt-context.claude-check.ts "$mod_test_config_dir/mod/hooks/build-prompt-context.test.ts"
cp mods/auto-mode/tsconfig.json "$mod_test_config_dir/mod/"
env -i PATH="$PATH" CLAUDE_CONFIG_DIR="$mod_test_config_dir/config" "$claude_mod_bin" plugin validate "$mod_test_config_dir/mod"
env -i PATH="$PATH" CLAUDE_CONFIG_DIR="$mod_test_config_dir/config" "$claude_mod_bin" plugin test "$mod_test_config_dir/mod"
