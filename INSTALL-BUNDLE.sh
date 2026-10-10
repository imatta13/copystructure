#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SOURCE_DIST="$SCRIPT_DIR/dist"
say_error() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
check_dist_files() {
    local dir=$1 file
    for file in patcher.js preload.js renderer.js renderer.css; do [[ -s "$dir/$file" ]] || return 1; done
}
check_bundle() { check_dist_files "$1" && grep -aFq 'CopyStructure' "$1/renderer.js"; }

check_bundle "$SOURCE_DIST" || say_error "El bundle incluido no es valido o no contiene CopyStructure."
read -r -p 'Ruta a Vencord, la carpeta que contiene dist/: ' VENCORD_ROOT
VENCORD_ROOT=${VENCORD_ROOT#\"}; VENCORD_ROOT=${VENCORD_ROOT%\"}
VENCORD_ROOT=${VENCORD_ROOT#\'}; VENCORD_ROOT=${VENCORD_ROOT%\'}
[[ -n "$VENCORD_ROOT" ]] || say_error "No se indico una ruta."
VENCORD_ROOT=$(cd "$VENCORD_ROOT" 2>/dev/null && pwd) || say_error "No se puede acceder a esa carpeta."
LIVE_DIST="$VENCORD_ROOT/dist"
[[ -d "$LIVE_DIST" ]] || say_error "No existe dist/ dentro de $VENCORD_ROOT."
check_dist_files "$LIVE_DIST" || say_error "El dist actual esta incompleto. Repara Vencord antes."

for proc in Discord DiscordCanary DiscordPTB discord; do
    if pgrep -x "$proc" >/dev/null 2>&1; then say_error "Cierra Discord manualmente y vuelve a ejecutar. Vencord sigue intacto."; fi
done

stamp=$(date +%Y%m%d-%H%M%S)
BACKUP="$VENCORD_ROOT/dist.copystructure-backup-$stamp"
BACKUP_STAGE="$VENCORD_ROOT/dist.copystructure-backup-new"
NEW_DIST="$VENCORD_ROOT/dist.copystructure-new"
OLD_DIST="$VENCORD_ROOT/dist.copystructure-old"
[[ ! -e "$OLD_DIST" ]] || say_error "Quedaron restos de una instalacion anterior en $OLD_DIST."
rm -rf "$BACKUP_STAGE" "$NEW_DIST"
printf 'Creando backup de Vencord...\n'
cp -a "$LIVE_DIST" "$BACKUP_STAGE" || say_error "No se pudo copiar dist; Vencord sigue intacto."
check_dist_files "$BACKUP_STAGE" || { rm -rf "$BACKUP_STAGE"; say_error "El backup no paso la verificacion."; }
mv "$BACKUP_STAGE" "$BACKUP" || say_error "No se pudo guardar el backup."
printf 'Preparando bundle...\n'
cp -a "$SOURCE_DIST" "$NEW_DIST" || { rm -rf "$NEW_DIST"; say_error "No se pudo copiar el bundle."; }
check_bundle "$NEW_DIST" || { rm -rf "$NEW_DIST"; say_error "El bundle no paso la verificacion; Vencord sigue intacto."; }

printf 'Instalando bundle...\n'
mv "$LIVE_DIST" "$OLD_DIST" || { rm -rf "$NEW_DIST"; say_error "No se pudo apartar el dist actual."; }
if ! mv "$NEW_DIST" "$LIVE_DIST" || ! check_bundle "$LIVE_DIST"; then
    printf 'Fallo la verificacion; restaurando bundle anterior...\n' >&2
    rm -rf "$LIVE_DIST"
    if mv "$OLD_DIST" "$LIVE_DIST"; then say_error "Se restauro Vencord. Backup adicional: $BACKUP"; fi
    say_error "Fallo la restauracion. Recupera manualmente desde $BACKUP y no abras Discord."
fi
rm -rf "$OLD_DIST"
printf '\nInstalacion completada. Backup anterior:\n  %s\n' "$BACKUP"
printf 'Abre Discord y activa CopyStructure en Ajustes > Vencord > Plugins.\n'
