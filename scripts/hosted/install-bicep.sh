#!/usr/bin/env bash
# Installs the pinned Bicep CLI for az and fails unless that exact version is active.
set -euo pipefail
version=0.48.1
az bicep install --version "v$version"
actual=$(az bicep version 2>&1)
case "$actual" in
  *"Bicep CLI version $version "*) echo "Bicep CLI $version installed." ;;
  *) echo "Expected Bicep CLI $version, got: $actual" >&2; exit 1 ;;
esac
