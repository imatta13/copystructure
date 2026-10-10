import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, GuildRoleStore, GuildStore, React, RestAPI, SearchableSelect, useStateFromStores } from "@webpack/common";

const SUPPORTED_CHANNEL_TYPES = new Set([0, 2, 4, 5, 13, 15]);
const ROLE_OVERWRITE_TYPE = 0;
const MIN_MUTATION_INTERVAL_MS = 2000;
const MAX_VOICE_BITRATE = 90000;

interface PermissionOverwriteBackup {
    id: string;
    type: number;
    allow: string;
    deny: string;
}

interface RoleBackup {
    id: string;
    name: string;
    permissions: string;
    color: number;
    hoist: boolean;
    mentionable: boolean;
    position: number;
    everyone?: boolean;
}

interface ChannelBackup {
    id: string;
    name: string;
    type: number;
    position: number;
    parentId?: string;
    topic?: string | null;
    nsfw?: boolean;
    bitrate?: number;
    userLimit?: number;
    rateLimitPerUser?: number;
    permissionOverwrites: PermissionOverwriteBackup[];
}

interface StructureBackup {
    version: 1;
    exportedAt: string;
    sourceGuildName: string;
    roles: RoleBackup[];
    channels: ChannelBackup[];
}

interface ChannelImportFailure {
    name: string;
    type: number;
    error: string;
}

interface PendingUndo {
    guildId: string;
    guildName: string;
    roleIds: string[];
    channelIds: string[];
    originalEveryonePermissions?: string;
    restoreEveryone: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isDecimalString(value: unknown): value is string {
    return typeof value === "string" && /^\d+$/.test(value);
}

function describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function getDiscordErrorCode(error: unknown, depth = 0): number | undefined {
    if (!isRecord(error) || depth > 4) return undefined;
    if (typeof error.code === "number") return error.code;
    if (typeof error.code === "string" && /^\d+$/.test(error.code)) return Number(error.code);

    for (const key of ["body", "data", "error", "response"]) {
        const nestedCode = getDiscordErrorCode(error[key], depth + 1);
        if (nestedCode !== undefined) return nestedCode;
    }
}

function parseBackup(value: unknown): StructureBackup {
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.roles) || !Array.isArray(value.channels)) {
        throw new Error("El archivo no es una exportación compatible de Copy Structure.");
    }

    const roles = value.roles.map((item): RoleBackup => {
        if (!isRecord(item)
            || typeof item.id !== "string"
            || typeof item.name !== "string"
            || item.name.length > 100
            || !isDecimalString(item.permissions)
            || typeof item.color !== "number"
            || typeof item.hoist !== "boolean"
            || typeof item.mentionable !== "boolean"
            || typeof item.position !== "number") {
            throw new Error("El archivo contiene un rol con datos inválidos.");
        }

        return {
            id: item.id,
            name: item.name,
            permissions: item.permissions,
            color: item.color,
            hoist: item.hoist,
            mentionable: item.mentionable,
            position: item.position,
            everyone: item.everyone === true
        };
    });

    const channels = value.channels.map((item): ChannelBackup => {
        if (!isRecord(item)
            || typeof item.id !== "string"
            || typeof item.name !== "string"
            || item.name.length > 100
            || typeof item.type !== "number"
            || !SUPPORTED_CHANNEL_TYPES.has(item.type)
            || typeof item.position !== "number"
            || !Array.isArray(item.permissionOverwrites)) {
            throw new Error("El archivo contiene un canal con datos inválidos.");
        }

        const permissionOverwrites = item.permissionOverwrites.map((overwrite): PermissionOverwriteBackup => {
            if (!isRecord(overwrite)
                || typeof overwrite.id !== "string"
                || overwrite.type !== ROLE_OVERWRITE_TYPE
                || !isDecimalString(overwrite.allow)
                || !isDecimalString(overwrite.deny)) {
                throw new Error("El archivo contiene permisos de canal inválidos.");
            }

            return {
                id: overwrite.id,
                type: ROLE_OVERWRITE_TYPE,
                allow: overwrite.allow,
                deny: overwrite.deny
            };
        });

        return {
            id: item.id,
            name: item.name,
            type: item.type,
            position: item.position,
            parentId: typeof item.parentId === "string" ? item.parentId : undefined,
            topic: typeof item.topic === "string" || item.topic === null ? item.topic : undefined,
            nsfw: typeof item.nsfw === "boolean" ? item.nsfw : undefined,
            bitrate: typeof item.bitrate === "number" ? item.bitrate : undefined,
            userLimit: typeof item.userLimit === "number" ? item.userLimit : undefined,
            rateLimitPerUser: typeof item.rateLimitPerUser === "number" ? item.rateLimitPerUser : undefined,
            permissionOverwrites
        };
    });

    if (typeof value.sourceGuildName !== "string") {
        throw new Error("El archivo no incluye el nombre del servidor origen.");
    }

    return {
        version: 1,
        exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
        sourceGuildName: value.sourceGuildName,
        roles,
        channels
    };
}

