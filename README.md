# CopyStructure para Vencord

Plugin de usuario para exportar roles y canales de un servidor de Discord a JSON e importar esa estructura en otro. Está pensado para acelerar la configuración de servidores basados en una plantilla.

> CopyStructure no clona un servidor completo. Solo trabaja con los roles, canales y permisos que implementa el plugin y que Discord permite gestionar.

## Funciones

- Exporta roles normales, permisos, color, posición aproximada, separador y capacidad de mención.
- Exporta canales de texto, voz, categorías, anuncios, escenarios y foros disponibles para el usuario.
- Conserva categorías y permisos sobrescritos por rol, remapeando los IDs al servidor destino.
- Descarga un JSON del estado de roles, canales y overwrites por rol del destino antes de modificarlo.
- Espacia las solicitudes y muestra los canales que Discord no pudo crear.
- Si falla algún canal, continúa con los demás. El botón **Deshacer cambios** permite borrar lo creado por ese intento y restaurar los permisos previos de `@everyone`.
- Si el destino no admite un canal Stage, el plugin intenta crearlo como voz. El bitrate de voz se limita a 90 000 bit/s.

## Instalación Para Usuarios

GitHub Actions comprueba a diario el último commit de `Vendicated/Vencord` en `main`. Si upstream o CopyStructure cambió desde el bundle anterior, compila un release nuevo y publica `CopyStructure-bundle.zip`. También puedes ejecutar el workflow manualmente desde la pestaña **Actions** del repositorio. Los instaladores consultan el último release al ejecutarse.

El repositorio de GitHub debe tener su rama `main` y el workflow publicado. El primer bundle se genera después del primer push que active Actions; hasta que exista un release publicado, los instaladores indicarán que no se pudo descargar la versión más reciente.

El workflow construye el bundle en GitHub Actions; instalarlo no requiere Node.js, pnpm ni compilar Vencord en el equipo del usuario. En Windows el bootstrap usa Windows PowerShell. En Linux requiere `curl` y `unzip`.

El ZIP de release contiene el bootstrap, los instaladores internos, `dist/` con `patcher.js`, `preload.js`, `renderer.js` y `renderer.css`, y los avisos de terceros. La compilación actual está basada en Vencord 1.15.11, commit `16ec4ea838899706019e7f472e45f055070abeb1`; los siguientes releases se generan automáticamente desde Vencord `main`.

### Windows

1. Descarga o conserva el repositorio de CopyStructure.
2. Ejecuta `INSTALL.cmd`; consulta GitHub y descarga automáticamente el bundle del release más reciente.
3. El instalador valida el bundle y la instalación de Vencord en `%APPDATA%\Vencord`, cierra los clientes Discord que estaban abiertos y reemplaza la carpeta `dist`.
4. Abre Discord y activa CopyStructure en **Ajustes de usuario → Vencord → Plugins**.

Antes de reemplazar `dist`, el instalador guarda una copia fechada en `%APPDATA%\Vencord\dist.copystructure-backup-<fecha>`. Si la instalación o la verificación falla, intenta restaurar el `dist` anterior.

**El bundle sustituye la carpeta `dist` completa.** Debe incluir los demás plugins y personalizaciones que quieras conservar. El instalador no combina bundles.

El bundle de publicación se compila con `--standalone --disable-updater`: el actualizador integrado de Vencord queda desactivado para evitar que reemplace el bundle personalizado y quite CopyStructure. Vencord no se actualizará automáticamente mientras uses este bundle. Para volver al Vencord anterior, cierra Discord y restaura la copia fechada, o reinstálalo con el instalador oficial.

### Linux

1. Descarga o conserva el repositorio de CopyStructure.
2. Cierra Discord manualmente.
3. En una terminal dentro del repositorio, ejecuta `bash INSTALL.sh`; descargará el último bundle desde GitHub.
4. Cuando se solicite, indica la carpeta de Vencord que contiene `dist/`.
5. Abre Discord y activa CopyStructure en **Ajustes de usuario → Vencord → Plugins**.

El instalador guarda una copia fechada de `dist/` y valida el bundle antes de sustituir la instalación. Si la verificación falla, intenta restaurar la copia anterior. El bundle standalone desactiva el actualizador integrado, igual que en Windows.

### macOS

No hay un instalador precompilado de macOS en este repositorio todavía. Usa un bundle compatible con tu instalación de Vencord o instala desde un checkout propio siguiendo las instrucciones para desarrolladores.

