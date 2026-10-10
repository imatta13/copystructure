#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="imatta13/copystructure"
ASSET_NAME="CopyStructure-bundle.zip"
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/copystructure-latest.XXXXXX")
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

command -v curl >/dev/null 2>&1 || { printf 'ERROR: curl no esta instalado.\n' >&2; exit 1; }
command -v unzip >/dev/null 2>&1 || { printf 'ERROR: unzip no esta instalado.\n' >&2; exit 1; }

printf '\n==============================================================\n'
printf 'CopyStructure - buscando la ultima version\n'
printf '==============================================================\n\n'

effective_url=$(curl --fail --location --silent --show-error \
    --output "$WORK_DIR/$ASSET_NAME" \
    --write-out '%{url_effective}' \
    "https://github.com/$REPOSITORY/releases/latest/download/$ASSET_NAME") || {
    printf 'ERROR: No se pudo descargar el asset latest %s.\n' "$ASSET_NAME" >&2
    exit 1
}
release_tag=${effective_url#*/releases/download/}
release_tag=${release_tag%%/*}
printf 'Ultima version publicada: %s\n' "$release_tag"
unzip -q "$WORK_DIR/$ASSET_NAME" -d "$WORK_DIR/bundle"

bundle_root="$WORK_DIR/bundle"
if [[ ! -f "$bundle_root/INSTALL-BUNDLE.sh" ]]; then
    child_installer=$(find "$bundle_root" -mindepth 2 -maxdepth 3 -type f -name INSTALL-BUNDLE.sh -print -quit)
    [[ -n "$child_installer" ]] || { printf 'ERROR: El release no contiene INSTALL-BUNDLE.sh.\n' >&2; exit 1; }
    bundle_root=$(dirname "$child_installer")
fi
printf '%s\n' "$release_tag" > "$bundle_root/BUNDLE-VERSION.txt"
bash "$bundle_root/INSTALL-BUNDLE.sh"