function exportGuild(guildId: string, guildName: string): StructureBackup {
    const roles = GuildRoleStore.getSortedRoles(guildId);
    const roleIds = new Set(roles.map(role => role.id));
    const channels = Object.values(ChannelStore.getMutableGuildChannelsForGuild(guildId));

    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        sourceGuildName: guildName,
        roles: roles
            .filter(role => role.id === guildId || !role.managed)
            .map(role => ({
                id: role.id,
                name: role.name,
                permissions: String(role.permissions),
                color: role.color,
                hoist: role.hoist,
                mentionable: role.mentionable,
                position: role.position,
                everyone: role.id === guildId
            })),
        channels: channels
            .filter(channel => channel.guild_id === guildId && SUPPORTED_CHANNEL_TYPES.has(channel.type))
            .map(channel => ({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                position: channel.position,
                parentId: channel.parent_id ?? undefined,
                topic: channel.topic,
                nsfw: channel.nsfw,
                bitrate: channel.bitrate,
                userLimit: channel.userLimit,
                rateLimitPerUser: channel.rateLimitPerUser,
                permissionOverwrites: Object.values(channel.permissionOverwrites ?? {})
                    .filter(overwrite => overwrite.type === ROLE_OVERWRITE_TYPE && (overwrite.id === guildId || roleIds.has(overwrite.id)))
                    .map(overwrite => ({
                        id: overwrite.id,
                        type: ROLE_OVERWRITE_TYPE,
                        allow: String(overwrite.allow),
                        deny: String(overwrite.deny)
                    }))
            }))
    };
}