## Uso

1. Abre **Ajustes de usuario → Vencord → Plugins → CopyStructure**.
2. Selecciona el servidor de origen y pulsa **Exportar JSON**.
3. Selecciona el servidor de destino y carga el JSON exportado.
4. Revisa el resumen, confirma la operación y pulsa **Aplicar estructura**.
5. Si hay errores, consulta el detalle y descarga el informe. La importación intenta continuar con otros canales.
6. Para borrar los recursos creados por ese intento, pulsa **Deshacer cambios**. No se ejecuta automáticamente.

Debes pertenecer a los servidores y tener permisos suficientes para administrar roles y canales en el destino. Discord también aplica jerarquías, límites del servidor y límites dinámicos de solicitudes.

## Deshacer Cambios

El botón aparece si se detectan errores durante la importación. Al pulsarlo, CopyStructure intenta:

1. Eliminar los canales creados en el intento actual.
2. Eliminar los roles creados en el intento actual.
3. Restaurar los permisos anteriores de `@everyone` si fueron modificados.

Si Discord rechaza alguna operación, se muestran los elementos pendientes y puedes pulsar de nuevo para reintentar. El registro de IDs existe durante la sesión actual del plugin; no sirve para revertir importaciones anteriores. El JSON de backup es una instantánea informativa, no un mecanismo de restauración completa del servidor.

## Qué No Copia

- Miembros ni sus asignaciones de roles.
- Hilos, mensajes, archivos, invitaciones ni actividad.
- Overwrites específicos de usuarios.
- Roles administrados por integraciones.
- Integraciones, bots, emojis, stickers, onboarding y todas las opciones avanzadas de roles o canales.

Las posiciones se reproducen de forma aproximada y pueden requerir ajustes manuales. Los IDs de Discord son distintos entre servidores; el plugin remapea roles y categorías que crea.

El backup previo incluye roles normales, canales compatibles y overwrites por rol que el plugin puede leer. No incluye mensajes, miembros, sus asignaciones ni recursos fuera de ese alcance.

## Desarrollo y Publicación

El código fuente está en `src/userplugins/copystructure/index.tsx` y usa los alias internos de Vencord (`@api`, `@utils` y `@webpack`). Para recrear manualmente el bundle, el mantenedor necesita Node.js, pnpm y un checkout de Vencord:

1. Usa el commit de Vencord indicado arriba o actualiza deliberadamente la versión base.
2. Copia el plugin a `src/plugins/copystructure/index.tsx` en el checkout. Para que el plugin aparezca en el bundle standalone, se compila desde `src/plugins`.
3. Desde la raíz de Vencord, ejecuta `pnpm install --frozen-lockfile` y `pnpm build --standalone --disable-updater`.
4. Copia el `dist/` generado a este repositorio y empaqueta `dist/`, `INSTALL.cmd`, `INSTALL.sh` y los avisos de terceros en el ZIP del release.

Ese proceso manual requiere las herramientas de desarrollo de Vencord, pero no es necesario para publicar actualizaciones normales: GitHub Actions lo realiza automáticamente. Los instaladores de usuario no ejecutan pnpm. El instalador reemplaza todo `dist`, así que el bundle debe incluir los plugins y personalizaciones que quieras conservar.

## Seguridad y Limitaciones

- Los JSON se crean y descargan localmente; el plugin no los envía a un servicio externo.
- La importación usa las solicitudes del cliente de Discord conectado. Usa solo servidores cuya estructura tienes autorización para copiar.
- Discord no ofrece una operación transaccional de clonación. Si falla también el deshacer, algunos recursos pueden permanecer; el plugin mostrará los errores pendientes.
- Los límites de API son dinámicos. El intervalo de espera reduce la frecuencia, pero no garantiza evitar todos los rechazos.
- Windows instala en `%APPDATA%\Vencord\dist`; Linux requiere indicar la carpeta que contiene `dist/`. Ambos instaladores guardan una copia del `dist` anterior.

## Licencia

Vencord está distribuido bajo GPL-3.0-or-later; consulta el archivo `LICENSE` incluido en `dist/` y `THIRD_PARTY_NOTICES.md`. La licencia específica del código de CopyStructure no está declarada en este repositorio; añade una licencia compatible para ese código antes de redistribuir el bundle.