function downloadBackup(backup: StructureBackup) {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `discord-structure-${backup.sourceGuildName.replace(/[^a-z0-9-_]/gi, "-")}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadImportReport(failures: ChannelImportFailure[], guildName: string) {
    const report = [
        `Informe de importación: ${guildName}`,
        `Fecha: ${new Date().toISOString()}`,
        `Canales fallidos: ${failures.length}`,
        "",
        ...failures.flatMap((failure, index) => [
            `${index + 1}. ${failure.name} (tipo ${failure.type})`,
            failure.error,
            ""
        ])
    ].join("\n");
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `copy-structure-errors-${guildName.replace(/[^a-z0-9-_]/gi, "-")}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StructureTools() {
    const guilds = useStateFromStores([GuildStore], () => GuildStore.getGuildsArray());
    const [sourceGuildId, setSourceGuildId] = React.useState("");
    const [targetGuildId, setTargetGuildId] = React.useState("");
    const [backup, setBackup] = React.useState<StructureBackup | null>(null);
    const [confirmed, setConfirmed] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [status, setStatus] = React.useState("");
    const [importFailures, setImportFailures] = React.useState<ChannelImportFailure[]>([]);
    const [rollbackFailures, setRollbackFailures] = React.useState<string[]>([]);
    const [pendingUndo, setPendingUndo] = React.useState<PendingUndo | null>(null);
    const [targetBackup, setTargetBackup] = React.useState<StructureBackup | null>(null);

    const options = guilds.map(guild => ({ label: guild.name, value: guild.id }));
    const targetGuild = guilds.find(guild => guild.id === targetGuildId);

    function handleExport() {
        const sourceGuild = guilds.find(guild => guild.id === sourceGuildId);
        if (!sourceGuild) return;

        try {
            downloadBackup(exportGuild(sourceGuild.id, sourceGuild.name));
            setStatus(`Estructura de ${sourceGuild.name} exportada.`);
        } catch (error) {
            setStatus(`No se pudo exportar: ${String(error)}`);
        }
    }

    async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (!file) return;

        try {
            setBackup(parseBackup(JSON.parse(await file.text())));
            setConfirmed(false);
            setStatus("Exportación cargada. Revisa el resumen antes de aplicarla.");
        } catch (error) {
            setBackup(null);
            setConfirmed(false);
            setStatus(`No se pudo leer el archivo: ${String(error)}`);
        }
    }

    async function handleImport() {
        if (!backup || !targetGuildId || !targetGuild || !confirmed || sourceGuildId === targetGuildId) return;

        setBusy(true);
        setStatus("Importando estructura...");
        setImportFailures([]);
        setRollbackFailures([]);
        setPendingUndo(null);
        const failures: ChannelImportFailure[] = [];
        const createdRoleIds: string[] = [];
        const createdChannelIds: string[] = [];
        const roleIdMap = new Map<string, string>();
        roleIdMap.set(backup.roles.find(role => role.everyone)?.id ?? "", targetGuildId);
        let createdRoles = 0;
        let createdChannels = 0;
        let convertedStageChannels = 0;
        let lastMutationAt = 0;
        let currentAction = "preparar la importación";
        let everyoneUpdated = false;
        let originalEveryonePermissions: string | undefined;

        async function waitForMutationSlot() {
            const waitMs = lastMutationAt + MIN_MUTATION_INTERVAL_MS - Date.now();
            if (waitMs > 0) {
                setStatus(`Esperando ${Math.ceil(waitMs / 1000)} s antes de la siguiente solicitud...`);
                await new Promise(resolve => window.setTimeout(resolve, waitMs));
            }
            lastMutationAt = Date.now();
        }

        try {
            currentAction = "crear el backup previo del servidor destino";
            const snapshot = exportGuild(targetGuildId, targetGuild.name);
            setTargetBackup(snapshot);
            downloadBackup(snapshot);
            const everyoneBefore = GuildRoleStore.getRolesSnapshot(targetGuildId)?.[targetGuildId];
            originalEveryonePermissions = everyoneBefore ? String(everyoneBefore.permissions) : undefined;

            const everyoneRole = backup.roles.find(role => role.everyone);
            if (everyoneRole) {
                currentAction = "actualizar @everyone";
                await waitForMutationSlot();
                await RestAPI.patch({
                    url: `/guilds/${targetGuildId}/roles/${targetGuildId}`,
                    body: { permissions: everyoneRole.permissions }
                });
                everyoneUpdated = true;
            }

            for (const role of [...backup.roles].filter(role => !role.everyone).sort((left, right) => right.position - left.position)) {
                currentAction = `crear rol "${role.name}"`;
                await waitForMutationSlot();
                const response = await RestAPI.post({
                    url: `/guilds/${targetGuildId}/roles`,
                    body: {
                        name: role.name,
                        permissions: role.permissions,
                        color: role.color,
                        hoist: role.hoist,
                        mentionable: role.mentionable
                    }
                });
                const createdRole = response?.body;
                if (typeof createdRole?.id !== "string") throw new Error(`Discord no devolvió el ID del rol ${role.name}.`);
                roleIdMap.set(role.id, createdRole.id);
                createdRoleIds.push(createdRole.id);
                createdRoles++;
            }

            const channels = [...backup.channels].sort((left, right) => {
                if (left.type === 4 && right.type !== 4) return -1;
                if (left.type !== 4 && right.type === 4) return 1;
                return left.position - right.position;
            });

            for (const channel of channels) {
                currentAction = `crear canal "${channel.name}" (tipo ${channel.type})`;
                try {
                    const permissionOverwrites = channel.permissionOverwrites.flatMap(overwrite => {
                        const targetRoleId = roleIdMap.get(overwrite.id);
                        return targetRoleId ? [{
                            id: targetRoleId,
                            type: ROLE_OVERWRITE_TYPE,
                            allow: overwrite.allow,
                            deny: overwrite.deny
                        }] : [];
                    });
                    const body: Record<string, unknown> = {
                        name: channel.name,
                        type: channel.type,
                        permission_overwrites: permissionOverwrites
                    };

                    if (channel.parentId && roleIdMap.has(channel.parentId)) {
                        body.parent_id = roleIdMap.get(channel.parentId);
                    }
                    if (channel.topic !== undefined) body.topic = channel.topic;
                    if (channel.nsfw !== undefined) body.nsfw = channel.nsfw;
                    if (channel.bitrate !== undefined && (channel.type === 2 || channel.type === 13)) {
                        body.bitrate = Math.min(channel.bitrate, MAX_VOICE_BITRATE);
                    }
                    if (channel.userLimit !== undefined) body.user_limit = channel.userLimit;
                    if (channel.rateLimitPerUser !== undefined) body.rate_limit_per_user = channel.rateLimitPerUser;

                    await waitForMutationSlot();
                    let response;
                    try {
                        response = await RestAPI.post({ url: `/guilds/${targetGuildId}/channels`, body });
                    } catch (error) {
                        if (channel.type !== 13 || getDiscordErrorCode(error) !== 50024) throw error;

                        setStatus(`El servidor destino no admite escenarios; creando "${channel.name}" como canal de voz...`);
                        await waitForMutationSlot();
                        response = await RestAPI.post({
                            url: `/guilds/${targetGuildId}/channels`,
                            body: { ...body, type: 2 }
                        });
                        convertedStageChannels++;
                    }
                    if (typeof response?.body?.id !== "string") throw new Error(`Discord no devolvió el ID del canal ${channel.name}.`);
                    if (channel.type === 4) roleIdMap.set(channel.id, response.body.id);
                    createdChannelIds.push(response.body.id);
                    createdChannels++;
                } catch (error) {
                    const failure = {
                        name: channel.name,
                        type: channel.type,
                        error: describeError(error)
                    };
                    failures.push(failure);
                    setImportFailures(previous => [...previous, failure]);
                    setStatus(`No se pudo crear "${channel.name}"; se continuará con los demás canales. ${failure.error}`);
                } finally {
                    setStatus(`Importando: ${createdRoles} roles y ${createdChannels} canales creados...`);
                }
            }

            if (failures.length > 0) {
                setPendingUndo({
                    guildId: targetGuildId,
                    guildName: targetGuild.name,
                    roleIds: [...createdRoleIds],
                    channelIds: [...createdChannelIds],
                    originalEveryonePermissions: everyoneUpdated ? originalEveryonePermissions : undefined,
                    restoreEveryone: everyoneUpdated
                });
                setStatus(`Importación finalizada con ${failures.length} canal(es) fallido(s). Los elementos creados siguen en el servidor; usa Deshacer cambios si quieres quitarlos.`);
                return;
            }

            const stageSummary = convertedStageChannels ? ` ${convertedStageChannels} escenario(s) se crearon como canales de voz.` : "";
            setStatus(`Importación finalizada en ${targetGuild.name}: ${createdRoles} roles y ${createdChannels} canales creados, ${failures.length} canales con error.${stageSummary}`);
        } catch (error) {
            const failure = { name: currentAction, type: -1, error: describeError(error) };
            failures.push(failure);
            setImportFailures(previous => [...previous, failure]);
            setPendingUndo({
                guildId: targetGuildId,
                guildName: targetGuild.name,
                roleIds: [...createdRoleIds],
                channelIds: [...createdChannelIds],
                originalEveryonePermissions: everyoneUpdated ? originalEveryonePermissions : undefined,
                restoreEveryone: everyoneUpdated
            });
            setStatus(`Importación detenida al ${currentAction}: ${failure.error}. Los cambios parciales siguen en el servidor; usa Deshacer cambios si quieres quitarlos.`);
        } finally {
            setBusy(false);
        }
    }

    async function handleUndo() {
        if (!pendingUndo || busy) return;

        setBusy(true);
        setRollbackFailures([]);
        setStatus("Deshaciendo los cambios de esta importación...");
        const remainingChannels: string[] = [];
        const remainingRoles: string[] = [];
        const errors: string[] = [];
        let lastMutationAt = 0;

        async function waitForMutationSlot() {
            const waitMs = lastMutationAt + MIN_MUTATION_INTERVAL_MS - Date.now();
            if (waitMs > 0) await new Promise(resolve => window.setTimeout(resolve, waitMs));
            lastMutationAt = Date.now();
        }

        try {
            for (const channelId of [...pendingUndo.channelIds].reverse()) {
                try {
                    await waitForMutationSlot();
                    await RestAPI.del({ url: `/channels/${channelId}` });
                } catch (error) {
                    remainingChannels.push(channelId);
                    errors.push(`Canal ${channelId}: ${describeError(error)}`);
                }
            }

            for (const roleId of [...pendingUndo.roleIds].reverse()) {
                try {
                    await waitForMutationSlot();
                    await RestAPI.del({ url: `/guilds/${pendingUndo.guildId}/roles/${roleId}` });
                } catch (error) {
                    remainingRoles.push(roleId);
                    errors.push(`Rol ${roleId}: ${describeError(error)}`);
                }
            }

            let restoreEveryone = false;
            if (pendingUndo.restoreEveryone) {
                if (pendingUndo.originalEveryonePermissions === undefined) {
                    restoreEveryone = true;
                    errors.push("No se pudieron leer los permisos originales de @everyone; no es posible restaurarlos automáticamente.");
                } else {
                    try {
                        await waitForMutationSlot();
                        await RestAPI.patch({
                            url: `/guilds/${pendingUndo.guildId}/roles/${pendingUndo.guildId}`,
                            body: { permissions: pendingUndo.originalEveryonePermissions }
                        });
                    } catch (error) {
                        restoreEveryone = true;
                        errors.push(`Permisos de @everyone: ${describeError(error)}`);
                    }
                }
            }

            setRollbackFailures(errors);
            if (errors.length === 0) {
                setPendingUndo(null);
                setStatus(`Deshacer completado: se eliminaron los elementos creados en ${pendingUndo.guildName} y se restauró @everyone.`);
            } else {
                setPendingUndo({
                    ...pendingUndo,
                    channelIds: remainingChannels.reverse(),
                    roleIds: remainingRoles.reverse(),
                    restoreEveryone
                });
                setStatus(`Deshacer parcialmente completado. Quedan ${remainingChannels.length} canal(es), ${remainingRoles.length} rol(es) o permisos por restaurar. Puedes volver a pulsar Deshacer cambios para reintentar.`);
            }
        } finally {
            setBusy(false);
        }
    }

    const buttonStyle: React.CSSProperties = { margin: "6px 8px 6px 0", padding: "8px 12px", cursor: "pointer" };

    return (
        <div>
            <h3>Copiar estructura de servidor</h3>
            <p>Exporta roles, canales y permisos por rol en canales. La exportación no incluye miembros, asignaciones de roles, hilos ni permisos específicos de usuarios.</p>

            <label>Servidor origen</label>
            <SearchableSelect
                options={options}
                value={sourceGuildId}
                onChange={setSourceGuildId}
                placeholder="Selecciona el servidor origen"
            />
            <button style={buttonStyle} disabled={!sourceGuildId || busy} onClick={handleExport}>Exportar JSON</button>

            <label>Servidor destino</label>
            <SearchableSelect
                options={options}
                value={targetGuildId}
                onChange={setTargetGuildId}
                placeholder="Selecciona el servidor destino"
            />
            <input type="file" accept="application/json,.json" onChange={handleFileChange} disabled={busy} />

            {backup && <div>
                <p><strong>{backup.sourceGuildName}</strong>: {backup.roles.length} roles y {backup.channels.length} canales. Se crearán elementos nuevos; no se borrará ni reemplazará el contenido existente.</p>
                <label>
                    <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.currentTarget.checked)} disabled={busy} />
                    {' '}Confirmo crear la estructura en {targetGuild?.name ?? "el servidor destino"} y copiar los permisos de @everyone.
                </label>
                <p>Los permisos de @everyone del destino se actualizarán. Se esperan al menos 2 segundos entre escrituras; Discord puede exigir más. Si hay errores, la importación continúa y los cambios parciales permanecen hasta que pulses Deshacer cambios.</p>
                <p>Antes de importar se descargará un JSON de roles, canales y permisos por rol del servidor destino. No incluye mensajes ni miembros.</p>
                <button
                    style={buttonStyle}
                    disabled={!confirmed || !targetGuildId || sourceGuildId === targetGuildId || busy}
                    onClick={handleImport}
                >
                    {busy ? "Importando..." : "Aplicar estructura"}
                </button>
            </div>}

            {status && <p role="status">{status}</p>}
            {targetBackup && <p>
                Backup previo guardado: {targetBackup.sourceGuildName}.
                <button style={buttonStyle} disabled={busy} onClick={() => downloadBackup(targetBackup)}>Descargar backup JSON</button>
            </p>}
            {importFailures.length > 0 && <div>
                <h4>Canales con error ({importFailures.length})</h4>
                <button style={buttonStyle} onClick={() => downloadImportReport(importFailures, targetGuild?.name ?? "servidor")}>Descargar registro de errores</button>
                <ul>
                    {importFailures.map((failure, index) => <li key={`${failure.name}-${index}`}>
                        <strong>{failure.name}</strong> (tipo {failure.type}): {failure.error}
                    </li>)}
                </ul>
            </div>}
            {pendingUndo && <div>
                <p>Hay cambios parciales de esta importación en {pendingUndo.guildName}. No se eliminarán hasta que pulses el botón.</p>
                <button style={buttonStyle} disabled={busy} onClick={handleUndo}>
                    {busy ? "Deshaciendo..." : "Deshacer cambios"}
                </button>
            </div>}
            {rollbackFailures.length > 0 && <div>
                <h4>Errores al deshacer</h4>
                <ul>{rollbackFailures.map((failure, index) => <li key={`${failure}-${index}`}>{failure}</li>)}</ul>
            </div>}
        </div>
    );
}

const settings = definePluginSettings({
    structureTools: {
        type: OptionType.COMPONENT,
        component: () => <StructureTools />
    }
});

export default definePlugin({
    name: "CopyStructure",
    description: "Exporta e importa la estructura de roles, canales y permisos por rol entre servidores.",
    authors: [{ name: "Lotz", id: 835911720580284436n }],
    settings
});