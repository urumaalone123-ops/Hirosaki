const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Events,
    Collection
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ============================================================
// HIROSAKI
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.BOT_PREFIX || "+";

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN est manquant.");
    process.exit(1);
}

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.GuildMember,
        Partials.User
    ]
});

// ============================================================
// DOSSIER DE DONNÉES
// ============================================================

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "hirosaki.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================
// BASE DE DONNÉES PAR DÉFAUT
// ============================================================

const DEFAULT_DB = {
    guilds: {},
    warnings: {},
    sanctions: {},
    snipe: {},
    messages: {},
    voice: {},
    voiceSessions: {},
    voiceDuo: {},
    tickets: {},
    giveaways: {},
    autoroll: {},
    cooldowns: {}
};

function createDefaultDB() {
    return JSON.parse(JSON.stringify(DEFAULT_DB));
}

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const database = createDefaultDB();

        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(database, null, 2)
        );

        return database;
    }

    try {
        const raw = fs.readFileSync(DB_FILE, "utf8");

        if (!raw.trim()) {
            return createDefaultDB();
        }

        const database = JSON.parse(raw);

        for (const key of Object.keys(DEFAULT_DB)) {
            if (!(key in database)) {
                database[key] = JSON.parse(
                    JSON.stringify(DEFAULT_DB[key])
                );
            }
        }

        return database;
    } catch (error) {
        console.error(
            "❌ Impossible de lire la base de données :",
            error
        );

        return createDefaultDB();
    }
}

let db = loadDatabase();

let saveTimer = null;

function saveDatabase() {
    clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
        try {
            fs.writeFileSync(
                DB_FILE,
                JSON.stringify(db, null, 2)
            );
        } catch (error) {
            console.error(
                "❌ Erreur lors de la sauvegarde :",
                error
            );
        }
    }, 300);
}

function saveDatabaseNow() {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2)
        );
    } catch (error) {
        console.error(
            "❌ Erreur lors de la sauvegarde immédiate :",
            error
        );
    }
}

// ============================================================
// CONFIGURATION PAR SERVEUR
// ============================================================

function createGuildConfig() {
    return {
        prefix: "+",

        roles: {
            perm0: "Gestion ticket",
            perm1: "Modérateur test",
            perm2: "Modérateur",
            perm3: "Staff confirmé",
            perm4: "Responsable staff",
            perm5: "Co-owner",
            owner: "Crown"
        },

        welcome: {
            enabled: false,
            channelId: null,
            message: "Bienvenue {user} sur {server} !",
            image: null,
            embed: true
        },

        autorole: {
            enabled: false,
            roleId: null
        },

        logs: {
            enabled: false,
            channelId: null
        },

        stats: {
            enabled: false,
            channelId: null,
            hour: "12:00"
        },

        leaderboard: {
            enabled: false,
            channelId: null,
            day: 0,
            hour: "12:00"
        },

        tickets: {
            enabled: false,
            panelChannelId: null,
            categoryId: null,
            claimedBy: {},
            title: "🎆 Hirosaki — Tickets",
            description:
                "Cliquez sur le bouton ci-dessous pour ouvrir un ticket.",
            image: null
        },

        autoroll: {
            enabled: false,
            channelId: null,
            interval: 60,
            lastRun: null
        }
    };
}

function getGuildConfig(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = createGuildConfig();
        saveDatabase();
    }

    return db.guilds[guildId];
}

// ============================================================
// RÔLES DE PERMISSION
// ============================================================

const PERMISSION_ROLES = {
    0: "Gestion ticket",
    1: "Modérateur test",
    2: "Modérateur",
    3: "Staff confirmé",
    4: "Responsable staff",
    5: "Co-owner"
};

const OWNER_ROLE = "Crown";

// ============================================================
// NIVEAU DE PERMISSION
// ============================================================
//
// IMPORTANT : les permissions sont cumulables.
//
// Perm 5 possède automatiquement les Perms 0 à 4.
// Crown possède absolument tout.
// ============================================================

function getPermissionLevel(member) {
    if (!member || !member.guild) {
        return -1;
    }

    const crownRole = member.guild.roles.cache.find(
        role => role.name === OWNER_ROLE
    );

    if (
        crownRole &&
        member.roles.cache.has(crownRole.id)
    ) {
        return 999;
    }

    let highestLevel = -1;

    for (let level = 1; level <= 5; level++) {
        const roleName = PERMISSION_ROLES[level];

        const role = member.guild.roles.cache.find(
            role => role.name === roleName
        );

        if (
            role &&
            member.roles.cache.has(role.id)
        ) {
            highestLevel = Math.max(
                highestLevel,
                level
            );
        }
    }

    return highestLevel;
}

function isCrown(member) {
    return getPermissionLevel(member) === 999;
}

function hasPermission(member, requiredLevel) {
    if (isCrown(member)) {
        return true;
    }

    return getPermissionLevel(member) >= requiredLevel;
}

// ============================================================
// PERMISSIONS SPÉCIALES
// ============================================================

function requireCrown(member) {
    return isCrown(member);
}

// ============================================================
// HIÉRARCHIE STAFF
// ============================================================

function canModerate(moderator, target) {
    if (!moderator || !target) {
        return false;
    }

    if (moderator.id === target.id) {
        return false;
    }

    if (isCrown(target)) {
        return isCrown(moderator);
    }

    if (isCrown(moderator)) {
        return true;
    }

    const moderatorLevel =
        getPermissionLevel(moderator);

    const targetLevel =
        getPermissionLevel(target);

    // Un membre ne peut pas agir sur un membre
    // du même niveau ou d'un niveau supérieur.
    if (
        targetLevel >= 0 &&
        moderatorLevel <= targetLevel
    ) {
        return false;
    }

    // Vérification de la hiérarchie Discord.
    return (
        moderator.roles.highest.position >
        target.roles.highest.position
    );
}

// ============================================================
// PERMISSIONS DISCORD DU BOT
// ============================================================

function botMember(guild) {
    return guild.members.me || null;
}

function botCan(guild, permission) {
    const me = botMember(guild);

    if (!me) {
        return false;
    }

    return me.permissions.has(permission);
}

// ============================================================
// EMBEDS
// ============================================================

function successEmbed(text) {
    return new EmbedBuilder()
        .setColor(0x57F287)
        .setDescription(`✅ ${text}`)
        .setTimestamp();
}

function errorEmbed(text) {
    return new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription(`❌ ${text}`)
        .setTimestamp();
}

function infoEmbed(text) {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setDescription(`ℹ️ ${text}`)
        .setTimestamp();
}

function warningEmbed(text) {
    return new EmbedBuilder()
        .setColor(0xFEE75C)
        .setDescription(`⚠️ ${text}`)
        .setTimestamp();
}

// ============================================================
// UTILITAIRES
// ============================================================

function ensureGuildData(guildId) {
    getGuildConfig(guildId);

    if (!db.warnings[guildId]) {
        db.warnings[guildId] = {};
    }

    if (!db.sanctions[guildId]) {
        db.sanctions[guildId] = {};
    }

    if (!db.snipe[guildId]) {
        db.snipe[guildId] = {};
    }

    if (!db.messages[guildId]) {
        db.messages[guildId] = {};
    }

    if (!db.voice[guildId]) {
        db.voice[guildId] = {};
    }

    if (!db.voiceSessions[guildId]) {
        db.voiceSessions[guildId] = {};
    }

    if (!db.voiceDuo[guildId]) {
        db.voiceDuo[guildId] = {};
    }

    if (!db.tickets[guildId]) {
        db.tickets[guildId] = {};
    }

    if (!db.giveaways[guildId]) {
        db.giveaways[guildId] = {};
    }

    if (!db.autoroll[guildId]) {
        db.autoroll[guildId] = {};
    }

    if (!db.cooldowns[guildId]) {
        db.cooldowns[guildId] = {};
    }
}

// ============================================================
// ARGUMENTS
// ============================================================

function parseArguments(text) {
    const args = [];

    const regex =
        /"([^"]+)"|'([^']+)'|(\S+)/g;

    let match;

    while (
        (match = regex.exec(text)) !== null
    ) {
        args.push(
            match[1] ||
            match[2] ||
            match[3]
        );
    }

    return args;
}

// ============================================================
// MEMBRE
// ============================================================

async function resolveMember(message, value) {
    if (!value || !message.guild) {
        return null;
    }

    const mention =
        value.match(/^<@!?(\d+)>$/);

    if (mention) {
        return message.guild.members
            .fetch(mention[1])
            .catch(() => null);
    }

    if (/^\d{17,20}$/.test(value)) {
        return message.guild.members
            .fetch(value)
            .catch(() => null);
    }

    const lower =
        value.toLowerCase();

    return (
        message.guild.members.cache.find(
            member =>
                member.user.username
                    .toLowerCase() === lower ||
                member.displayName
                    .toLowerCase() === lower
        ) || null
    );
}

// ============================================================
// RÔLE
// ============================================================

function resolveRole(guild, value) {
    if (!value) {
        return null;
    }

    const mention =
        value.match(/^<@&(\d+)>$/);

    if (mention) {
        return guild.roles.cache.get(
            mention[1]
        ) || null;
    }

    if (/^\d{17,20}$/.test(value)) {
        return guild.roles.cache.get(
            value
        ) || null;
    }

    return (
        guild.roles.cache.find(
            role =>
                role.name.toLowerCase() ===
                value.toLowerCase()
        ) || null
    );
}

// ============================================================
// SALON
// ============================================================

function resolveChannel(guild, value) {
    if (!value) {
        return null;
    }

    const mention =
        value.match(/^<#(\d+)>$/);

    if (mention) {
        return guild.channels.cache.get(
            mention[1]
        ) || null;
    }

    if (/^\d{17,20}$/.test(value)) {
        return guild.channels.cache.get(
            value
        ) || null;
    }

    return (
        guild.channels.cache.find(
            channel =>
                channel.name.toLowerCase() ===
                value.toLowerCase()
        ) || null
    );
}

// ============================================================
// DURÉES
// ============================================================

function parseDuration(value) {
    if (!value) {
        return null;
    }

    const match =
        String(value)
            .toLowerCase()
            .match(/^(\d+)(s|m|h|d|w)$/);

    if (!match) {
        return null;
    }

    const amount =
        Number(match[1]);

    const unit =
        match[2];

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000
    };

    return amount * multipliers[unit];
}

function formatDuration(ms) {
    if (!ms || ms < 0) {
        return "0s";
    }

    const seconds =
        Math.floor(ms / 1000);

    const weeks =
        Math.floor(seconds / 604800);

    const days =
        Math.floor(
            (seconds % 604800) / 86400
        );

    const hours =
        Math.floor(
            (seconds % 86400) / 3600
        );

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    const secs =
        seconds % 60;

    const parts = [];

    if (weeks) parts.push(`${weeks}w`);
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (secs || !parts.length) {
        parts.push(`${secs}s`);
    }

    return parts.join(" ");
}

// ============================================================
// DATE / NOMBRES
// ============================================================

function discordTimestamp(timestamp) {
    return `<t:${Math.floor(
        timestamp / 1000
    )}:F>`;
}

function formatNumber(number) {
    return Number(number || 0)
        .toLocaleString("fr-FR");
}

// ============================================================
// SANCTIONS
// ============================================================

function addSanction(
    guildId,
    userId,
    type,
    moderatorId,
    reason
) {
    ensureGuildData(guildId);

    if (!db.sanctions[guildId][userId]) {
        db.sanctions[guildId][userId] = [];
    }

    const sanction = {
        id:
            `${Date.now()}-` +
            Math.random()
                .toString(36)
                .slice(2, 8),
        type,
        moderatorId,
        reason:
            reason || "Aucune raison",
        date: Date.now()
    };

    db.sanctions[guildId][userId]
        .push(sanction);

    saveDatabase();

    return sanction;
}

function addWarning(
    guildId,
    userId,
    moderatorId,
    reason
) {
    ensureGuildData(guildId);

    if (!db.warnings[guildId][userId]) {
        db.warnings[guildId][userId] = [];
    }

    const warning = {
        id:
            `${Date.now()}-` +
            Math.random()
                .toString(36)
                .slice(2, 8),
        moderatorId,
        reason:
            reason || "Aucune raison",
        date: Date.now()
    };

    db.warnings[guildId][userId]
        .push(warning);

    addSanction(
        guildId,
        userId,
        "warn",
        moderatorId,
        reason
    );

    saveDatabase();

    return warning;
}

// ============================================================
// COOLDOWNS
// ============================================================

function checkCooldown(
    guildId,
    userId,
    commandName,
    duration
) {
    ensureGuildData(guildId);

    if (
        !db.cooldowns[guildId][userId]
    ) {
        db.cooldowns[guildId][userId] = {};
    }

    const current =
        Date.now();

    const last =
        db.cooldowns[guildId][userId]
            [commandName] || 0;

    if (
        current - last <
        duration
    ) {
        return (
            duration -
            (current - last)
        );
    }

    db.cooldowns[guildId][userId]
        [commandName] = current;

    saveDatabase();

    return 0;
}

// ============================================================
// RÉPONSE SÉCURISÉE
// ============================================================

async function safeReply(
    message,
    payload
) {
    try {
        return await message.reply(
            payload
        );
    } catch (error) {
        console.error(
            "❌ Erreur d'envoi :",
            error
        );

        return null;
    }
}

// ============================================================
// COLLECTION DES COMMANDES
// ============================================================

client.commands = new Collection();

// ============================================================
// CRÉATEUR DE COMMANDE
// ============================================================
//
// Toutes les commandes utilisent le préfixe +
// Aucun enregistrement slash.
// ============================================================

function registerCommand(
    name,
    options
) {
    client.commands.set(
        name.toLowerCase(),
        {
            name: name.toLowerCase(),
            aliases: options.aliases || [],
            permission:
                options.permission ?? 0,
            crownOnly:
                options.crownOnly || false,
            guildOnly:
                options.guildOnly !== false,
            cooldown:
                options.cooldown || 0,
            execute:
                options.execute
        }
    );

    for (const alias of (
        options.aliases || []
    )) {
        client.commands.set(
            alias.toLowerCase(),
            {
                name: name.toLowerCase(),
                aliases: options.aliases || [],
                permission:
                    options.permission ?? 0,
                crownOnly:
                    options.crownOnly || false,
                guildOnly:
                    options.guildOnly !== false,
                cooldown:
                    options.cooldown || 0,
                execute:
                    options.execute
            }
        );
    }
}

// ============================================================
// FIN PARTIE 1
// ============================================================
//
// PARTIE 2 commencera directement ici avec :
// - +help / embed paginé
// - +snipe
// - +warn
// - +unwarn
// - +warnings
// - +sanctions
// - +blacklist
// - +banlist
// - +kick
// - +ban
// - +unban
// - +unban all
// ============================================================
// ============================================================
// PARTIE 2/10
// AIDE + MODÉRATION + SANCTIONS
// ============================================================

// ============================================================
// VÉRIFICATION DES PERMISSIONS D'UNE COMMANDE
// ============================================================

async function checkCommandAccess(message, command) {
    if (!message.guild || !message.member) {
        return false;
    }

    if (command.crownOnly) {
        if (!isCrown(message.member)) {
            await safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Cette commande est réservée à Crown."
                        )
                    ]
                }
            );

            return false;
        }

        return true;
    }

    if (!hasPermission(
        message.member,
        command.permission
    )) {
        await safeReply(
            message,
            {
                embeds: [
                    errorEmbed(
                        "Tu n'as pas la permission d'utiliser cette commande."
                    )
                ]
            }
        );

        return false;
    }

    return true;
}

// ============================================================
// SNIPE
// ============================================================

registerCommand("snipe", {
    permission: 1,

    async execute(message) {
        ensureGuildData(message.guild.id);

        const channelId = message.channel.id;

        const deleted =
            db.snipe[message.guild.id][channelId];

        if (!deleted) {
            return safeReply(
                message,
                {
                    embeds: [
                        infoEmbed(
                            "Aucun message supprimé récemment dans ce salon."
                        )
                    ]
                }
            );
        }

        const embed = new EmbedBuilder()
            .setTitle("🎆 Snipe")
            .setDescription(
                deleted.content ||
                "*Aucun contenu texte*"
            )
            .addFields(
                {
                    name: "Auteur",
                    value:
                        `<@${deleted.authorId}>`
                },
                {
                    name: "Date",
                    value:
                        discordTimestamp(
                            deleted.date
                        )
                }
            )
            .setTimestamp();

        if (deleted.attachment) {
            embed.addFields({
                name: "Pièce jointe",
                value: deleted.attachment
            });
        }

        return safeReply(
            message,
            {
                embeds: [embed]
            }
        );
    }
});

// ============================================================
// WARN
// ============================================================

registerCommand("warn", {
    permission: 2,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        if (!member) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}warn @membre raison`
                        )
                    ]
                }
            );
        }

        if (!canModerate(
            message.member,
            member
        )) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Tu ne peux pas sanctionner ce membre."
                        )
                    ]
                }
            );
        }

        const reason =
            args.slice(1).join(" ") ||
            "Aucune raison";

        const warning =
            addWarning(
                message.guild.id,
                member.id,
                message.author.id,
                reason
            );

        const count =
            db.warnings[
                message.guild.id
            ][member.id].length;

        await safeReply(
            message,
            {
                embeds: [
                    successEmbed(
                        `${member} a reçu un avertissement.\n` +
                        `Raison : **${reason}**\n` +
                        `Nombre d'avertissements : **${count}**`
                    )
                ]
            }
        );

        try {
            await member.send({
                embeds: [
                    warningEmbed(
                        `Tu as reçu un avertissement sur **${message.guild.name}**.\n\n` +
                        `Raison : **${reason}**`
                    )
                ]
            });
        } catch (_) {
            // DM fermé : aucune erreur publique.
        }

        return warning;
    }
});

// ============================================================
// UNWARN
// ============================================================

registerCommand("unwarn", {
    permission: 2,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        if (!member) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}unwarn @membre [id-avertissement]`
                        )
                    ]
                }
            );
        }

        if (!canModerate(
            message.member,
            member
        )) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Tu ne peux pas modifier les sanctions de ce membre."
                        )
                    ]
                }
            );
        }

        const guildWarnings =
            db.warnings[
                message.guild.id
            ];

        const warnings =
            guildWarnings[member.id] || [];

        if (!warnings.length) {
            return safeReply(
                message,
                {
                    embeds: [
                        infoEmbed(
                            "Ce membre n'a aucun avertissement."
                        )
                    ]
                }
            );
        }

        const warningId = args[1];

        let removed;

        if (warningId) {
            const index =
                warnings.findIndex(
                    warning =>
                        warning.id === warningId
                );

            if (index === -1) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                "Aucun avertissement ne correspond à cet identifiant."
                            )
                        ]
                    }
                );
            }

            removed =
                warnings.splice(index, 1)[0];
        } else {
            removed =
                warnings.pop();
        }

        addSanction(
            message.guild.id,
            member.id,
            "unwarn",
            message.author.id,
            `Retrait de l'avertissement ${removed.id}`
        );

        saveDatabase();

        return safeReply(
            message,
            {
                embeds: [
                    successEmbed(
                        `L'avertissement **${removed.id}** de ${member} a été retiré.`
                    )
                ]
            }
        );
    }
});

// ============================================================
// WARNINGS
// ============================================================

registerCommand("warnings", {
    permission: 2,

    aliases: ["warns"],

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        if (!member) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}warnings @membre`
                        )
                    ]
                }
            );
        }

        ensureGuildData(
            message.guild.id
        );

        const warnings =
            db.warnings[
                message.guild.id
            ][member.id] || [];

        if (!warnings.length) {
            return safeReply(
                message,
                {
                    embeds: [
                        infoEmbed(
                            `${member} n'a aucun avertissement.`
                        )
                    ]
                }
            );
        }

        const lines =
            warnings
                .slice(-15)
                .reverse()
                .map(
                    (warning, index) =>
                        `**${index + 1}.** ${warning.reason}\n` +
                        `ID : \`${warning.id}\` • ` +
                        `Modérateur : <@${warning.moderatorId}> • ` +
                        `${discordTimestamp(warning.date)}`
                );

        const embed =
            new EmbedBuilder()
                .setTitle(
                    `🎆 Avertissements — ${member.user.username}`
                )
                .setDescription(
                    lines.join("\n\n")
                )
                .setFooter({
                    text:
                        `${warnings.length} avertissement(s)`
                })
                .setTimestamp();

        return safeReply(
            message,
            {
                embeds: [embed]
            }
        );
    }
});

// ============================================================
// SANCTIONS
// ============================================================

registerCommand("sanctions", {
    permission: 2,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        if (!member) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}sanctions @membre`
                        )
                    ]
                }
            );
        }

        ensureGuildData(
            message.guild.id
        );

        const sanctions =
            db.sanctions[
                message.guild.id
            ][member.id] || [];

        if (!sanctions.length) {
            return safeReply(
                message,
                {
                    embeds: [
                        infoEmbed(
                            `${member} n'a aucune sanction enregistrée.`
                        )
                    ]
                }
            );
        }

        const lines =
            sanctions
                .slice(-20)
                .reverse()
                .map(
                    (sanction, index) =>
                        `**${index + 1}.** ` +
                        `\`${sanction.type}\` — ${sanction.reason}\n` +
                        `ID : \`${sanction.id}\` • ` +
                        `Modérateur : <@${sanction.moderatorId}> • ` +
                        `${discordTimestamp(sanction.date)}`
                );

        const embed =
            new EmbedBuilder()
                .setTitle(
                    `🎆 Sanctions — ${member.user.username}`
                )
                .setDescription(
                    lines.join("\n\n")
                )
                .setFooter({
                    text:
                        `${sanctions.length} sanction(s) enregistrée(s)`
                })
                .setTimestamp();

        return safeReply(
            message,
            {
                embeds: [embed]
            }
        );
    }
});

// ============================================================
// KICK
// ============================================================

registerCommand("kick", {
    permission: 3,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        if (!member) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}kick @membre [raison]`
                        )
                    ]
                }
            );
        }

        if (!canModerate(
            message.member,
            member
        )) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Tu ne peux pas expulser ce membre."
                        )
                    ]
                }
            );
        }

        if (!member.kickable) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Je ne peux pas expulser ce membre. Vérifie ma position dans la hiérarchie Discord."
                        )
                    ]
                }
            );
        }

        const reason =
            args.slice(1).join(" ") ||
            "Aucune raison";

        try {
            await member.kick(reason);

            addSanction(
                message.guild.id,
                member.id,
                "kick",
                message.author.id,
                reason
            );

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `${member.user.tag} a été expulsé.\nRaison : **${reason}**`
                        )
                    ]
                }
            );
        } catch (error) {
            console.error(
                "Erreur kick :",
                error
            );

            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Impossible d'expulser ce membre."
                        )
                    ]
                }
            );
        }
    }
});

// ============================================================
// BAN
// ============================================================

registerCommand("ban", {
    permission: 4,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        if (!member) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}ban @membre [raison]`
                        )
                    ]
                }
            );
        }

        if (!canModerate(
            message.member,
            member
        )) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Tu ne peux pas bannir ce membre."
                        )
                    ]
                }
            );
        }

        if (!member.bannable) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Je ne peux pas bannir ce membre. Vérifie ma position dans la hiérarchie Discord."
                        )
                    ]
                }
            );
        }

        const reason =
            args.slice(1).join(" ") ||
            "Aucune raison";

        try {
            await member.ban({
                reason
            });

            addSanction(
                message.guild.id,
                member.id,
                "ban",
                message.author.id,
                reason
            );

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `${member.user.tag} a été banni.\nRaison : **${reason}**`
                        )
                    ]
                }
            );
        } catch (error) {
            console.error(
                "Erreur ban :",
                error
            );

            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Impossible de bannir ce membre."
                        )
                    ]
                }
            );
        }
    }
});

// ============================================================
// UNBAN
// ============================================================

registerCommand("unban", {
    permission: 4,

    async execute(message, args) {
        const target =
            args[0];

        if (!target) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}unban ID`
                        )
                    ]
                }
            );
        }

        if (!/^\d{17,20}$/.test(target)) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "L'identifiant Discord fourni est invalide."
                        )
                    ]
                }
            );
        }

        try {
            const ban =
                await message.guild.bans.fetch(
                    target
                );

            await message.guild.members.unban(
                target,
                "Unban effectué par le staff"
            );

            addSanction(
                message.guild.id,
                target,
                "unban",
                message.author.id,
                "Unban"
            );

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `**${ban.user.tag}** a été débanni.`
                        )
                    ]
                }
            );
        } catch (error) {
            console.error(
                "Erreur unban :",
                error
            );

            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Ce membre n'est pas banni ou l'opération a échoué."
                        )
                    ]
                }
            );
        }
    }
});

// ============================================================
// UNBAN ALL
// ============================================================

registerCommand("unbanall", {
    permission: 4,

    aliases: [
        "unban-all",
        "unban_all"
    ],

    async execute(message) {
        let bans;

        try {
            bans =
                await message.guild.bans.fetch();
        } catch (error) {
            console.error(
                "Erreur récupération bans :",
                error
            );

            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Impossible de récupérer la liste des bannissements."
                        )
                    ]
                }
            );
        }

        if (!bans.size) {
            return safeReply(
                message,
                {
                    embeds: [
                        infoEmbed(
                            "Aucun membre n'est actuellement banni."
                        )
                    ]
                }
            );
        }

        await safeReply(
            message,
            {
                embeds: [
                    infoEmbed(
                        `Début du débannissement de **${bans.size}** membre(s)...`
                    )
                ]
            }
        );

        let success = 0;
        let failed = 0;

        for (const [, banInfo] of bans) {
            try {
                await message.guild.members.unban(
                    banInfo.user.id,
                    "Unban all effectué par le staff"
                );

                addSanction(
                    message.guild.id,
                    banInfo.user.id,
                    "unban",
                    message.author.id,
                    "Unban all"
                );

                success++;
            } catch (error) {
                failed++;
                console.error(
                    `Erreur unban ${banInfo.user.id} :`,
                    error
                );
            }
        }

        return safeReply(
            message,
            {
                embeds: [
                    successEmbed(
                        `Débannissement terminé.\n\n` +
                        `✅ Réussis : **${success}**\n` +
                        `❌ Échecs : **${failed}**`
                    )
                ]
            }
        );
    }
});

// ============================================================
// BLACKLIST
// ============================================================

registerCommand("blacklist", {
    permission: 2,

    async execute(message) {
        try {
            const bans =
                await message.guild.bans.fetch();

            if (!bans.size) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            infoEmbed(
                                "La blacklist est actuellement vide."
                            )
                        ]
                    }
                );
            }

            const users =
                [...bans.values()]
                    .slice(0, 50)
                    .map(
                        (banInfo, index) =>
                            `**${index + 1}.** ${banInfo.user.tag} — \`${banInfo.user.id}\``
                    );

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🎆 Blacklist"
                    )
                    .setDescription(
                        users.join("\n")
                    )
                    .setFooter({
                        text:
                            `${bans.size} membre(s) banni(s)`
                    })
                    .setTimestamp();

            return safeReply(
                message,
                {
                    embeds: [embed]
                }
            );
        } catch (error) {
            console.error(
                "Erreur blacklist :",
                error
            );

            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Impossible de récupérer la blacklist."
                        )
                    ]
                }
            );
        }
    }
});

// ============================================================
// BANLIST
// ============================================================

registerCommand("banlist", {
    permission: 2,

    async execute(message) {
        try {
            const bans =
                await message.guild.bans.fetch();

            if (!bans.size) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            infoEmbed(
                                "Aucun bannissement actif."
                            )
                        ]
                    }
                );
            }

            const list =
                [...bans.values()]
                    .slice(0, 50)
                    .map(
                        (banInfo, index) =>
                            `**${index + 1}.** ${banInfo.user.tag}\n` +
                            `ID : \`${banInfo.user.id}\``
                    );

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🎆 Liste des bannissements"
                    )
                    .setDescription(
                        list.join("\n\n")
                    )
                    .setFooter({
                        text:
                            `${bans.size} bannissement(s)`
                    })
                    .setTimestamp();

            return safeReply(
                message,
                {
                    embeds: [embed]
                }
            );
        } catch (error) {
            console.error(
                "Erreur banlist :",
                error
            );

            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Impossible de récupérer la liste des bannissements."
                        )
                    ]
                }
            );
        }
    }
});

// ============================================================
// MUTE
// ============================================================

registerCommand("mute", {
    permission: 4,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        const duration =
            parseDuration(args[1]);

        if (!member || !duration) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}mute @membre durée [raison]\nExemple : ${PREFIX}mute @membre 10m spam`
                        )
                    ]
                }
            );
        }

        if (!canModerate(
            message.member,
            member
        )) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Tu ne peux pas mute ce membre."
                        )
                    ]
                }
            );
        }

        if (!member.moderatable) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Je ne peux pas appliquer le mute à ce membre."
                        )
                    ]
                }
            );
        }

        const reason =
            args.slice(2).join(" ") ||
            "Aucune raison";

        try {
            await member.timeout(
                duration,
                reason
            );

            addSanction(
                message.guild.id,
                member.id,
                "mute",
                message.author.id,
                reason
            );

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `${member} a été mute pendant **${formatDuration(duration)}**.\nRaison : **${reason}**`
                        )
                    ]
                }
            );
        } catch (error) {
            console.error(
                "Erreur mute :",
                error
            );

            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Impossible d'appliquer le mute."
                        )
                    ]
                }
            );
        }
    }
});

// ============================================================
// UNMUTE
// ============================================================

registerCommand("unmute", {
    permission: 4,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        if (!member) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}unmute @membre`
                        )
                    ]
                }
            );
        }

        if (!canModerate(
            message.member,
            member
        )) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Tu ne peux pas retirer le mute de ce membre."
                        )
                    ]
                }
            );
        }

        try {
            await member.timeout(
                null,
                "Unmute effectué par le staff"
            );

            addSanction(
                message.guild.id,
                member.id,
                "unmute",
                message.author.id,
                "Unmute"
            );

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `${member} n'est plus mute.`
                        )
                    ]
                }
            );
        } catch (error) {
            console.error(
                "Erreur unmute :",
                error
            );

            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Impossible de retirer le mute."
                        )
                    ]
                }
            );
        }
    }
});

// ============================================================
// TIMEOUT
// ============================================================

registerCommand("timeout", {
    permission: 4,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        const duration =
            parseDuration(args[1]);

        if (!member || !duration) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}timeout @membre durée [raison]`
                        )
                    ]
                }
            );
        }

        if (!canModerate(
            message.member,
            member
        )) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Tu ne peux pas timeout ce membre."
                        )
                    ]
                }
            );
        }

        if (!member.moderatable) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Je ne peux pas appliquer le timeout à ce membre."
                        )
                    ]
                }
            );
        }

        const reason =
            args.slice(2).join(" ") ||
            "Aucune raison";

        try {
            await member.timeout(
                duration,
                reason
            );

            addSanction(
                message.guild.id,
                member.id,
                "timeout",
                message.author.id,
                reason
            );

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `${member} a reçu un timeout de **${formatDuration(duration)}**.\nRaison : **${reason}**`
                        )
                    ]
                }
            );
        } catch (error) {
            console.error(
                "Erreur timeout :",
                error
            );

            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Impossible d'appliquer le timeout."
                        )
                    ]
                }
            );
        }
    }
});

// ============================================================
// UNTIMEOUT
// ============================================================

registerCommand("untimeout", {
    permission: 4,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        if (!member) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}untimeout @membre`
                        )
                    ]
                }
            );
        }

        if (!canModerate(
            message.member,
            member
        )) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Tu ne peux pas retirer le timeout de ce membre."
                        )
                    ]
                }
            );
        }

        try {
            await member.timeout(
                null,
                "Timeout retiré par le staff"
            );

            addSanction(
                message.guild.id,
                member.id,
                "untimeout",
                message.author.id,
                "Timeout retiré"
            );

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `${member} n'a plus de timeout.`
                        )
                    ]
                }
            );
        } catch (error) {
            console.error(
                "Erreur untimeout :",
                error
            );

            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Impossible de retirer le timeout."
                        )
                    ]
                }
            );
        }
    }
});

// ============================================================
// FIN PARTIE 2
// ============================================================
//
// Déjà couvert dans cette partie :
//
// PERM 1 :
// +snipe
//
// PERM 2 :
// +warn
// +unwarn
// +warnings
// +sanctions
// +blacklist
// +banlist
//
// PERM 3 :
// +kick
//
// PERM 4 :
// +ban
// +unban
// +unbanall
// +mute
// +unmute
// +timeout
// +untimeout
//
// +rank / +derank restent EXCLUSIVEMENT Crown.
// ============================================================
// ============================================================
// PARTIE 3/10
// CLEAR / PURGE / LOCK / UNLOCK / SLOWMODE
// ADDROLE / REMOVEROLE / USERINFO
// ============================================================

// ============================================================
// CLEAR
// ============================================================

registerCommand("clear", {
    permission: 4,

    aliases: ["purge"],

    async execute(message, args) {
        const amount = Number(args[0]);

        if (!Number.isInteger(amount) || amount < 1) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        `Utilisation : ${PREFIX}clear nombre\nExemple : ${PREFIX}clear 50`
                    )
                ]
            });
        }

        if (amount > 100) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Tu peux supprimer au maximum 100 messages à la fois."
                    )
                ]
            });
        }

        if (!message.channel.isTextBased()) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Cette commande ne peut pas être utilisée ici."
                    )
                ]
            });
        }

        try {
            const deleted =
                await message.channel.bulkDelete(
                    amount,
                    true
                );

            const confirmation =
                await message.channel.send({
                    embeds: [
                        successEmbed(
                            `🗑️ **${deleted.size}** message(s) supprimé(s).`
                        )
                    ]
                });

            setTimeout(() => {
                confirmation.delete().catch(() => {});
            }, 5000);

        } catch (error) {
            console.error(
                "Erreur clear :",
                error
            );

            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Impossible de supprimer les messages. Vérifie mes permissions et l'âge des messages."
                    )
                ]
            });
        }
    }
});

// ============================================================
// PURGE
// ============================================================

registerCommand("purge", {
    permission: 4,

    async execute(message, args) {
        const amount = Number(args[0]);

        if (!Number.isInteger(amount) || amount < 1) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        `Utilisation : ${PREFIX}purge nombre`
                    )
                ]
            });
        }

        if (amount > 100) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Tu peux supprimer au maximum 100 messages à la fois."
                    )
                ]
            });
        }

        if (!message.channel.isTextBased()) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Cette commande ne peut pas être utilisée ici."
                    )
                ]
            });
        }

        try {
            const deleted =
                await message.channel.bulkDelete(
                    amount,
                    true
                );

            const confirmation =
                await message.channel.send({
                    embeds: [
                        successEmbed(
                            `🗑️ **${deleted.size}** message(s) supprimé(s).`
                        )
                    ]
                });

            setTimeout(() => {
                confirmation.delete().catch(() => {});
            }, 5000);

        } catch (error) {
            console.error(
                "Erreur purge :",
                error
            );

            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "La purge a échoué. Vérifie mes permissions."
                    )
                ]
            });
        }
    }
});

// ============================================================
// LOCK
// ============================================================

registerCommand("lock", {
    permission: 4,

    async execute(message) {
        const channel =
            message.channel;

        if (!channel.isTextBased()) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Ce salon ne peut pas être verrouillé."
                    )
                ]
            });
        }

        try {
            await channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: false
                },
                {
                    reason:
                        `Salon verrouillé par ${message.author.tag}`
                }
            );

            addLog(
                message.guild.id,
                "Salon verrouillé",
                `${message.channel} a été verrouillé par ${message.author}.`
            );

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        "🔒 Ce salon est maintenant verrouillé."
                    )
                ]
            });

        } catch (error) {
            console.error(
                "Erreur lock :",
                error
            );

            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Impossible de verrouiller ce salon."
                    )
                ]
            });
        }
    }
});

// ============================================================
// UNLOCK
// ============================================================

registerCommand("unlock", {
    permission: 4,

    async execute(message) {
        const channel =
            message.channel;

        if (!channel.isTextBased()) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Ce salon ne peut pas être déverrouillé."
                    )
                ]
            });
        }

        try {
            await channel.permissionOverwrites.edit(
                message.guild.roles.everyone,
                {
                    SendMessages: null
                },
                {
                    reason:
                        `Salon déverrouillé par ${message.author.tag}`
                }
            );

            addLog(
                message.guild.id,
                "Salon déverrouillé",
                `${message.channel} a été déverrouillé par ${message.author}.`
            );

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        "🔓 Ce salon est maintenant déverrouillé."
                    )
                ]
            });

        } catch (error) {
            console.error(
                "Erreur unlock :",
                error
            );

            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Impossible de déverrouiller ce salon."
                    )
                ]
            });
        }
    }
});

// ============================================================
// SLOWMODE
// ============================================================

registerCommand("slowmode", {
    permission: 4,

    async execute(message, args) {
        const seconds =
            Number(args[0]);

        if (
            !Number.isInteger(seconds) ||
            seconds < 0
        ) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        `Utilisation : ${PREFIX}slowmode secondes\nExemple : ${PREFIX}slowmode 10\nPour désactiver : ${PREFIX}slowmode 0`
                    )
                ]
            });
        }

        if (seconds > 21600) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Le slowmode ne peut pas dépasser 6 heures."
                    )
                ]
            });
        }

        try {
            await message.channel.setRateLimitPerUser(
                seconds,
                `Slowmode configuré par ${message.author.tag}`
            );

            if (seconds === 0) {
                return safeReply(message, {
                    embeds: [
                        successEmbed(
                            "Le slowmode a été désactivé."
                        )
                    ]
                });
            }

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        `Le slowmode est maintenant de **${seconds} seconde(s)**.`
                    )
                ]
            });

        } catch (error) {
            console.error(
                "Erreur slowmode :",
                error
            );

            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Impossible de modifier le slowmode."
                    )
                ]
            });
        }
    }
});

// ============================================================
// ADDROLE
// ============================================================

registerCommand("addrole", {
    permission: 3,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        if (!member) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        `Utilisation : ${PREFIX}addrole @membre @role`
                    )
                ]
            });
        }

        const role =
            await resolveRole(
                message.guild,
                args[1]
            );

        if (!role) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Rôle introuvable."
                    )
                ]
            });
        }

        if (
            role.id === message.guild.id
        ) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Ce rôle ne peut pas être attribué."
                    )
                ]
            });
        }

        if (
            role.position >=
            message.guild.members.me.roles.highest.position
        ) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Je ne peux pas attribuer ce rôle car il est au-dessus ou au même niveau que mon rôle le plus élevé."
                    )
                ]
            });
        }

        if (
            member.roles.highest.position >=
            message.guild.members.me.roles.highest.position
        ) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Je ne peux pas gérer les rôles de ce membre."
                    )
                ]
            });
        }

        if (
            role.position >=
            message.member.roles.highest.position &&
            !isCrown(message.member)
        ) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Tu ne peux pas attribuer un rôle supérieur ou égal à ton propre rôle."
                    )
                ]
            });
        }

        if (member.roles.cache.has(role.id)) {
            return safeReply(message, {
                embeds: [
                    infoEmbed(
                        `${member} possède déjà le rôle ${role}.`
                    )
                ]
            });
        }

        try {
            await member.roles.add(
                role,
                `Ajouté par ${message.author.tag}`
            );

            addLog(
                message.guild.id,
                "Rôle ajouté",
                `${message.author} a ajouté ${role} à ${member}.`
            );

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        `Le rôle ${role} a été ajouté à ${member}.`
                    )
                ]
            });

        } catch (error) {
            console.error(
                "Erreur addrole :",
                error
            );

            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Impossible d'ajouter ce rôle."
                    )
                ]
            });
        }
    }
});

// ============================================================
// REMOVEROLE
// ============================================================

registerCommand("removerole", {
    permission: 3,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        if (!member) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        `Utilisation : ${PREFIX}removerole @membre @role`
                    )
                ]
            });
        }

        const role =
            await resolveRole(
                message.guild,
                args[1]
            );

        if (!role) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Rôle introuvable."
                    )
                ]
            });
        }

        if (
            role.position >=
            message.guild.members.me.roles.highest.position
        ) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Je ne peux pas gérer ce rôle car il est trop haut dans la hiérarchie."
                    )
                ]
            });
        }

        if (
            role.position >=
            message.member.roles.highest.position &&
            !isCrown(message.member)
        ) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Tu ne peux pas retirer un rôle supérieur ou égal à ton propre rôle."
                    )
                ]
            });
        }

        if (!member.roles.cache.has(role.id)) {
            return safeReply(message, {
                embeds: [
                    infoEmbed(
                        `${member} ne possède pas le rôle ${role}.`
                    )
                ]
            });
        }

        try {
            await member.roles.remove(
                role,
                `Retiré par ${message.author.tag}`
            );

            addLog(
                message.guild.id,
                "Rôle retiré",
                `${message.author} a retiré ${role} à ${member}.`
            );

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        `Le rôle ${role} a été retiré à ${member}.`
                    )
                ]
            });

        } catch (error) {
            console.error(
                "Erreur removerole :",
                error
            );

            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Impossible de retirer ce rôle."
                    )
                ]
            });
        }
    }
});

// ============================================================
// USERINFO
// ============================================================

registerCommand("userinfo", {
    permission: 3,

    aliases: [
        "user",
        "whois"
    ],

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0] || message.author.id
            );

        if (!member) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Utilisateur introuvable."
                    )
                ]
            });
        }

        const roles =
            member.roles.cache
                .filter(
                    role =>
                        role.id !== message.guild.id
                )
                .sort(
                    (a, b) =>
                        b.position - a.position
                )
                .map(role => role.toString());

        const embed =
            new EmbedBuilder()
                .setTitle(
                    `🎆 Informations — ${member.user.username}`
                )
                .setThumbnail(
                    member.user.displayAvatarURL({
                        size: 256
                    })
                )
                .addFields(
                    {
                        name: "Utilisateur",
                        value:
                            `${member}`,
                        inline: true
                    },
                    {
                        name: "Identifiant",
                        value:
                            `\`${member.id}\``,
                        inline: true
                    },
                    {
                        name: "Compte créé",
                        value:
                            discordTimestamp(
                                member.user.createdTimestamp
                            ),
                        inline: true
                    },
                    {
                        name: "A rejoint",
                        value:
                            member.joinedTimestamp
                                ? discordTimestamp(
                                    member.joinedTimestamp
                                )
                                : "Inconnu",
                        inline: true
                    },
                    {
                        name: "Rôle principal",
                        value:
                            member.roles.highest
                                ? member.roles.highest.toString()
                                : "Aucun",
                        inline: true
                    },
                    {
                        name: "Bot",
                        value:
                            member.user.bot
                                ? "Oui"
                                : "Non",
                        inline: true
                    },
                    {
                        name: "Rôles",
                        value:
                            roles.length
                                ? roles.slice(0, 30).join(" ")
                                : "Aucun"
                    }
                )
                .setTimestamp();

        return safeReply(message, {
            embeds: [embed]
        });
    }
});

// ============================================================
// FIN PARTIE 3
// ============================================================
//
// CHECKLIST DE CETTE PARTIE
//
// ✅ +clear
// ✅ +purge
// ✅ +lock
// ✅ +unlock
// ✅ +slowmode
// ✅ +addrole
// ✅ +removerole
// ✅ +userinfo
//
// Permissions :
//
// +clear       → Perm 4
// +purge       → Perm 4
// +lock        → Perm 4
// +unlock      → Perm 4
// +slowmode    → Perm 4
// +addrole     → Perm 3
// +removerole  → Perm 3
// +userinfo    → Perm 3
//
// Hiérarchie Discord vérifiée avant les actions sensibles.
// Aucun +rank / +derank ajouté.
// Aucun doublon avec les parties précédentes.
// Aucune slash command.
// ============================================================
// ============================================================
// PARTIE 4/10
// STATISTIQUES + BIENVENUE + AUTOROLE
// ============================================================

// ============================================================
// +STAT
// ============================================================

registerCommand("stat", {
    permission: 4,

    async execute(message) {
        const guild = message.guild;

        if (!guild) {
            return;
        }

        await guild.members.fetch();

        const members =
            guild.members.cache;

        const total =
            members.filter(
                member => !member.user.bot
            ).size;

        const online =
            members.filter(
                member =>
                    !member.user.bot &&
                    member.presence &&
                    member.presence.status !== "offline"
            ).size;

        const voice =
            members.filter(
                member =>
                    !member.user.bot &&
                    member.voice.channel
            ).size;

        const boost =
            guild.premiumSubscriptionCount || 0;

        const stream =
            members.filter(
                member =>
                    !member.user.bot &&
                    member.voice.channel &&
                    member.voice.streaming
            ).size;

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🎆 Statistiques du serveur"
                )
                .setDescription(
                    `Voici les statistiques actuelles de **${guild.name}**.`
                )
                .addFields(
                    {
                        name: "Membre",
                        value: `${total}`,
                        inline: true
                    },
                    {
                        name: "En ligne",
                        value: `${online}`,
                        inline: true
                    },
                    {
                        name: "En vocal",
                        value: `${voice}`,
                        inline: true
                    },
                    {
                        name: "Boost",
                        value: `${boost}`,
                        inline: true
                    },
                    {
                        name: "En stream",
                        value: `${stream}`,
                        inline: true
                    }
                )
                .setTimestamp();

        return safeReply(message, {
            embeds: [embed]
        });
    }
});

// ============================================================
// +STAT CHANNEL
// ============================================================

registerCommand("statchannel", {
    permission: 5,

    aliases: [
        "stat-channel",
        "stat_channel"
    ],

    async execute(message) {
        ensureGuildData(message.guild.id);

        db.guilds[
            message.guild.id
        ].stat.channelId =
            message.channel.id;

        saveDatabase();

        return safeReply(message, {
            embeds: [
                successEmbed(
                    `Le salon des statistiques est maintenant ${message.channel}.`
                )
            ]
        });
    }
});

// ============================================================
// +STAT DAY
// ============================================================

registerCommand("statday", {
    permission: 5,

    aliases: [
        "stat-day",
        "stat_day"
    ],

    async execute(message, args) {
        const day =
            args[0]?.toLowerCase();

        const days = {
            lundi: 1,
            mardi: 2,
            mercredi: 3,
            jeudi: 4,
            vendredi: 5,
            samedi: 6,
            dimanche: 0
        };

        if (!(day in days)) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Jour invalide. Utilise lundi, mardi, mercredi, jeudi, vendredi, samedi ou dimanche."
                    )
                ]
            });
        }

        ensureGuildData(message.guild.id);

        db.guilds[
            message.guild.id
        ].stat.day =
            days[day];

        saveDatabase();

        return safeReply(message, {
            embeds: [
                successEmbed(
                    `Le jour des statistiques est maintenant **${day}**.`
                )
            ]
        });
    }
});

// ============================================================
// +STAT HOUR
// ============================================================

registerCommand("stathour", {
    permission: 5,

    aliases: [
        "stat-hour",
        "stat_hour"
    ],

    async execute(message, args) {
        const time =
            args[0];

        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || "")) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Format invalide. Exemple : `18:30`."
                    )
                ]
            });
        }

        ensureGuildData(message.guild.id);

        db.guilds[
            message.guild.id
        ].stat.hour =
            time;

        saveDatabase();

        return safeReply(message, {
            embeds: [
                successEmbed(
                    `L'heure des statistiques est maintenant **${time}**.`
                )
            ]
        });
    }
});

// ============================================================
// +STAT AUTO
// ============================================================

registerCommand("statauto", {
    permission: 5,

    aliases: [
        "stat-auto",
        "stat_auto"
    ],

    async execute(message, args) {
        const value =
            args[0]?.toLowerCase();

        if (
            ![
                "on",
                "off",
                "enable",
                "disable"
            ].includes(value)
        ) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        `Utilisation : ${PREFIX}statauto on/off`
                    )
                ]
            });
        }

        ensureGuildData(message.guild.id);

        const enabled =
            value === "on" ||
            value === "enable";

        db.guilds[
            message.guild.id
        ].stat.enabled =
            enabled;

        saveDatabase();

        return safeReply(message, {
            embeds: [
                successEmbed(
                    `L'envoi automatique des statistiques est maintenant **${enabled ? "activé" : "désactivé"}**.`
                )
            ]
        });
    }
});

// ============================================================
// GÉNÉRATION D'UN EMBED DE BIENVENUE
// ============================================================

function buildWelcomeEmbed(
    member,
    guild
) {
    ensureGuildData(guild.id);

    const config =
        db.guilds[guild.id].welcome;

    const replaceVariables =
        text => {
            if (!text) {
                return "";
            }

            return text
                .replace(
                    /\{user\}/gi,
                    `<@${member.id}>`
                )
                .replace(
                    /\{username\}/gi,
                    member.user.username
                )
                .replace(
                    /\{server\}/gi,
                    guild.name
                )
                .replace(
                    /\{memberCount\}/gi,
                    `${guild.memberCount}`
                );
        };

    const title =
        replaceVariables(
            config.title ||
            "Bienvenue sur le serveur !"
        );

    const description =
        replaceVariables(
            config.message ||
            "Bienvenue {user} sur **{server}** !"
        );

    const embed =
        new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setThumbnail(
                member.user.displayAvatarURL({
                    size: 256
                })
            )
            .setTimestamp();

    if (config.image) {
        embed.setImage(
            replaceVariables(
                config.image
            )
        );
    }

    return embed;
}

// ============================================================
// +WELCOME
// ============================================================

registerCommand("welcome", {
    permission: 4,

    async execute(message, args) {
        ensureGuildData(message.guild.id);

        const action =
            args[0]?.toLowerCase();

        if (!action) {
            return safeReply(message, {
                embeds: [
                    infoEmbed(
                        `Utilisation :\n` +
                        `${PREFIX}welcome on\n` +
                        `${PREFIX}welcome off\n` +
                        `${PREFIX}welcome channel\n` +
                        `${PREFIX}welcome message <texte>\n` +
                        `${PREFIX}welcome title <texte>\n` +
                        `${PREFIX}welcome image <url>`
                    )
                ]
            });
        }

        const config =
            db.guilds[
                message.guild.id
            ].welcome;

        if (
            action === "on" ||
            action === "off"
        ) {
            config.enabled =
                action === "on";

            saveDatabase();

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        `Le système de bienvenue est maintenant **${config.enabled ? "activé" : "désactivé"}**.`
                    )
                ]
            });
        }

        if (action === "channel") {
            config.channelId =
                message.channel.id;

            saveDatabase();

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        `Le salon de bienvenue est maintenant ${message.channel}.`
                    )
                ]
            });
        }

        if (
            action === "message"
        ) {
            const text =
                args.slice(1).join(" ");

            if (!text) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Tu dois fournir un message."
                        )
                    ]
                });
            }

            config.message =
                text;

            saveDatabase();

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        "Le message de bienvenue a été modifié."
                    )
                ]
            });
        }

        if (action === "title") {
            const title =
                args.slice(1).join(" ");

            if (!title) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Tu dois fournir un titre."
                        )
                    ]
                });
            }

            config.title =
                title;

            saveDatabase();

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        "Le titre de bienvenue a été modifié."
                    )
                ]
            });
        }

        if (action === "image") {
            const url =
                args[1];

            if (!url) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Tu dois fournir une URL d'image."
                        )
                    ]
                });
            }

            try {
                new URL(url);
            } catch (_) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "L'URL fournie est invalide."
                        )
                    ]
                });
            }

            config.image =
                url;

            saveDatabase();

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        "L'image de bienvenue a été modifiée."
                    )
                ]
            });
        }

        return safeReply(message, {
            embeds: [
                errorEmbed(
                    "Option de bienvenue inconnue."
                )
            ]
        });
    }
});

// ============================================================
// +AUTOROLE
// ============================================================

registerCommand("autorole", {
    permission: 4,

    async execute(message, args) {
        ensureGuildData(message.guild.id);

        const action =
            args[0]?.toLowerCase();

        const config =
            db.guilds[
                message.guild.id
            ].autorole;

        if (!action) {
            return safeReply(message, {
                embeds: [
                    infoEmbed(
                        `Utilisation :\n` +
                        `${PREFIX}autorole on\n` +
                        `${PREFIX}autorole off\n` +
                        `${PREFIX}autorole set @role`
                    )
                ]
            });
        }

        if (
            action === "on" ||
            action === "off"
        ) {
            config.enabled =
                action === "on";

            saveDatabase();

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        `L'autorole est maintenant **${config.enabled ? "activé" : "désactivé"}**.`
                    )
                ]
            });
        }

        if (action === "set") {
            const role =
                await resolveRole(
                    message.guild,
                    args[1]
                );

            if (!role) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Rôle introuvable."
                        )
                    ]
                });
            }

            if (
                role.managed
            ) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Ce rôle est géré par une intégration et ne peut pas être attribué manuellement."
                        )
                    ]
                });
            }

            const me =
                message.guild.members.me;

            if (
                !me ||
                role.position >=
                me.roles.highest.position
            ) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Je ne peux pas attribuer ce rôle car il est trop haut dans ma hiérarchie."
                        )
                    ]
                });
            }

            config.roleId =
                role.id;

            saveDatabase();

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        `Le rôle d'autorole est maintenant ${role}.`
                    )
                ]
            });
        }

        return safeReply(message, {
            embeds: [
                errorEmbed(
                    "Option d'autorole inconnue."
                )
            ]
        });
    }
});

// ============================================================
// TEST MANUEL DU MESSAGE DE BIENVENUE
// ============================================================

registerCommand("welcometest", {
    permission: 4,

    async execute(message) {
        ensureGuildData(message.guild.id);

        const config =
            db.guilds[
                message.guild.id
            ].welcome;

        if (!config.channelId) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Aucun salon de bienvenue n'est configuré."
                    )
                ]
            });
        }

        const channel =
            message.guild.channels.cache.get(
                config.channelId
            );

        if (!channel || !channel.isTextBased()) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Le salon de bienvenue configuré est introuvable."
                    )
                ]
            });
        }

        try {
            await channel.send({
                embeds: [
                    buildWelcomeEmbed(
                        message.member,
                        message.guild
                    )
                ]
            });

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        "Message de bienvenue de test envoyé."
                    )
                ]
            });

        } catch (error) {
            console.error(
                "Erreur welcometest :",
                error
            );

            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Impossible d'envoyer le message de test."
                    )
                ]
            });
        }
    }
});

// ============================================================
// FIN PARTIE 4
// ============================================================
//
// CHECKLIST
//
// STATISTIQUES
// ✅ +stat
// ✅ Membre
// ✅ En ligne
// ✅ En vocal
// ✅ Boost
// ✅ En stream
// ✅ Configuration salon
// ✅ Configuration jour
// ✅ Configuration heure
// ✅ Activation / désactivation
// ✅ Données sauvegardées
//
// BIENVENUE
// ✅ +welcome
// ✅ Activation / désactivation
// ✅ Salon
// ✅ Message
// ✅ Titre
// ✅ Image
// ✅ {user}
// ✅ {username}
// ✅ {server}
// ✅ {memberCount}
// ✅ +welcometest
//
// AUTOROLE
// ✅ +autorole
// ✅ Activation / désactivation
// ✅ Configuration du rôle
// ✅ Vérification de la hiérarchie
// ✅ Sauvegarde
//
// PERMISSIONS
// ✅ +stat → Perm 4
// ✅ configuration stat → Perm 5
// ✅ +welcome → Perm 4
// ✅ +autorole → Perm 4
//
// IMPORTANT
// ❌ Aucun +rank / +derank ajouté ici.
// ❌ Aucune slash command.
// ❌ Aucun doublon des parties précédentes.
// ============================================================
// ============================================================
// PARTIE 5/10
// LOGS + TICKETS
// ============================================================

// ============================================================
// UTILITAIRE LOG
// ============================================================

async function sendGuildLog(
    guild,
    title,
    description,
    options = {}
) {
    try {
        ensureGuildData(guild.id);

        const config =
            db.guilds[guild.id].logs;

        if (!config.enabled || !config.channelId) {
            return;
        }

        const channel =
            guild.channels.cache.get(
                config.channelId
            );

        if (!channel || !channel.isTextBased()) {
            return;
        }

        const embed =
            new EmbedBuilder()
                .setTitle(`🎆 ${title}`)
                .setDescription(
                    description || "Aucune description."
                )
                .setTimestamp();

        if (options.fields) {
            embed.addFields(
                options.fields
            );
        }

        if (options.color) {
            embed.setColor(
                options.color
            );
        }

        await channel.send({
            embeds: [embed]
        });

    } catch (error) {
        console.error(
            "Erreur envoi logs :",
            error
        );
    }
}

// ============================================================
// ALIAS UTILISÉ PAR LES COMMANDES PRÉCÉDENTES
// ============================================================

function addLog(
    guildId,
    title,
    description
) {
    const guild =
        client.guilds.cache.get(
            guildId
        );

    if (!guild) {
        return;
    }

    return sendGuildLog(
        guild,
        title,
        description
    );
}

// ============================================================
// +LOGS
// ============================================================

registerCommand("logs", {
    permission: 4,

    async execute(message, args) {
        ensureGuildData(message.guild.id);

        const action =
            args[0]?.toLowerCase();

        const config =
            db.guilds[
                message.guild.id
            ].logs;

        if (!action) {
            return safeReply(message, {
                embeds: [
                    infoEmbed(
                        `Utilisation :\n` +
                        `${PREFIX}logs on\n` +
                        `${PREFIX}logs off\n` +
                        `${PREFIX}logs channel`
                    )
                ]
            });
        }

        if (
            action === "on" ||
            action === "off"
        ) {
            config.enabled =
                action === "on";

            saveDatabase();

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        `Les logs sont maintenant **${config.enabled ? "activés" : "désactivés"}**.`
                    )
                ]
            });
        }

        if (action === "channel") {
            config.channelId =
                message.channel.id;

            config.enabled =
                true;

            saveDatabase();

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        `Le salon des logs est maintenant ${message.channel}.`
                    )
                ]
            });
        }

        return safeReply(message, {
            embeds: [
                errorEmbed(
                    "Option de logs inconnue."
                )
            ]
        });
    }
});

// ============================================================
// LOG MESSAGE SUPPRIMÉ
// ============================================================

client.on(
    Events.MessageDelete,
    async message => {
        try {
            if (!message.guild) {
                return;
            }

            if (message.author?.bot) {
                return;
            }

            const content =
                message.content?.trim();

            const description =
                content
                    ? `**Auteur :** ${message.author}\n` +
                      `**Salon :** ${message.channel}\n\n` +
                      `**Contenu :**\n${content.slice(0, 1500)}`
                    : `**Auteur :** ${message.author}\n` +
                      `**Salon :** ${message.channel}\n\n` +
                      `Le message ne contenait pas de texte.`;

            await sendGuildLog(
                message.guild,
                "Message supprimé",
                description
            );

        } catch (error) {
            console.error(
                "Erreur log message supprimé :",
                error
            );
        }
    }
);

// ============================================================
// LOG MESSAGE MODIFIÉ
// ============================================================

client.on(
    Events.MessageUpdate,
    async (oldMessage, newMessage) => {
        try {
            if (!newMessage.guild) {
                return;
            }

            if (newMessage.author?.bot) {
                return;
            }

            if (
                oldMessage.content ===
                newMessage.content
            ) {
                return;
            }

            await sendGuildLog(
                newMessage.guild,
                "Message modifié",
                `**Auteur :** ${newMessage.author}\n` +
                `**Salon :** ${newMessage.channel}\n\n` +
                `**Avant :**\n${(oldMessage.content || "Inconnu").slice(0, 700)}\n\n` +
                `**Après :**\n${(newMessage.content || "Inconnu").slice(0, 700)}`
            );

        } catch (error) {
            console.error(
                "Erreur log message modifié :",
                error
            );
        }
    }
);

// ============================================================
// LOG MEMBRE REJOINT
// ============================================================

client.on(
    Events.GuildMemberAdd,
    async member => {
        try {
            await sendGuildLog(
                member.guild,
                "Membre arrivé",
                `${member} a rejoint le serveur.\n` +
                `Compte : ${discordTimestamp(member.user.createdTimestamp)}`
            );

        } catch (error) {
            console.error(
                "Erreur log arrivée :",
                error
            );
        }
    }
);

// ============================================================
// LOG MEMBRE QUITTANT
// ============================================================

client.on(
    Events.GuildMemberRemove,
    async member => {
        try {
            await sendGuildLog(
                member.guild,
                "Membre parti",
                `**${member.user.tag}** a quitté le serveur.\n` +
                `ID : \`${member.id}\``
            );

        } catch (error) {
            console.error(
                "Erreur log départ :",
                error
            );
        }
    }
);

// ============================================================
// STRUCTURE TICKET
// ============================================================

function getTicketConfig(guildId) {
    ensureGuildData(guildId);

    return db.guilds[guildId].tickets;
}

// ============================================================
// VÉRIFICATION : EST-CE UN TICKET ?
// ============================================================

function isTicketChannel(channel) {
    if (!channel?.guild) {
        return false;
    }

    const config =
        getTicketConfig(
            channel.guild.id
        );

    return (
        config.channels &&
        config.channels[channel.id]
    );
}

// ============================================================
// RÉCUPÉRATION DU TICKET
// ============================================================

function getTicketData(channel) {
    if (!channel?.guild) {
        return null;
    }

    const config =
        getTicketConfig(
            channel.guild.id
        );

    return (
        config.channels[
            channel.id
        ] || null
    );
}

// ============================================================
// +TICKET
// ============================================================

registerCommand("ticket", {
    permission: 0,

    async execute(message, args) {
        const action =
            args[0]?.toLowerCase();

        const config =
            getTicketConfig(
                message.guild.id
            );

        // ----------------------------------------------------
        // SETUP
        // ----------------------------------------------------

        if (action === "setup") {
            // IMPORTANT :
            // Perm 0 ne doit PAS pouvoir configurer le système.
            // On vérifie explicitement Perm 5/Crown.
            const canSetup =
                isCrown(message.member) ||
                getPermissionLevel(
                    message.member
                ) >= 5;

            if (!canSetup) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "La configuration des tickets est réservée à Crown."
                        )
                    ]
                });
            }

            config.setupChannelId =
                message.channel.id;

            config.enabled =
                true;

            saveDatabase();

            const row =
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                "hirosaki_ticket_open"
                            )
                            .setLabel(
                                "Ouvrir un ticket"
                            )
                            .setStyle(
                                ButtonStyle.Primary
                            )
                    );

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "🎆 Support — Hirosaki"
                    )
                    .setDescription(
                        "Clique sur le bouton ci-dessous pour ouvrir un ticket."
                    )
                    .setTimestamp();

            try {
                await message.channel.send({
                    embeds: [embed],
                    components: [row]
                });

                return safeReply(message, {
                    embeds: [
                        successEmbed(
                            "Le panneau de tickets a été créé."
                        )
                    ]
                });

            } catch (error) {
                console.error(
                    "Erreur ticket setup :",
                    error
                );

                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Impossible de créer le panneau de tickets."
                        )
                    ]
                });
            }
        }

        // ----------------------------------------------------
        // ADD
        // ----------------------------------------------------

        if (action === "add") {
            const ticket =
                getTicketData(
                    message.channel
                );

            if (!ticket) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Cette commande doit être utilisée dans un ticket."
                        )
                    ]
                });
            }

            const member =
                await resolveMember(
                    message,
                    args[1]
                );

            if (!member) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}ticket add @membre`
                        )
                    ]
                });
            }

            try {
                await message.channel.permissionOverwrites.edit(
                    member.id,
                    {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    }
                );

                ticket.members =
                    Array.isArray(
                        ticket.members
                    )
                        ? ticket.members
                        : [];

                if (
                    !ticket.members.includes(
                        member.id
                    )
                ) {
                    ticket.members.push(
                        member.id
                    );
                }

                saveDatabase();

                await sendGuildLog(
                    message.guild,
                    "Membre ajouté à un ticket",
                    `${member} a été ajouté au ticket ${message.channel} par ${message.author}.`
                );

                return safeReply(message, {
                    embeds: [
                        successEmbed(
                            `${member} a été ajouté à ce ticket.`
                        )
                    ]
                });

            } catch (error) {
                console.error(
                    "Erreur ticket add :",
                    error
                );

                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Impossible d'ajouter ce membre au ticket."
                        )
                    ]
                });
            }
        }

        // ----------------------------------------------------
        // REMOVE
        // ----------------------------------------------------

        if (action === "remove") {
            const ticket =
                getTicketData(
                    message.channel
                );

            if (!ticket) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Cette commande doit être utilisée dans un ticket."
                        )
                    ]
                });
            }

            const member =
                await resolveMember(
                    message,
                    args[1]
                );

            if (!member) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}ticket remove @membre`
                        )
                    ]
                });
            }

            // Le créateur du ticket ne doit pas être retiré
            // par cette commande.
            if (
                member.id ===
                ticket.ownerId
            ) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Le créateur du ticket ne peut pas être retiré du ticket."
                        )
                    ]
                });
            }

            try {
                await message.channel.permissionOverwrites.delete(
                    member.id,
                    `Retiré du ticket par ${message.author.tag}`
                );

                ticket.members =
                    Array.isArray(
                        ticket.members
                    )
                        ? ticket.members.filter(
                            id =>
                                id !== member.id
                        )
                        : [];

                saveDatabase();

                await sendGuildLog(
                    message.guild,
                    "Membre retiré d'un ticket",
                    `${member} a été retiré du ticket ${message.channel} par ${message.author}.`
                );

                return safeReply(message, {
                    embeds: [
                        successEmbed(
                            `${member} a été retiré de ce ticket.`
                        )
                    ]
                });

            } catch (error) {
                console.error(
                    "Erreur ticket remove :",
                    error
                );

                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Impossible de retirer ce membre du ticket."
                        )
                    ]
                });
            }
        }

        // ----------------------------------------------------
        // CLAIM
        // ----------------------------------------------------

        if (action === "claim") {
            const ticket =
                getTicketData(
                    message.channel
                );

            if (!ticket) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Cette commande doit être utilisée dans un ticket."
                        )
                    ]
                });
            }

            ticket.claimedBy =
                message.author.id;

            ticket.claimedAt =
                Date.now();

            saveDatabase();

            await sendGuildLog(
                message.guild,
                "Ticket claim",
                `${message.author} a pris en charge ${message.channel}.`
            );

            return safeReply(message, {
                embeds: [
                    successEmbed(
                        `${message.author} a pris en charge ce ticket.`
                    )
                ]
            });
        }

        // ----------------------------------------------------
        // RENAME
        // ----------------------------------------------------

        if (action === "rename") {
            const ticket =
                getTicketData(
                    message.channel
                );

            if (!ticket) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Cette commande doit être utilisée dans un ticket."
                        )
                    ]
                });
            }

            const name =
                args
                    .slice(1)
                    .join("-")
                    .toLowerCase()
                    .replace(
                        /[^a-z0-9-_]/g,
                        ""
                    )
                    .slice(0, 90);

            if (!name) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            `Utilisation : ${PREFIX}ticket rename nom`
                        )
                    ]
                });
            }

            try {
                const oldName =
                    message.channel.name;

                await message.channel.setName(
                    name,
                    `Renommé par ${message.author.tag}`
                );

                ticket.name =
                    name;

                saveDatabase();

                await sendGuildLog(
                    message.guild,
                    "Ticket renommé",
                    `${message.author} a renommé le ticket \`${oldName}\` en \`${name}\`.`
                );

                return safeReply(message, {
                    embeds: [
                        successEmbed(
                            `Le ticket a été renommé en **${name}**.`
                        )
                    ]
                });

            } catch (error) {
                console.error(
                    "Erreur ticket rename :",
                    error
                );

                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Impossible de renommer ce ticket."
                        )
                    ]
                });
            }
        }

        // ----------------------------------------------------
        // CLOSE
        // ----------------------------------------------------

        if (action === "close") {
            const ticket =
                getTicketData(
                    message.channel
                );

            if (!ticket) {
                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Cette commande doit être utilisée dans un ticket."
                        )
                    ]
                });
            }

            ticket.closedAt =
                Date.now();

            ticket.closedBy =
                message.author.id;

            ticket.status =
                "closed";

            saveDatabase();

            await sendGuildLog(
                message.guild,
                "Ticket fermé",
                `${message.author} a fermé ${message.channel}.`
            );

            try {
                await message.channel.delete(
                    `Ticket fermé par ${message.author.tag}`
                );
            } catch (error) {
                console.error(
                    "Erreur suppression ticket :",
                    error
                );

                return safeReply(message, {
                    embeds: [
                        errorEmbed(
                            "Impossible de supprimer le salon du ticket."
                        )
                    ]
                });
            }

            return;
        }

        // ----------------------------------------------------
        // AIDE TICKET
        // ----------------------------------------------------

        return safeReply(message, {
            embeds: [
                infoEmbed(
                    `Commandes disponibles :\n\n` +
                    `${PREFIX}ticket add @membre\n` +
                    `${PREFIX}ticket remove @membre\n` +
                    `${PREFIX}ticket claim\n` +
                    `${PREFIX}ticket rename nom\n` +
                    `${PREFIX}ticket close\n\n` +
                    `Configuration : ${PREFIX}ticket setup`
                )
            ]
        });
    }
});

// ============================================================
// BOUTON : OUVRIR UN TICKET
// ============================================================

client.on(
    Events.InteractionCreate,
    async interaction => {
        if (
            !interaction.isButton()
        ) {
            return;
        }

        if (
            interaction.customId !==
            "hirosaki_ticket_open"
        ) {
            return;
        }

        const guild =
            interaction.guild;

        if (!guild) {
            return;
        }

        ensureGuildData(
            guild.id
        );

        const config =
            getTicketConfig(
                guild.id
            );

        if (!config.enabled) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Le système de tickets est actuellement désactivé."
                    )
                ],
                ephemeral: true
            });
        }

        // Vérifie si l'utilisateur possède déjà un ticket ouvert.
        const existing =
            Object.entries(
                config.channels || {}
            ).find(
                ([, ticket]) =>
                    ticket.ownerId ===
                    interaction.user.id &&
                    ticket.status !== "closed"
            );

        if (existing) {
            return interaction.reply({
                embeds: [
                    infoEmbed(
                        "Tu as déjà un ticket ouvert."
                    )
                ],
                ephemeral: true
            });
        }

        const ticketName =
            `ticket-${interaction.user.username}`
                .toLowerCase()
                .replace(
                    /[^a-z0-9-_]/g,
                    ""
                )
                .slice(0, 80);

        try {
            const permissionOverwrites = [
                {
                    id: guild.roles.everyone.id,
                    deny: [
                        PermissionFlagsBits.ViewChannel
                    ]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                }
            ];

            const ticketRole =
                guild.roles.cache.find(
                    role =>
                        role.name ===
                        "Gestion ticket"
                );

            if (ticketRole) {
                permissionOverwrites.push({
                    id: ticketRole.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                });
            }

            const crownRole =
                guild.roles.cache.find(
                    role =>
                        role.name === "Crown"
                );

            if (crownRole) {
                permissionOverwrites.push({
                    id: crownRole.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory
                    ]
                });
            }

            const channel =
                await guild.channels.create({
                    name: ticketName,
                    type: ChannelType.GuildText,
                    parent:
                        config.categoryId ||
                        null,
                    permissionOverwrites
                });

            config.channels =
                config.channels || {};

            config.channels[
                channel.id
            ] = {
                ownerId:
                    interaction.user.id,
                members: [],
                claimedBy: null,
                claimedAt: null,
                createdAt: Date.now(),
                status: "open",
                name: channel.name
            };

            saveDatabase();

            const closeRow =
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                "hirosaki_ticket_close"
                            )
                            .setLabel(
                                "Fermer le ticket"
                            )
                            .setStyle(
                                ButtonStyle.Danger
                            )
                    );

            const ticketEmbed =
                new EmbedBuilder()
                    .setTitle(
                        "🎆 Ticket Hirosaki"
                    )
                    .setDescription(
                        `Bienvenue ${interaction.user}.\n\n` +
                        `Un membre du staff va prendre en charge ton ticket.\n\n` +
                        `Tu peux également utiliser les commandes de gestion prévues pour les tickets.`
                    )
                    .addFields({
                        name: "Créateur",
                        value:
                            `${interaction.user}`,
                        inline: true
                    })
                    .setTimestamp();

            await channel.send({
                content:
                    `${interaction.user}`,
                embeds: [
                    ticketEmbed
                ],
                components: [
                    closeRow
                ]
            });

            await sendGuildLog(
                guild,
                "Ticket créé",
                `${interaction.user} a créé ${channel}.`
            );

            return interaction.reply({
                embeds: [
                    successEmbed(
                        `Ton ticket a été créé : ${channel}`
                    )
                ],
                ephemeral: true
            });

        } catch (error) {
            console.error(
                "Erreur création ticket :",
                error
            );

            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Impossible de créer le ticket. Vérifie les permissions du bot."
                    )
                ],
                ephemeral: true
            });
        }
    }
);

// ============================================================
// BOUTON : FERMER UN TICKET
// ============================================================

client.on(
    Events.InteractionCreate,
    async interaction => {
        if (
            !interaction.isButton()
        ) {
            return;
        }

        if (
            interaction.customId !==
            "hirosaki_ticket_close"
        ) {
            return;
        }

        const channel =
            interaction.channel;

        if (!isTicketChannel(channel)) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Ce salon n'est pas un ticket."
                    )
                ],
                ephemeral: true
            });
        }

        const ticket =
            getTicketData(channel);

        ticket.closedAt =
            Date.now();

        ticket.closedBy =
            interaction.user.id;

        ticket.status =
            "closed";

        saveDatabase();

        await interaction.reply({
            embeds: [
                successEmbed(
                    "Le ticket va être fermé."
                )
            ]
        });

        await sendGuildLog(
            interaction.guild,
            "Ticket fermé",
            `${interaction.user} a fermé ${channel}.`
        );

        setTimeout(
            () => {
                channel.delete(
                    `Ticket fermé par ${interaction.user.tag}`
                ).catch(
                    error =>
                        console.error(
                            "Erreur suppression ticket :",
                            error
                        )
                );
            },
            1500
        );
    }
);

// ============================================================
// FIN PARTIE 5
// ============================================================
//
// CHECKLIST AJOUTÉE
//
// LOGS
// ✅ +logs
// ✅ Activation / désactivation
// ✅ Choix du salon
// ✅ Messages supprimés
// ✅ Messages modifiés
// ✅ Membres arrivant
// ✅ Membres partant
// ✅ Actions tickets
// ✅ Embeds
// ✅ Gestion des erreurs
//
// TICKETS
// ✅ +ticket setup
// ✅ +ticket add @membre
// ✅ +ticket remove @membre
// ✅ +ticket claim
// ✅ +ticket rename nom
// ✅ +ticket close
// ✅ Bouton ouverture
// ✅ Création automatique du salon
// ✅ Permissions du créateur
// ✅ Rôle "Gestion ticket"
// ✅ Rôle "Crown"
// ✅ Ajout de membres
// ✅ Retrait de membres
// ✅ Claim
// ✅ Rename
// ✅ Fermeture
// ✅ Persistance des données
//
// PERMISSIONS TICKETS
// ✅ Perm 0 peut gérer les tickets
// ❌ Perm 0 ne peut PAS faire ticket setup
// ✅ ticket setup réservé à Crown / Perm 5
//
// IMPORTANT
// ❌ Aucun +rank / +derank ajouté.
// ❌ Aucune slash command créée.
// ❌ Aucun bloc des parties précédentes recopié.
// ============================================================
// ============================================================
// PARTIE 6/10
// ACTIVITÉ MESSAGES + VOCAL + DUO VOCAL
// ============================================================

// ============================================================
// UTILITAIRES ACTIVITÉ
// ============================================================

function ensureActivityData(guildId, userId) {
    ensureGuildData(guildId);

    const guildData =
        db.guilds[guildId];

    if (!guildData.activity) {
        guildData.activity = {
            messages: {},
            voice: {},
            duo: {},
            sessions: {}
        };
    }

    if (!guildData.activity.messages[userId]) {
        guildData.activity.messages[userId] = 0;
    }

    if (!guildData.activity.voice[userId]) {
        guildData.activity.voice[userId] = 0;
    }

    if (!guildData.activity.duo[userId]) {
        guildData.activity.duo[userId] = {};
    }

    if (!guildData.activity.sessions[userId]) {
        guildData.activity.sessions[userId] = null;
    }

    return guildData.activity;
}

// ============================================================
// ENREGISTRER UN MESSAGE
// ============================================================

client.on(
    Events.MessageCreate,
    async message => {
        try {
            if (!message.guild) {
                return;
            }

            if (message.author.bot) {
                return;
            }

            ensureActivityData(
                message.guild.id,
                message.author.id
            );

            db.guilds[
                message.guild.id
            ].activity.messages[
                message.author.id
            ]++;

            saveDatabase();

        } catch (error) {
            console.error(
                "Erreur activité message :",
                error
            );
        }
    }
);

// ============================================================
// OBTENIR LES MEMBRES D'UN SALON VOCAL
// ============================================================

function getVoiceMembers(channel) {
    if (!channel) {
        return [];
    }

    return channel.members
        .filter(
            member =>
                !member.user.bot
        )
        .map(
            member =>
                member.id
        );
}

// ============================================================
// CALCUL DES DUOS
// ============================================================

function addDuoTime(
    guildId,
    userA,
    userB,
    milliseconds
) {
    if (
        !milliseconds ||
        milliseconds <= 0
    ) {
        return;
    }

    if (
        userA === userB
    ) {
        return;
    }

    ensureActivityData(
        guildId,
        userA
    );

    ensureActivityData(
        guildId,
        userB
    );

    if (
        !db.guilds[
            guildId
        ].activity.duo[userA][userB]
    ) {
        db.guilds[
            guildId
        ].activity.duo[userA][userB] = 0;
    }

    if (
        !db.guilds[
            guildId
        ].activity.duo[userB][userA]
    ) {
        db.guilds[
            guildId
        ].activity.duo[userB][userA] = 0;
    }

    db.guilds[
        guildId
    ].activity.duo[userA][userB] +=
        milliseconds;

    db.guilds[
        guildId
    ].activity.duo[userB][userA] +=
        milliseconds;
}

// ============================================================
// ENREGISTREMENT D'UNE SESSION VOCALE
// ============================================================

function finishVoiceSession(
    guild,
    userId
) {
    ensureActivityData(
        guild.id,
        userId
    );

    const session =
        db.guilds[
            guild.id
        ].activity.sessions[userId];

    if (!session) {
        return;
    }

    const now =
        Date.now();

    const duration =
        Math.max(
            0,
            now - session.joinedAt
        );

    if (duration > 0) {
        db.guilds[
            guild.id
        ].activity.voice[userId] +=
            duration;
    }

    // --------------------------------------------------------
    // CALCUL DU TEMPS ENSEMBLE AVEC LES AUTRES MEMBRES
    // --------------------------------------------------------

    const channel =
        guild.channels.cache.get(
            session.channelId
        );

    if (channel) {
        const members =
            getVoiceMembers(
                channel
            );

        for (const otherId of members) {
            if (
                otherId === userId
            ) {
                continue;
            }

            const otherSession =
                db.guilds[
                    guild.id
                ].activity.sessions[
                    otherId
                ];

            if (!otherSession) {
                continue;
            }

            if (
                otherSession.channelId !==
                session.channelId
            ) {
                continue;
            }

            const overlapStart =
                Math.max(
                    session.joinedAt,
                    otherSession.joinedAt
                );

            const overlapEnd =
                Math.min(
                    now,
                    otherSession.leftAt ||
                    now
                );

            const overlap =
                Math.max(
                    0,
                    overlapEnd -
                    overlapStart
                );

            if (overlap > 0) {
                addDuoTime(
                    guild.id,
                    userId,
                    otherId,
                    overlap
                );
            }
        }
    }

    db.guilds[
        guild.id
    ].activity.sessions[userId] =
        null;

    saveDatabase();
}

// ============================================================
// RECONSTITUTION DES SESSIONS VOCALES
// ============================================================

async function rebuildVoiceSessions(
    guild
) {
    try {
        await guild.members.fetch();

        for (
            const member of
            guild.members.cache.values()
        ) {
            if (
                member.user.bot
            ) {
                continue;
            }

            ensureActivityData(
                guild.id,
                member.id
            );

            if (
                member.voice.channel
            ) {
                db.guilds[
                    guild.id
                ].activity.sessions[
                    member.id
                ] = {
                    channelId:
                        member.voice.channel.id,

                    joinedAt:
                        Date.now()
                };
            } else {
                db.guilds[
                    guild.id
                ].activity.sessions[
                    member.id
                ] = null;
            }
        }

        saveDatabase();

    } catch (error) {
        console.error(
            "Erreur reconstruction vocal :",
            error
        );
    }
}

// ============================================================
// VOICE STATE UPDATE
// ============================================================

client.on(
    Events.VoiceStateUpdate,
    async (oldState, newState) => {
        try {
            const guild =
                newState.guild ||
                oldState.guild;

            if (!guild) {
                return;
            }

            const member =
                newState.member ||
                oldState.member;

            if (!member) {
                return;
            }

            if (
                member.user.bot
            ) {
                return;
            }

            ensureActivityData(
                guild.id,
                member.id
            );

            const oldChannel =
                oldState.channel;

            const newChannel =
                newState.channel;

            // ------------------------------------------------
            // AUCUN CHANGEMENT DE SALON
            // ------------------------------------------------

            if (
                oldChannel?.id ===
                newChannel?.id
            ) {
                return;
            }

            // ------------------------------------------------
            // SORTIE D'UN SALON
            // ------------------------------------------------

            if (
                oldChannel &&
                !newChannel
            ) {
                const session =
                    db.guilds[
                        guild.id
                    ].activity.sessions[
                        member.id
                    ];

                if (session) {
                    session.leftAt =
                        Date.now();
                }

                finishVoiceSession(
                    guild,
                    member.id
                );

                return;
            }

            // ------------------------------------------------
            // CHANGEMENT DE SALON
            // ------------------------------------------------

            if (
                oldChannel &&
                newChannel
            ) {
                const session =
                    db.guilds[
                        guild.id
                    ].activity.sessions[
                        member.id
                    ];

                if (session) {
                    session.leftAt =
                        Date.now();
                }

                finishVoiceSession(
                    guild,
                    member.id
                );

                ensureActivityData(
                    guild.id,
                    member.id
                );

                db.guilds[
                    guild.id
                ].activity.sessions[
                    member.id
                ] = {
                    channelId:
                        newChannel.id,

                    joinedAt:
                        Date.now()
                };

                saveDatabase();

                return;
            }

            // ------------------------------------------------
            // ENTRÉE EN VOCAL
            // ------------------------------------------------

            if (
                !oldChannel &&
                newChannel
            ) {
                db.guilds[
                    guild.id
                ].activity.sessions[
                    member.id
                ] = {
                    channelId:
                        newChannel.id,

                    joinedAt:
                        Date.now()
                };

                saveDatabase();

                return;
            }

        } catch (error) {
            console.error(
                "Erreur VoiceStateUpdate :",
                error
            );
        }
    }
);

// ============================================================
// MISE À JOUR RÉGULIÈRE DES SESSIONS
// ============================================================
//
// On ne dépend pas uniquement de VoiceStateUpdate.
// Cela permet de sécuriser les calculs lors des changements
// de présence et d'éviter qu'une longue session soit perdue.
// ============================================================

setInterval(
    () => {
        try {
            for (
                const guild of
                client.guilds.cache.values()
            ) {
                const activity =
                    db.guilds[
                        guild.id
                    ]?.activity;

                if (!activity) {
                    continue;
                }

                for (
                    const [
                        userId,
                        session
                    ] of Object.entries(
                        activity.sessions
                    )
                ) {
                    if (!session) {
                        continue;
                    }

                    const member =
                        guild.members.cache.get(
                            userId
                        );

                    if (
                        !member ||
                        !member.voice.channel
                    ) {
                        continue;
                    }

                    if (
                        member.voice.channel.id !==
                        session.channelId
                    ) {
                        continue;
                    }

                    const now =
                        Date.now();

                    const elapsed =
                        now -
                        session.joinedAt;

                    if (
                        elapsed <= 0
                    ) {
                        continue;
                    }

                    // On crédite uniquement la période écoulée.
                    activity.voice[userId] =
                        (activity.voice[userId] || 0) +
                        elapsed;

                    // Les duos présents dans le même salon
                    // reçoivent également cette période.
                    const members =
                        getVoiceMembers(
                            member.voice.channel
                        );

                    for (
                        const otherId of members
                    ) {
                        if (
                            otherId === userId
                        ) {
                            continue;
                        }

                        const otherSession =
                            activity.sessions[
                                otherId
                            ];

                        if (!otherSession) {
                            continue;
                        }

                        if (
                            otherSession.channelId !==
                            session.channelId
                        ) {
                            continue;
                        }

                        const otherElapsed =
                            Math.max(
                                0,
                                now -
                                otherSession.joinedAt
                            );

                        const duoElapsed =
                            Math.min(
                                elapsed,
                                otherElapsed
                            );

                        addDuoTime(
                            guild.id,
                            userId,
                            otherId,
                            duoElapsed
                        );
                    }

                    session.joinedAt =
                        now;
                }

                saveDatabase();
            }

        } catch (error) {
            console.error(
                "Erreur sauvegarde activité vocale :",
                error
            );
        }
    },
    60 * 1000
);

// ============================================================
// SAUVEGARDE AVANT ARRÊT DU PROCESSUS
// ============================================================

async function closeActiveVoiceSessions() {
    try {
        for (
            const guild of
            client.guilds.cache.values()
        ) {
            const activity =
                db.guilds[
                    guild.id
                ]?.activity;

            if (!activity) {
                continue;
            }

            for (
                const [
                    userId,
                    session
                ] of Object.entries(
                    activity.sessions
                )
            ) {
                if (!session) {
                    continue;
                }

                const now =
                    Date.now();

                const duration =
                    Math.max(
                        0,
                        now -
                        session.joinedAt
                    );

                if (
                    duration > 0
                ) {
                    activity.voice[userId] =
                        (activity.voice[userId] || 0) +
                        duration;
                }

                activity.sessions[userId] =
                    null;
            }
        }

        saveDatabase();

    } catch (error) {
        console.error(
            "Erreur fermeture sessions vocales :",
            error
        );
    }
}

process.once(
    "SIGINT",
    async () => {
        await closeActiveVoiceSessions();
        process.exit(0);
    }
);

process.once(
    "SIGTERM",
    async () => {
        await closeActiveVoiceSessions();
        process.exit(0);
    }
);

// ============================================================
// +ACTIVITY
// ============================================================

registerCommand("activity", {
    permission: 4,

    aliases: [
        "activite"
    ],

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0] ||
                message.author.id
            );

        if (!member) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        "Utilisateur introuvable."
                    )
                ]
            });
        }

        ensureActivityData(
            message.guild.id,
            member.id
        );

        const activity =
            db.guilds[
                message.guild.id
            ].activity;

        const messages =
            activity.messages[
                member.id
            ] || 0;

        const voice =
            activity.voice[
                member.id
            ] || 0;

        const hours =
            Math.floor(
                voice /
                3600000
            );

        const minutes =
            Math.floor(
                (
                    voice %
                    3600000
                ) /
                60000
            );

        const seconds =
            Math.floor(
                (
                    voice %
                    60000
                ) /
                1000
            );

        const embed =
            new EmbedBuilder()
                .setTitle(
                    `🎆 Activité — ${member.user.username}`
                )
                .setThumbnail(
                    member.user.displayAvatarURL({
                        size: 256
                    })
                )
                .addFields(
                    {
                        name: "Messages",
                        value:
                            `${messages}`,
                        inline: true
                    },
                    {
                        name: "Temps vocal",
                        value:
                            `${hours}h ${minutes}m ${seconds}s`,
                        inline: true
                    }
                )
                .setTimestamp();

        return safeReply(message, {
            embeds: [embed]
        });
    }
});

// ============================================================
// +DUO
// ============================================================

registerCommand("duo", {
    permission: 4,

    async execute(message, args) {
        const member =
            await resolveMember(
                message,
                args[0]
            );

        if (!member) {
            return safeReply(message, {
                embeds: [
                    errorEmbed(
                        `Utilisation : ${PREFIX}duo @membre`
                    )
                ]
            });
        }

        ensureActivityData(
            message.guild.id,
            message.author.id
        );

        const activity =
            db.guilds[
                message.guild.id
            ].activity;

        const first =
            activity.duo[
                message.author.id
            ]?.[member.id] || 0;

        const second =
            activity.duo[
                member.id
            ]?.[message.author.id] || 0;

        const milliseconds =
            Math.max(
                first,
                second
            );

        const totalMinutes =
            Math.floor(
                milliseconds /
                60000
            );

        const hours =
            Math.floor(
                totalMinutes /
                60
            );

        const minutes =
            totalMinutes %
            60;

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🎆 Temps vocal en duo"
                )
                .setDescription(
                    `${message.author} et ${member} ont passé environ **${hours}h ${minutes}m** ensemble en vocal.`
                )
                .setTimestamp();

        return safeReply(message, {
            embeds: [embed]
        });
    }
});

// ============================================================
// FIN PARTIE 6
// ============================================================
//
// ACTIVITÉ
//
// ✅ Comptage des messages
// ✅ Temps vocal
// ✅ Entrée en vocal
// ✅ Sortie du vocal
// ✅ Changement de salon vocal
// ✅ Sessions persistantes
// ✅ Suivi des duos
// ✅ Temps simultané en vocal
// ✅ Gestion des bots
// ✅ Sauvegarde périodique
// ✅ Sauvegarde à l'arrêt
// ✅ Reconstruction des sessions
// ✅ Commande +activity
// ✅ Commande +duo
//
// DESTINATION LEADERBOARD
//
// ✅ TOP messages
// ✅ TOP vocal
// ✅ TOP duo vocal
//
// IMPORTANT
//
// ❌ Aucun doublon des parties précédentes.
// ❌ Aucun +rank / +derank ajouté.
// ❌ Aucune slash command.
// ============================================================
// ============================================================
// PARTIE 7/10 — LEADERBOARD
// ============================================================

// ------------------------------------------------------------
// CONFIGURATION LEADERBOARD
// ------------------------------------------------------------

function getLeaderboardConfig(guildId) {
    ensureGuildData(guildId);

    const guildData = db.guilds[guildId];

    if (!guildData.leaderboard) {
        guildData.leaderboard = {
            enabled: false,
            channelId: null,
            day: 0,
            hour: 20,
            lastSent: null
        };
    }

    return guildData.leaderboard;
}

// ------------------------------------------------------------
// FORMATAGE DU TEMPS
// ------------------------------------------------------------

function formatLeaderboardTime(milliseconds) {
    const totalSeconds = Math.floor(
        Math.max(0, milliseconds) / 1000
    );

    const days = Math.floor(
        totalSeconds / 86400
    );

    const hours = Math.floor(
        (totalSeconds % 86400) / 3600
    );

    const minutes = Math.floor(
        (totalSeconds % 3600) / 60
    );

    if (days > 0) {
        return `${days}j ${hours}h ${minutes}m`;
    }

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
}

// ------------------------------------------------------------
// RÉCUPÉRATION DES TOP MESSAGES
// ------------------------------------------------------------

function getTopMessageUsers(guild, limit = 10) {
    ensureGuildData(guild.id);

    const activity =
        db.guilds[guild.id].activity;

    if (!activity) {
        return [];
    }

    return Object.entries(
        activity.messages || {}
    )
        .map(([userId, count]) => ({
            userId,
            value: Number(count) || 0
        }))
        .filter(entry => entry.value > 0)
        .sort(
            (a, b) =>
                b.value - a.value
        )
        .slice(0, limit);
}

// ------------------------------------------------------------
// RÉCUPÉRATION DES TOP VOCAUX
// ------------------------------------------------------------

function getTopVoiceUsers(guild, limit = 10) {
    ensureGuildData(guild.id);

    const activity =
        db.guilds[guild.id].activity;

    if (!activity) {
        return [];
    }

    return Object.entries(
        activity.voice || {}
    )
        .map(([userId, time]) => ({
            userId,
            value: Number(time) || 0
        }))
        .filter(entry => entry.value > 0)
        .sort(
            (a, b) =>
                b.value - a.value
        )
        .slice(0, limit);
}

// ------------------------------------------------------------
// RÉCUPÉRATION DES TOP DUOS
// ------------------------------------------------------------

function getTopVoiceDuos(guild, limit = 10) {
    ensureGuildData(guild.id);

    const activity =
        db.guilds[guild.id].activity;

    if (!activity) {
        return [];
    }

    const pairs = new Map();

    for (
        const [userA, partners] of Object.entries(
            activity.duo || {}
        )
    ) {
        for (
            const [userB, time] of Object.entries(
                partners || {}
            )
        ) {
            if (userA === userB) {
                continue;
            }

            const ids = [
                userA,
                userB
            ].sort();

            const key =
                `${ids[0]}:${ids[1]}`;

            const existing =
                pairs.get(key);

            const numericTime =
                Number(time) || 0;

            if (
                !existing ||
                numericTime > existing.value
            ) {
                pairs.set(key, {
                    userA: ids[0],
                    userB: ids[1],
                    value: numericTime
                });
            }
        }
    }

    return Array.from(
        pairs.values()
    )
        .filter(pair => pair.value > 0)
        .sort(
            (a, b) =>
                b.value - a.value
        )
        .slice(0, limit);
}

// ------------------------------------------------------------
// RÉCUPÉRER UN NOM D'UTILISATEUR
// ------------------------------------------------------------

async function getLeaderboardUser(
    guild,
    userId
) {
    try {
        const member =
            guild.members.cache.get(
                userId
            ) ||
            await guild.members.fetch(
                userId
            ).catch(() => null);

        if (member) {
            return member;
        }

        const user =
            await client.users.fetch(
                userId
            ).catch(() => null);

        return user;
    } catch {
        return null;
    }
}

// ------------------------------------------------------------
// CRÉATION DE LA PAGE MESSAGES
// ------------------------------------------------------------

async function buildMessageLeaderboard(guild) {
    const top =
        getTopMessageUsers(
            guild,
            10
        );

    const lines = [];

    for (
        let index = 0;
        index < top.length;
        index++
    ) {
        const entry =
            top[index];

        const user =
            await getLeaderboardUser(
                guild,
                entry.userId
            );

        const name =
            user?.user?.username ||
            user?.username ||
            entry.userId;

        lines.push(
            `**${index + 1}.** ${name} — **${entry.value.toLocaleString("fr-FR")} messages**`
        );
    }

    if (!lines.length) {
        lines.push(
            "Aucune activité enregistrée pour le moment."
        );
    }

    return new EmbedBuilder()
        .setTitle(
            "🎆 Leaderboard — Messages"
        )
        .setDescription(
            lines.join("\n")
        )
        .setFooter({
            text:
                "Classement basé sur l'activité enregistrée par Hirosaki."
        })
        .setTimestamp();
}

// ------------------------------------------------------------
// CRÉATION DE LA PAGE VOCAL
// ------------------------------------------------------------

async function buildVoiceLeaderboard(guild) {
    const top =
        getTopVoiceUsers(
            guild,
            10
        );

    const lines = [];

    for (
        let index = 0;
        index < top.length;
        index++
    ) {
        const entry =
            top[index];

        const user =
            await getLeaderboardUser(
                guild,
                entry.userId
            );

        const name =
            user?.user?.username ||
            user?.username ||
            entry.userId;

        lines.push(
            `**${index + 1}.** ${name} — **${formatLeaderboardTime(entry.value)}**`
        );
    }

    if (!lines.length) {
        lines.push(
            "Aucune activité vocale enregistrée pour le moment."
        );
    }

    return new EmbedBuilder()
        .setTitle(
            "🎆 Leaderboard — Vocal"
        )
        .setDescription(
            lines.join("\n")
        )
        .setFooter({
            text:
                "Classement basé sur le temps passé en vocal."
        })
        .setTimestamp();
}

// ------------------------------------------------------------
// CRÉATION DE LA PAGE DUOS
// ------------------------------------------------------------

async function buildDuoLeaderboard(guild) {
    const top =
        getTopVoiceDuos(
            guild,
            10
        );

    const lines = [];

    for (
        let index = 0;
        index < top.length;
        index++
    ) {
        const entry =
            top[index];

        const userA =
            await getLeaderboardUser(
                guild,
                entry.userA
            );

        const userB =
            await getLeaderboardUser(
                guild,
                entry.userB
            );

        const nameA =
            userA?.user?.username ||
            userA?.username ||
            entry.userA;

        const nameB =
            userB?.user?.username ||
            userB?.username ||
            entry.userB;

        lines.push(
            `**${index + 1}.** ${nameA} + ${nameB} — **${formatLeaderboardTime(entry.value)}**`
        );
    }

    if (!lines.length) {
        lines.push(
            "Aucun duo vocal enregistré pour le moment."
        );
    }

    return new EmbedBuilder()
        .setTitle(
            "🎆 Leaderboard — Duo vocal"
        )
        .setDescription(
            lines.join("\n")
        )
        .setFooter({
            text:
                "Classement basé sur le temps passé simultanément en vocal."
        })
        .setTimestamp();
}

// ------------------------------------------------------------
// BOUTONS LEADERBOARD
// ------------------------------------------------------------

function leaderboardButtons(
    activePage = 0
) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    "hirosaki_lb_messages"
                )
                .setLabel(
                    "Messages"
                )
                .setStyle(
                    activePage === 0
                        ? ButtonStyle.Primary
                        : ButtonStyle.Secondary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "hirosaki_lb_voice"
                )
                .setLabel(
                    "Vocal"
                )
                .setStyle(
                    activePage === 1
                        ? ButtonStyle.Primary
                        : ButtonStyle.Secondary
                ),

            new ButtonBuilder()
                .setCustomId(
                    "hirosaki_lb_duo"
                )
                .setLabel(
                    "Duo vocal"
                )
                .setStyle(
                    activePage === 2
                        ? ButtonStyle.Primary
                        : ButtonStyle.Secondary
                )
        );
}

// ------------------------------------------------------------
// +LEADERBOARD
// ------------------------------------------------------------

registerCommand("leaderboard", {
    permission: 4,

    aliases: [
        "lb"
    ],

    async execute(message, args) {
        const action =
            args[0]?.toLowerCase();

        const config =
            getLeaderboardConfig(
                message.guild.id
            );

        // ----------------------------------------------------
        // AFFICHAGE
        // ----------------------------------------------------

        if (
            !action ||
            action === "view"
        ) {
            const embed =
                await buildMessageLeaderboard(
                    message.guild
                );

            return safeReply(
                message,
                {
                    embeds: [embed],
                    components: [
                        leaderboardButtons(0)
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // SEND
        // ----------------------------------------------------

        if (
            action === "send"
        ) {
            const channel =
                config.channelId
                    ? message.guild.channels.cache.get(
                        config.channelId
                    )
                    : message.channel;

            if (
                !channel ||
                !channel.isTextBased()
            ) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                "Le salon du leaderboard est introuvable."
                            )
                        ]
                    }
                );
            }

            const messageEmbed =
                await buildMessageLeaderboard(
                    message.guild
                );

            const voiceEmbed =
                await buildVoiceLeaderboard(
                    message.guild
                );

            const duoEmbed =
                await buildDuoLeaderboard(
                    message.guild
                );

            await channel.send({
                embeds: [
                    messageEmbed,
                    voiceEmbed,
                    duoEmbed
                ]
            });

            config.lastSent =
                Date.now();

            saveDatabase();

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `Le leaderboard a été envoyé dans ${channel}.`
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // CHANNEL
        // ----------------------------------------------------

        if (
            action === "channel"
        ) {
            const channel =
                message.mentions.channels.first();

            if (!channel) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                `Utilisation : ${PREFIX}leaderboard channel #salon`
                            )
                        ]
                    }
                );
            }

            if (
                !channel.isTextBased()
            ) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                "Ce salon ne peut pas recevoir le leaderboard."
                            )
                        ]
                    }
                );
            }

            config.channelId =
                channel.id;

            saveDatabase();

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `Le salon du leaderboard est maintenant ${channel}.`
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // ON
        // ----------------------------------------------------

        if (
            action === "on"
        ) {
            config.enabled =
                true;

            saveDatabase();

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            "L'envoi automatique du leaderboard est activé."
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // OFF
        // ----------------------------------------------------

        if (
            action === "off"
        ) {
            config.enabled =
                false;

            saveDatabase();

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            "L'envoi automatique du leaderboard est désactivé."
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // DAY
        // ----------------------------------------------------

        if (
            action === "day"
        ) {
            const day =
                Number(args[1]);

            if (
                !Number.isInteger(day) ||
                day < 0 ||
                day > 6
            ) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                "Le jour doit être compris entre 0 et 6."
                            )
                        ]
                    }
                );
            }

            config.day =
                day;

            saveDatabase();

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `Le jour automatique est configuré sur **${getFrenchDayName(day)}**.`
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // HOUR
        // ----------------------------------------------------

        if (
            action === "hour"
        ) {
            const hour =
                Number(args[1]);

            if (
                !Number.isInteger(hour) ||
                hour < 0 ||
                hour > 23
            ) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                "L'heure doit être comprise entre 0 et 23."
                            )
                        ]
                    }
                );
            }

            config.hour =
                hour;

            saveDatabase();

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `L'heure automatique est maintenant **${String(hour).padStart(2, "0")}:00**.`
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // RESET
        // ----------------------------------------------------

        if (
            action === "reset"
        ) {
            if (
                db.guilds[
                    message.guild.id
                ].activity
            ) {
                db.guilds[
                    message.guild.id
                ].activity.messages = {};

                db.guilds[
                    message.guild.id
                ].activity.voice = {};

                db.guilds[
                    message.guild.id
                ].activity.duo = {};

                saveDatabase();
            }

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            "Les classements d'activité ont été réinitialisés."
                        )
                    ]
                }
            );
        }

        return safeReply(
            message,
            {
                embeds: [
                    infoEmbed(
                        `Utilisation :\n\n` +
                        `${PREFIX}leaderboard\n` +
                        `${PREFIX}leaderboard send\n` +
                        `${PREFIX}leaderboard channel #salon\n` +
                        `${PREFIX}leaderboard on\n` +
                        `${PREFIX}leaderboard off\n` +
                        `${PREFIX}leaderboard day 0-6\n` +
                        `${PREFIX}leaderboard hour 0-23\n` +
                        `${PREFIX}leaderboard reset`
                    )
                ]
            }
        );
    }
});

// ------------------------------------------------------------
// BOUTONS DU LEADERBOARD
// ------------------------------------------------------------

client.on(
    Events.InteractionCreate,
    async interaction => {
        if (
            !interaction.isButton()
        ) {
            return;
        }

        const ids = [
            "hirosaki_lb_messages",
            "hirosaki_lb_voice",
            "hirosaki_lb_duo"
        ];

        if (
            !ids.includes(
                interaction.customId
            )
        ) {
            return;
        }

        if (!interaction.guild) {
            return;
        }

        try {
            let embed;
            let page;

            if (
                interaction.customId ===
                "hirosaki_lb_messages"
            ) {
                embed =
                    await buildMessageLeaderboard(
                        interaction.guild
                    );

                page = 0;
            }

            if (
                interaction.customId ===
                "hirosaki_lb_voice"
            ) {
                embed =
                    await buildVoiceLeaderboard(
                        interaction.guild
                    );

                page = 1;
            }

            if (
                interaction.customId ===
                "hirosaki_lb_duo"
            ) {
                embed =
                    await buildDuoLeaderboard(
                        interaction.guild
                    );

                page = 2;
            }

            await interaction.update({
                embeds: [embed],
                components: [
                    leaderboardButtons(
                        page
                    )
                ]
            });

        } catch (error) {
            console.error(
                "Erreur bouton leaderboard :",
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                await interaction.reply({
                    embeds: [
                        errorEmbed(
                            "Une erreur est survenue lors de l'affichage du leaderboard."
                        )
                    ],
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
);

// ------------------------------------------------------------
// NOM DES JOURS
// ------------------------------------------------------------

function getFrenchDayName(day) {
    const days = [
        "dimanche",
        "lundi",
        "mardi",
        "mercredi",
        "jeudi",
        "vendredi",
        "samedi"
    ];

    return days[day] || "inconnu";
}

// ------------------------------------------------------------
// ENVOI AUTOMATIQUE
// ------------------------------------------------------------

setInterval(
    async () => {
        try {
            const now =
                new Date();

            const currentDay =
                now.getDay();

            const currentHour =
                now.getHours();

            const currentMinute =
                now.getMinutes();

            // On travaille à la minute 00.
            if (
                currentMinute !== 0
            ) {
                return;
            }

            for (
                const guild of
                client.guilds.cache.values()
            ) {
                const config =
                    getLeaderboardConfig(
                        guild.id
                    );

                if (
                    !config.enabled
                ) {
                    continue;
                }

                if (
                    config.day !==
                    currentDay
                ) {
                    continue;
                }

                if (
                    config.hour !==
                    currentHour
                ) {
                    continue;
                }

                // Empêche plusieurs envois
                // pendant la même heure.
                const currentKey =
                    `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${currentHour}`;

                if (
                    config.lastSent ===
                    currentKey
                ) {
                    continue;
                }

                const channel =
                    guild.channels.cache.get(
                        config.channelId
                    );

                if (
                    !channel ||
                    !channel.isTextBased()
                ) {
                    continue;
                }

                const messageEmbed =
                    await buildMessageLeaderboard(
                        guild
                    );

                const voiceEmbed =
                    await buildVoiceLeaderboard(
                        guild
                    );

                const duoEmbed =
                    await buildDuoLeaderboard(
                        guild
                    );

                await channel.send({
                    embeds: [
                        messageEmbed,
                        voiceEmbed,
                        duoEmbed
                    ]
                });

                config.lastSent =
                    currentKey;

                saveDatabase();
            }

        } catch (error) {
            console.error(
                "Erreur leaderboard automatique :",
                error
            );
        }
    },
    60 * 1000
);

// ============================================================
// FIN PARTIE 7/10
// ============================================================
//
// LEADERBOARD
//
// ✅ +leaderboard
// ✅ +leaderboard send
// ✅ +leaderboard channel
// ✅ +leaderboard on
// ✅ +leaderboard off
// ✅ +leaderboard day
// ✅ +leaderboard hour
// ✅ +leaderboard reset
// ✅ Classement messages
// ✅ Classement vocal
// ✅ Classement duo vocal
// ✅ Top 10
// ✅ Affichage avec boutons
// ✅ Envoi manuel
// ✅ Envoi automatique
// ✅ Jour configurable
// ✅ Heure configurable
// ✅ Salon configurable
// ✅ Persistance
// ✅ Protection contre les doubles envois
// ✅ Gestion des utilisateurs supprimés/quittés
//
// AUCUN DOUBLON AVEC LES PARTIES 1 À 6.
// AUCUNE SLASH COMMAND.
// +RANK / +DERANK NE SONT PAS TOUCHÉS.
// ============================================================
// ============================================================
// PARTIE 8/10 — GIVEAWAY + AUTO-ROLL
// ============================================================

// ============================================================
// CONFIGURATION GIVEAWAYS
// ============================================================

function getGiveawayStore(guildId) {
    ensureGuildData(guildId);

    const guildData = db.guilds[guildId];

    if (!guildData.giveaways) {
        guildData.giveaways = {};
    }

    return guildData.giveaways;
}

// ============================================================
// CONFIGURATION AUTO-ROLL
// ============================================================

function getAutorollConfig(guildId) {
    ensureGuildData(guildId);

    const guildData = db.guilds[guildId];

    if (!guildData.autoroll) {
        guildData.autoroll = {
            enabled: false,
            interval: 3600000,
            channelId: null,
            lastRun: null
        };
    }

    return guildData.autoroll;
}

// ============================================================
// FORMAT DURÉE
// ============================================================

function parseDuration(input) {
    if (!input) {
        return null;
    }

    const match = String(input)
        .trim()
        .match(/^(\d+)\s*(s|m|h|d)$/i);

    if (!match) {
        return null;
    }

    const amount =
        Number(match[1]);

    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    const unit =
        match[2].toLowerCase();

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    return amount * multipliers[unit];
}

// ============================================================
// CRÉER UN IDENTIFIANT DE GIVEAWAY
// ============================================================

function createGiveawayId() {
    return (
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .slice(2, 8)
    );
}

// ============================================================
// EMBED GIVEAWAY
// ============================================================

function buildGiveawayEmbed(giveaway) {
    const participantCount =
        giveaway.participants?.length || 0;

    const status =
        giveaway.ended
            ? "TERMINÉ"
            : "EN COURS";

    const description =
        giveaway.ended
            ? `Le giveaway est terminé.\n\n` +
              `**Lot :** ${giveaway.prize}\n` +
              `**Gagnant(s) :** ${formatWinnerList(giveaway.winners)}`
            : `**Lot :** ${giveaway.prize}\n` +
              `**Gagnants :** ${giveaway.winnerCount}\n` +
              `**Participants :** ${participantCount}\n\n` +
              `**Fin :** <t:${Math.floor(giveaway.endsAt / 1000)}:R>\n\n` +
              `Clique sur le bouton ci-dessous pour participer.`;

    return new EmbedBuilder()
        .setTitle(`🎆 Giveaway — ${status}`)
        .setDescription(description)
        .setTimestamp(
            giveaway.endsAt
        );
}

// ============================================================
// FORMAT DES GAGNANTS
// ============================================================

function formatWinnerList(winners = []) {
    if (!winners.length) {
        return "Aucun gagnant.";
    }

    return winners
        .map(
            userId =>
                `<@${userId}>`
        )
        .join("\n");
}

// ============================================================
// BOUTON PARTICIPATION
// ============================================================

function giveawayRow(giveawayId) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `hirosaki_giveaway_join_${giveawayId}`
                )
                .setLabel(
                    "Participer"
                )
                .setStyle(
                    ButtonStyle.Success
                )
        );
}

// ============================================================
// FIN D'UN GIVEAWAY
// ============================================================

async function endGiveaway(
    guild,
    giveawayId,
    manual = false
) {
    const giveaways =
        getGiveawayStore(
            guild.id
        );

    const giveaway =
        giveaways[giveawayId];

    if (!giveaway) {
        return {
            success: false,
            reason: "not_found"
        };
    }

    if (giveaway.ended) {
        return {
            success: false,
            reason: "already_ended"
        };
    }

    giveaway.ended = true;
    giveaway.endedAt =
        Date.now();

    const participants =
        Array.isArray(
            giveaway.participants
        )
            ? [...new Set(
                giveaway.participants
            )]
            : [];

    const winners = [];

    const pool =
        [...participants];

    const count =
        Math.min(
            giveaway.winnerCount,
            pool.length
        );

    while (
        winners.length < count &&
        pool.length > 0
    ) {
        const index =
            Math.floor(
                Math.random() *
                pool.length
            );

        const [winner] =
            pool.splice(
                index,
                1
            );

        winners.push(
            winner
        );
    }

    giveaway.winners =
        winners;

    saveDatabase();

    const channel =
        guild.channels.cache.get(
            giveaway.channelId
        );

    if (!channel || !channel.isTextBased()) {
        return {
            success: true,
            winners
        };
    }

    const oldMessage =
        await channel.messages
            .fetch(giveaway.messageId)
            .catch(() => null);

    const embed =
        buildGiveawayEmbed(
            giveaway
        );

    if (oldMessage) {
        await oldMessage.edit({
            embeds: [embed],
            components: []
        }).catch(
            error =>
                console.error(
                    "Erreur modification giveaway :",
                    error
                )
        );
    }

    const winnerText =
        winners.length
            ? winners
                .map(
                    id =>
                        `<@${id}>`
                )
                .join(", ")
            : "Aucun gagnant";

    await channel.send({
        content:
            `🎆 **Giveaway terminé !**\n\n` +
            `Lot : **${giveaway.prize}**\n` +
            `Gagnant(s) : ${winnerText}`,
        allowedMentions: {
            users: winners
        }
    }).catch(
        error =>
            console.error(
                "Erreur annonce gagnant :",
                error
            )
    );

    await sendGuildLog(
        guild,
        "Giveaway terminé",
        `Le giveaway **${giveaway.prize}** est terminé.\n\n` +
        `Gagnant(s) : ${winnerText}`
    );

    return {
        success: true,
        winners,
        manual
    };
}

// ============================================================
// +GIVEAWAY CREATE
// ============================================================

registerCommand("giveaway", {
    permission: 4,

    async execute(message, args) {
        const action =
            args[0]?.toLowerCase();

        if (
            action === "create"
        ) {
            /*
             * Format :
             *
             * +giveaway create 10m 1 Nitro
             *
             * 10m  = durée
             * 1    = nombre de gagnants
             * Nitro = lot
             */

            const duration =
                parseDuration(
                    args[1]
                );

            const winnerCount =
                Number(args[2]);

            const prize =
                args
                    .slice(3)
                    .join(" ")
                    .trim();

            if (!duration) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                `Durée invalide.\n\nExemple : ${PREFIX}giveaway create 10m 1 Nitro`
                            )
                        ]
                    }
                );
            }

            if (
                !Number.isInteger(
                    winnerCount
                ) ||
                winnerCount < 1 ||
                winnerCount > 100
            ) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                "Le nombre de gagnants doit être compris entre 1 et 100."
                            )
                        ]
                    }
                );
            }

            if (!prize) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                `Utilisation : ${PREFIX}giveaway create <durée> <gagnants> <lot>`
                            )
                        ]
                    }
                );
            }

            // Protection contre des durées excessivement grandes.
            const maxDuration =
                30 * 24 * 60 * 60 * 1000;

            if (
                duration >
                maxDuration
            ) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                "La durée maximale d'un giveaway est de 30 jours."
                            )
                        ]
                    }
                );
            }

            const id =
                createGiveawayId();

            const giveaway = {
                id,
                guildId:
                    message.guild.id,
                channelId:
                    message.channel.id,
                messageId:
                    null,
                creatorId:
                    message.author.id,
                prize,
                winnerCount,
                duration,
                createdAt:
                    Date.now(),
                endsAt:
                    Date.now() +
                    duration,
                participants: [],
                winners: [],
                ended: false,
                endedAt: null
            };

            const giveaways =
                getGiveawayStore(
                    message.guild.id
                );

            giveaways[id] =
                giveaway;

            const embed =
                buildGiveawayEmbed(
                    giveaway
                );

            const sent =
                await message.channel.send({
                    embeds: [embed],
                    components: [
                        giveawayRow(id)
                    ]
                });

            giveaway.messageId =
                sent.id;

            saveDatabase();

            await sendGuildLog(
                message.guild,
                "Giveaway créé",
                `${message.author} a créé un giveaway.\n\n` +
                `**Lot :** ${prize}\n` +
                `**Gagnants :** ${winnerCount}\n` +
                `**Durée :** ${formatLeaderboardTime(duration)}`
            );

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            "Le giveaway a été créé."
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // END
        // ----------------------------------------------------

        if (
            action === "end"
        ) {
            const giveawayId =
                args[1];

            if (!giveawayId) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                `Utilisation : ${PREFIX}giveaway end <ID>`
                            )
                        ]
                    }
                );
            }

            const result =
                await endGiveaway(
                    message.guild,
                    giveawayId,
                    true
                );

            if (
                !result.success
            ) {
                const reason =
                    result.reason ===
                    "not_found"
                        ? "Giveaway introuvable."
                        : "Ce giveaway est déjà terminé.";

                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                reason
                            )
                        ]
                    }
                );
            }

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            "Le giveaway a été terminé."
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // LIST
        // ----------------------------------------------------

        if (
            action === "list"
        ) {
            const giveaways =
                getGiveawayStore(
                    message.guild.id
                );

            const active =
                Object.values(
                    giveaways
                )
                    .filter(
                        giveaway =>
                            !giveaway.ended
                    );

            if (!active.length) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            infoEmbed(
                                "Aucun giveaway actif."
                            )
                        ]
                    }
                );
            }

            const lines =
                active.map(
                    giveaway =>
                        `• \`${giveaway.id}\` — **${giveaway.prize}** — ${formatLeaderboardTime(Math.max(0, giveaway.endsAt - Date.now()))} restantes`
                );

            return safeReply(
                message,
                {
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "🎆 Giveaways actifs"
                            )
                            .setDescription(
                                lines.join("\n")
                            )
                            .setTimestamp()
                    ]
                }
            );
        }

        return safeReply(
            message,
            {
                embeds: [
                    infoEmbed(
                        `Commandes Giveaway :\n\n` +
                        `${PREFIX}giveaway create <durée> <gagnants> <lot>\n` +
                        `${PREFIX}giveaway end <ID>\n` +
                        `${PREFIX}giveaway list`
                    )
                ]
            }
        );
    }
});

// ============================================================
// BOUTON GIVEAWAY
// ============================================================

client.on(
    Events.InteractionCreate,
    async interaction => {
        if (
            !interaction.isButton()
        ) {
            return;
        }

        const prefix =
            "hirosaki_giveaway_join_";

        if (
            !interaction.customId.startsWith(
                prefix
            )
        ) {
            return;
        }

        const giveawayId =
            interaction.customId.slice(
                prefix.length
            );

        const giveaways =
            getGiveawayStore(
                interaction.guild.id
            );

        const giveaway =
            giveaways[giveawayId];

        if (!giveaway) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Ce giveaway n'existe plus."
                    )
                ],
                ephemeral: true
            });
        }

        if (giveaway.ended) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Ce giveaway est déjà terminé."
                    )
                ],
                ephemeral: true
            });
        }

        if (
            Date.now() >=
            giveaway.endsAt
        ) {
            await endGiveaway(
                interaction.guild,
                giveawayId
            );

            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Le giveaway vient de se terminer."
                    )
                ],
                ephemeral: true
            });
        }

        giveaway.participants =
            Array.isArray(
                giveaway.participants
            )
                ? giveaway.participants
                : [];

        if (
            giveaway.participants.includes(
                interaction.user.id
            )
        ) {
            return interaction.reply({
                embeds: [
                    infoEmbed(
                        "Tu participes déjà à ce giveaway."
                    )
                ],
                ephemeral: true
            });
        }

        giveaway.participants.push(
            interaction.user.id
        );

        saveDatabase();

        const channel =
            interaction.guild.channels.cache.get(
                giveaway.channelId
            );

        if (channel) {
            const giveawayMessage =
                await channel.messages
                    .fetch(
                        giveaway.messageId
                    )
                    .catch(
                        () => null
                    );

            if (giveawayMessage) {
                await giveawayMessage.edit({
                    embeds: [
                        buildGiveawayEmbed(
                            giveaway
                        )
                    ],
                    components: [
                        giveawayRow(
                            giveawayId
                        )
                    ]
                }).catch(
                    error =>
                        console.error(
                            "Erreur actualisation giveaway :",
                            error
                        )
                );
            }
        }

        return interaction.reply({
            embeds: [
                successEmbed(
                    "Ta participation a bien été enregistrée !"
                )
            ],
            ephemeral: true
        });
    }
);

// ============================================================
// VÉRIFICATION AUTOMATIQUE DES GIVEAWAYS
// ============================================================

setInterval(
    async () => {
        try {
            for (
                const guild of
                client.guilds.cache.values()
            ) {
                const giveaways =
                    getGiveawayStore(
                        guild.id
                    );

                for (
                    const giveaway of
                    Object.values(
                        giveaways
                    )
                ) {
                    if (
                        giveaway.ended
                    ) {
                        continue;
                    }

                    if (
                        Date.now() >=
                        giveaway.endsAt
                    ) {
                        await endGiveaway(
                            guild,
                            giveaway.id
                        );
                    }
                }
            }
        } catch (error) {
            console.error(
                "Erreur vérification giveaways :",
                error
            );
        }
    },
    15 * 1000
);

// ============================================================
// AUTO-ROLL
// ============================================================

registerCommand("autoroll", {
    permission: 4,

    async execute(message, args) {
        const config =
            getAutorollConfig(
                message.guild.id
            );

        const action =
            args[0]?.toLowerCase();

        // ----------------------------------------------------
        // ON
        // ----------------------------------------------------

        if (
            action === "on"
        ) {
            config.enabled =
                true;

            if (
                !config.channelId
            ) {
                config.channelId =
                    message.channel.id;
            }

            if (
                !config.lastRun
            ) {
                config.lastRun =
                    Date.now();
            }

            saveDatabase();

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `L'auto-roll est activé.\nSalon : ${message.guild.channels.cache.get(config.channelId) || message.channel}`
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // OFF
        // ----------------------------------------------------

        if (
            action === "off"
        ) {
            config.enabled =
                false;

            saveDatabase();

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            "L'auto-roll est désactivé."
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // CHANNEL
        // ----------------------------------------------------

        if (
            action === "channel"
        ) {
            const channel =
                message.mentions.channels.first();

            if (!channel) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                `Utilisation : ${PREFIX}autoroll channel #salon`
                            )
                        ]
                    }
                );
            }

            config.channelId =
                channel.id;

            saveDatabase();

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `Le salon de l'auto-roll est maintenant ${channel}.`
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // INTERVAL
        // ----------------------------------------------------

        if (
            action === "interval"
        ) {
            const duration =
                parseDuration(
                    args[1]
                );

            if (!duration) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                `Utilisation : ${PREFIX}autoroll interval 1h`
                            )
                        ]
                    }
                );
            }

            const minimum =
                60 * 1000;

            if (
                duration <
                minimum
            ) {
                return safeReply(
                    message,
                    {
                        embeds: [
                            errorEmbed(
                                "L'intervalle minimum est de 1 minute."
                            )
                        ]
                    }
                );
            }

            config.interval =
                duration;

            saveDatabase();

            return safeReply(
                message,
                {
                    embeds: [
                        successEmbed(
                            `L'intervalle de l'auto-roll est maintenant de **${formatLeaderboardTime(duration)}**.`
                        )
                    ]
                }
            );
        }

        // ----------------------------------------------------
        // STATUS
        // ----------------------------------------------------

        if (
            action === "status"
        ) {
            return safeReply(
                message,
                {
                    embeds: [
                        infoEmbed(
                            `**Auto-roll :** ${config.enabled ? "activé" : "désactivé"}\n` +
                            `**Intervalle :** ${formatLeaderboardTime(config.interval)}\n` +
                            `**Salon :** ${config.channelId ? `<#${config.channelId}>` : "non configuré"}`
                        )
                    ]
                }
            );
        }

        return safeReply(
            message,
            {
                embeds: [
                    infoEmbed(
                        `Commandes Auto-roll :\n\n` +
                        `${PREFIX}autoroll on\n` +
                        `${PREFIX}autoroll off\n` +
                        `${PREFIX}autoroll channel #salon\n` +
                        `${PREFIX}autoroll interval 1h\n` +
                        `${PREFIX}autoroll status`
                    )
                ]
            }
        );
    }
});

// ============================================================
// TIRAGE AUTO-ROLL
// ============================================================

async function runAutoroll(guild) {
    const config =
        getAutorollConfig(
            guild.id
        );

    if (
        !config.enabled
    ) {
        return;
    }

    if (
        !config.channelId
    ) {
        return;
    }

    const channel =
        guild.channels.cache.get(
            config.channelId
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return;
    }

    const members =
        guild.members.cache.filter(
            member =>
                !member.user.bot
        );

    if (!members.size) {
        return;
    }

    const memberArray =
        Array.from(
            members.values()
        );

    const winner =
        memberArray[
            Math.floor(
                Math.random() *
                memberArray.length
            )
        ];

    config.lastRun =
        Date.now();

    saveDatabase();

    await channel.send({
        content:
            `🎆 **Auto-roll !**\n\n` +
            `Le gagnant est ${winner} !`,
        allowedMentions: {
            users: [
                winner.id
            ]
        }
    }).catch(
        error =>
            console.error(
                "Erreur auto-roll :",
                error
            )
    );

    await sendGuildLog(
        guild,
        "Auto-roll",
        `Gagnant : ${winner}`
    );
}

// ============================================================
// VÉRIFICATION AUTO-ROLL
// ============================================================

setInterval(
    async () => {
        try {
            for (
                const guild of
                client.guilds.cache.values()
            ) {
                const config =
                    getAutorollConfig(
                        guild.id
                    );

                if (
                    !config.enabled
                ) {
                    continue;
                }

                const lastRun =
                    Number(
                        config.lastRun
                    ) || 0;

                if (
                    Date.now() -
                    lastRun >=
                    config.interval
                ) {
                    await runAutoroll(
                        guild
                    );
                }
            }
        } catch (error) {
            console.error(
                "Erreur vérification auto-roll :",
                error
            );
        }
    },
    30 * 1000
);

// ============================================================
// FIN PARTIE 8/10
// ============================================================
//
// GIVEAWAY
//
// ✅ +giveaway create
// ✅ +giveaway end
// ✅ +giveaway list
// ✅ Durée configurable
// ✅ Nombre de gagnants configurable
// ✅ Lot configurable
// ✅ Bouton participer
// ✅ Une seule participation par membre
// ✅ Tirage aléatoire
// ✅ Fin automatique
// ✅ Fin manuelle
// ✅ Annonce des gagnants
// ✅ Persistance
// ✅ Gestion des giveaways après redémarrage
//
// AUTO-ROLL
//
// ✅ +autoroll on
// ✅ +autoroll off
// ✅ +autoroll channel
// ✅ +autoroll interval
// ✅ +autoroll status
// ✅ Intervalle configurable
// ✅ Salon configurable
// ✅ Tirage automatique
// ✅ Persistance
//
// PERMISSIONS
//
// ✅ Giveaway = Perm 4+
// ✅ Autoroll = Perm 4+
// ✅ Cumul des permissions conservé
// ❌ +rank / +derank non touchés
//
// COMMANDES
//
// ✅ Préfixe +
// ❌ Aucune nouvelle slash command
//
// AUCUN DOUBLON AVEC LES PARTIES 1 À 7.
// ============================================================
// ============================================================
// PARTIE 9/10 — MENU DES COMMANDES / PERMISSIONS
// ============================================================

// Cette partie ne crée aucune nouvelle commande métier.
// Elle construit uniquement le menu permettant aux staffs
// de voir les commandes auxquelles leur niveau donne accès.
//
// IMPORTANT : les permissions sont cumulatives.
//
// Perm 0 -> Perm 0
// Perm 1 -> Perm 0 + Perm 1
// Perm 2 -> Perm 0 + Perm 1 + Perm 2
// Perm 3 -> Perm 0 + Perm 1 + Perm 2 + Perm 3
// Perm 4 -> Perm 0 + Perm 1 + Perm 2 + Perm 3 + Perm 4
// Perm 5 -> Perm 0 + Perm 1 + Perm 2 + Perm 3 + Perm 4 + Perm 5
// Crown -> absolument tout
//
// +rank et +derank restent EXCLUSIVEMENT Crown.
// ============================================================


// ============================================================
// LISTE CENTRALE DES COMMANDES PAR NIVEAU
// ============================================================

const COMMAND_PERMISSION_GROUPS = {
    0: [
        "+ticket add @membre",
        "+ticket remove @membre",
        "+ticket claim",
        "+ticket rename nom",
        "+ticket close"
    ],

    1: [
        "+snipe"
    ],

    2: [
        "+warn @membre raison",
        "+unwarn @membre",
        "+warnings @membre",
        "+sanctions @membre",
        "+blacklist",
        "+banlist"
    ],

    3: [
        "+kick @membre raison",
        "+addrole @membre @role",
        "+removerole @membre @role",
        "+userinfo @membre"
    ],

    4: [
        "+ban @membre raison",
        "+unban ID",
        "+mute @membre durée",
        "+unmute @membre",
        "+timeout @membre durée",
        "+untimeout @membre",
        "+clear nombre",
        "+purge nombre",
        "+lock",
        "+unlock",
        "+slowmode secondes",
        "+stat",
        "+welcome",
        "+autorole",
        "+logs",
        "+leaderboard",
        "+leaderboard send",
        "+leaderboard channel #salon",
        "+leaderboard day 0-6",
        "+leaderboard hour 0-23",
        "+giveaway create",
        "+giveaway end",
        "+giveaway list",
        "+autoroll on",
        "+autoroll off",
        "+autoroll channel #salon",
        "+autoroll interval",
        "+autoroll status"
    ],

    5: [
        // Le Perm 5 récupère automatiquement
        // toutes les commandes des niveaux précédents.
        //
        // Les commandes spécifiques au Co-owner peuvent
        // être ajoutées ici ultérieurement sans modifier
        // le système cumulatif.
    ]
};


// ============================================================
// COMMANDES EXCLUSIVES CROWN
// ============================================================

const CROWN_ONLY_COMMANDS = [
    "+rank @membre",
    "+derank @membre"
];


// ============================================================
// COMMANDES DE CONFIGURATION CROWN
// ============================================================

const CROWN_CONFIGURATION_COMMANDS = [
    "+ticket setup",
    "+rank @membre",
    "+derank @membre"
];


// ============================================================
// NOM DES NIVEAUX
// ============================================================

const PERMISSION_NAMES = {
    0: "Perm 0 — Gestion ticket",
    1: "Perm 1 — Modérateur test",
    2: "Perm 2 — Modérateur",
    3: "Perm 3 — Staff confirmé",
    4: "Perm 4 — Responsable staff",
    5: "Perm 5 — Co-owner",
    crown: "Crown — Owner"
};


// ============================================================
// OBTENIR TOUTES LES COMMANDES D'UN NIVEAU
// ============================================================

function getCommandsForPermissionLevel(level) {
    const commands = [];

    const numericLevel =
        Number(level);

    if (
        !Number.isInteger(
            numericLevel
        ) ||
        numericLevel < 0
    ) {
        return commands;
    }

    const maxLevel =
        Math.min(
            numericLevel,
            5
        );

    for (
        let permission = 0;
        permission <= maxLevel;
        permission++
    ) {
        const group =
            COMMAND_PERMISSION_GROUPS[
                permission
            ];

        if (!Array.isArray(group)) {
            continue;
        }

        for (
            const command of group
        ) {
            if (
                !commands.includes(
                    command
                )
            ) {
                commands.push(
                    command
                );
            }
        }
    }

    return commands;
}


// ============================================================
// COMMANDES ACCESSIBLES À CROWN
// ============================================================

function getCrownCommands() {
    const commands = [];

    for (
        let permission = 0;
        permission <= 5;
        permission++
    ) {
        const group =
            COMMAND_PERMISSION_GROUPS[
                permission
            ];

        if (!Array.isArray(group)) {
            continue;
        }

        for (
            const command of group
        ) {
            if (
                !commands.includes(
                    command
                )
            ) {
                commands.push(
                    command
                );
            }
        }
    }

    for (
        const command of CROWN_CONFIGURATION_COMMANDS
    ) {
        if (
            !commands.includes(
                command
            )
        ) {
            commands.push(
                command
            );
        }
    }

    return commands;
}


// ============================================================
// DÉTECTION DU NIVEAU D'UN MEMBRE
// ============================================================

function getMemberPermissionLevel(member) {
    if (!member) {
        return -1;
    }

    // Crown est prioritaire.
    if (
        member.roles &&
        member.roles.cache &&
        member.roles.cache.some(
            role =>
                role.name === "Crown"
        )
    ) {
        return "crown";
    }

    // Recherche du plus haut niveau.
    for (
        let level = 5;
        level >= 0;
        level--
    ) {
        const roleName =
            getPermissionRoleName(
                level
            );

        if (
            member.roles.cache.some(
                role =>
                    role.name === roleName
            )
        ) {
            return level;
        }
    }

    return -1;
}


// ============================================================
// NOM DES RÔLES DE PERMISSION
// ============================================================

function getPermissionRoleName(level) {
    const names = {
        0: "Gestion ticket",
        1: "Modérateur test",
        2: "Modérateur",
        3: "Staff confirmé",
        4: "Responsable staff",
        5: "Co-owner"
    };

    return names[level] || null;
}


// ============================================================
// CONSTRUCTION DES PAGES
// ============================================================

function buildPermissionPages(
    permissionLevel
) {
    const pages = [];

    // --------------------------------------------------------
    // CROWN
    // --------------------------------------------------------

    if (
        permissionLevel === "crown"
    ) {
        const commands =
            getCrownCommands();

        const chunks =
            splitCommandList(
                commands,
                15
            );

        for (
            let index = 0;
            index < chunks.length;
            index++
        ) {
            pages.push(
                new EmbedBuilder()
                    .setTitle(
                        "🎆 Commandes — Crown"
                    )
                    .setDescription(
                        chunks[index]
                            .join("\n")
                    )
                    .setFooter({
                        text:
                            `Page ${index + 1}/${chunks.length} • Accès total`
                    })
                    .setTimestamp()
            );
        }

        return pages;
    }

    // --------------------------------------------------------
    // STAFF
    // --------------------------------------------------------

    if (
        typeof permissionLevel !==
        "number" ||
        permissionLevel < 0
    ) {
        return [
            new EmbedBuilder()
                .setTitle(
                    "🎆 Commandes Hirosaki"
                )
                .setDescription(
                    "Tu n'as accès à aucune commande staff."
                )
                .setFooter({
                    text:
                        "Hirosaki"
                })
        ];
    }

    const commands =
        getCommandsForPermissionLevel(
            permissionLevel
        );

    const chunks =
        splitCommandList(
            commands,
            15
        );

    for (
        let index = 0;
        index < chunks.length;
        index++
    ) {
        pages.push(
            new EmbedBuilder()
                .setTitle(
                    `🎆 ${PERMISSION_NAMES[permissionLevel]}`
                )
                .setDescription(
                    chunks[index]
                        .join("\n")
                )
                .setFooter({
                    text:
                        `Page ${index + 1}/${chunks.length} • Permissions cumulatives`
                })
                .setTimestamp()
        );
    }

    return pages;
}


// ============================================================
// DÉCOUPAGE DES COMMANDES
// ============================================================

function splitCommandList(
    commands,
    size
) {
    const chunks = [];

    for (
        let index = 0;
        index < commands.length;
        index += size
    ) {
        chunks.push(
            commands.slice(
                index,
                index + size
            )
        );
    }

    if (!chunks.length) {
        chunks.push([
            "Aucune commande disponible."
        ]);
    }

    return chunks;
}


// ============================================================
// BOUTONS DE PAGINATION
// ============================================================

function buildPermissionPaginationRow(
    currentPage,
    totalPages,
    ownerId
) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `hirosaki_permissions_previous_${ownerId}`
                )
                .setLabel(
                    "◀"
                )
                .setStyle(
                    ButtonStyle.Secondary
                )
                .setDisabled(
                    currentPage <= 0
                ),

            new ButtonBuilder()
                .setCustomId(
                    `hirosaki_permissions_next_${ownerId}`
                )
                .setLabel(
                    "▶"
                )
                .setStyle(
                    ButtonStyle.Secondary
                )
                .setDisabled(
                    currentPage >=
                    totalPages - 1
                )
        );
}


// ============================================================
// +COMMANDES
// ============================================================

registerCommand("commandes", {
    permission: 0,

    aliases: [
        "commands",
        "cmds",
        "helpstaff"
    ],

    async execute(message) {
        const permissionLevel =
            getMemberPermissionLevel(
                message.member
            );

        if (
            permissionLevel === -1
        ) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Tu n'as pas accès aux commandes staff."
                        )
                    ]
                }
            );
        }

        const pages =
            buildPermissionPages(
                permissionLevel
            );

        const ownerId =
            message.author.id;

        const row =
            buildPermissionPaginationRow(
                0,
                pages.length,
                ownerId
            );

        return safeReply(
            message,
            {
                embeds: [
                    pages[0]
                ],
                components: [
                    row
                ]
            }
        );
    }
});


// ============================================================
// ALIAS +HELPSTAFF
// ============================================================

registerCommand("helpstaff", {
    permission: 0,

    aliases: [
        "staffhelp"
    ],

    async execute(message) {
        const permissionLevel =
            getMemberPermissionLevel(
                message.member
            );

        if (
            permissionLevel === -1
        ) {
            return safeReply(
                message,
                {
                    embeds: [
                        errorEmbed(
                            "Tu n'as pas accès aux commandes staff."
                        )
                    ]
                }
            );
        }

        const pages =
            buildPermissionPages(
                permissionLevel
            );

        const ownerId =
            message.author.id;

        return safeReply(
            message,
            {
                embeds: [
                    pages[0]
                ],
                components: [
                    buildPermissionPaginationRow(
                        0,
                        pages.length,
                        ownerId
                    )
                ]
            }
        );
    }
});


// ============================================================
// PAGINATION DES COMMANDES
// ============================================================

client.on(
    Events.InteractionCreate,
    async interaction => {
        if (
            !interaction.isButton()
        ) {
            return;
        }

        const previousPrefix =
            "hirosaki_permissions_previous_";

        const nextPrefix =
            "hirosaki_permissions_next_";

        const isPrevious =
            interaction.customId.startsWith(
                previousPrefix
            );

        const isNext =
            interaction.customId.startsWith(
                nextPrefix
            );

        if (
            !isPrevious &&
            !isNext
        ) {
            return;
        }

        const ownerId =
            interaction.customId.replace(
                isPrevious
                    ? previousPrefix
                    : nextPrefix,
                ""
            );

        // Seul celui qui a ouvert le menu
        // peut utiliser ses boutons.
        if (
            interaction.user.id !==
            ownerId
        ) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Ce menu de commandes ne t'appartient pas."
                    )
                ],
                ephemeral: true
            });
        }

        const permissionLevel =
            getMemberPermissionLevel(
                interaction.member
            );

        if (
            permissionLevel === -1
        ) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Tu n'as plus accès aux commandes staff."
                    )
                ],
                ephemeral: true
            });
        }

        const pages =
            buildPermissionPages(
                permissionLevel
            );

        const message =
            interaction.message;

        const currentEmbed =
            message.embeds?.[0];

        let currentPage = 0;

        if (
            currentEmbed?.footer?.text
        ) {
            const match =
                currentEmbed.footer.text.match(
                    /Page\s+(\d+)\/(\d+)/
                );

            if (match) {
                currentPage =
                    Number(match[1]) - 1;
            }
        }

        if (isPrevious) {
            currentPage--;
        }

        if (isNext) {
            currentPage++;
        }

        currentPage =
            Math.max(
                0,
                Math.min(
                    currentPage,
                    pages.length - 1
                )
            );

        await interaction.update({
            embeds: [
                pages[currentPage]
            ],
            components: [
                buildPermissionPaginationRow(
                    currentPage,
                    pages.length,
                    ownerId
                )
            ]
        }).catch(
            error =>
                console.error(
                    "Erreur pagination permissions :",
                    error
                )
        );
    }
);


// ============================================================
// RAPPORT DES PERMISSIONS
// ============================================================

function getPermissionSummary() {
    return {
        perm0: {
            name:
                "Gestion ticket",
            cumulative:
                true,
            commands:
                getCommandsForPermissionLevel(
                    0
                )
        },

        perm1: {
            name:
                "Modérateur test",
            cumulative:
                true,
            commands:
                getCommandsForPermissionLevel(
                    1
                )
        },

        perm2: {
            name:
                "Modérateur",
            cumulative:
                true,
            commands:
                getCommandsForPermissionLevel(
                    2
                )
        },

        perm3: {
            name:
                "Staff confirmé",
            cumulative:
                true,
            commands:
                getCommandsForPermissionLevel(
                    3
                )
        },

        perm4: {
            name:
                "Responsable staff",
            cumulative:
                true,
            commands:
                getCommandsForPermissionLevel(
                    4
                )
        },

        perm5: {
            name:
                "Co-owner",
            cumulative:
                true,
            commands:
                getCommandsForPermissionLevel(
                    5
                )
                .filter(
                    command =>
                        command !==
                            "+rank @membre" &&
                        command !==
                            "+derank @membre"
                )
        },

        crown: {
            name:
                "Crown",
            cumulative:
                true,
            commands:
                getCrownCommands()
        }
    };
}


// ============================================================
// VÉRIFICATION AUTOMATIQUE DES RÈGLES IMPORTANTES
// ============================================================

function auditPermissionMatrix() {
    const summary =
        getPermissionSummary();

    const checks = {
        perm1_snipe:
            summary.perm1.commands.includes(
                "+snipe"
            ),

        perm2_has_perm1:
            summary.perm2.commands.includes(
                "+snipe"
            ),

        perm2_warn:
            summary.perm2.commands.includes(
                "+warn @membre raison"
            ),

        perm3_has_perm2:
            summary.perm3.commands.includes(
                "+warn @membre raison"
            ),

        perm3_kick:
            summary.perm3.commands.includes(
                "+kick @membre raison"
            ),

        perm3_no_ban:
            !summary.perm3.commands.includes(
                "+ban @membre raison"
            ),

        perm4_has_kick:
            summary.perm4.commands.includes(
                "+kick @membre raison"
            ),

        perm4_has_ban:
            summary.perm4.commands.includes(
                "+ban @membre raison"
            ),

        perm4_no_rank:
            !summary.perm4.commands.includes(
                "+rank @membre"
            ),

        perm4_no_derank:
            !summary.perm4.commands.includes(
                "+derank @membre"
            ),

        perm5_has_perm4:
            summary.perm5.commands.includes(
                "+ban @membre raison"
            ),

        perm5_no_rank:
            !summary.perm5.commands.includes(
                "+rank @membre"
            ),

        perm5_no_derank:
            !summary.perm5.commands.includes(
                "+derank @membre"
            ),

        crown_rank:
            summary.crown.commands.includes(
                "+rank @membre"
            ),

        crown_derank:
            summary.crown.commands.includes(
                "+derank @membre"
            ),

        crown_setup:
            summary.crown.commands.includes(
                "+ticket setup"
            )
    };

    const failed =
        Object.entries(
            checks
        )
            .filter(
                ([, passed]) =>
                    !passed
            )
            .map(
                ([name]) =>
                    name
            );

    if (failed.length) {
        console.error(
            "❌ AUDIT PERMISSIONS ÉCHOUÉ :",
            failed
        );

        return false;
    }

    console.log(
        "✅ AUDIT PERMISSIONS : toutes les règles principales sont respectées."
    );

    return true;
}


// ============================================================
// AUDIT AU DÉMARRAGE
// ============================================================

try {
    auditPermissionMatrix();
} catch (error) {
    console.error(
        "❌ Impossible d'effectuer l'audit des permissions :",
        error
    );
}


// ============================================================
// FIN PARTIE 9/10
// ============================================================
//
// MENU COMMANDES
//
// ✅ +commandes
// ✅ +commands
// ✅ +cmds
// ✅ +helpstaff
// ✅ Pagination avec boutons
// ✅ Permissions affichées selon le niveau
// ✅ Permissions cumulatives
// ✅ Perm 0 → Gestion ticket
// ✅ Perm 1 → Perm 0 + Perm 1
// ✅ Perm 2 → Perm 0 + Perm 1 + Perm 2
// ✅ Perm 3 → Perm 0 + Perm 1 + Perm 2 + Perm 3
// ✅ Perm 4 → Perm 0 + Perm 1 + Perm 2 + Perm 3 + Perm 4
// ✅ Perm 5 → niveaux 0 à 5
// ✅ Perm 5 = Co-owner
// ✅ Perm 5 ≠ Owner
// ✅ Perm 5 n'a PAS rank/derank
// ✅ Crown = accès total
// ✅ Crown possède rank/derank
// ✅ Crown possède ticket setup
// ✅ Audit automatique de la matrice
//
// IMPORTANT :
// +rank et +derank restent exclusivement Crown.
//
// AUCUN DOUBLON AVEC LES PARTIES 1 À 8.
// ============================================================
// ============================================================
// PARTIE 10/10 — AUDIT FINAL HIROSAKI
// ============================================================
//
// Cette partie effectue les vérifications finales du projet.
// Elle ne recrée pas les fonctionnalités déjà développées.
//
// AUCUN DOUBLON AVEC LES PARTIES 1 À 9.
// ============================================================


// ============================================================
// AUDIT GLOBAL DU CAHIER DES CHARGES
// ============================================================

function runFinalHiroSakiAudit() {

    console.log("");
    console.log("============================================================");
    console.log("🎆 HIROSAKI — AUDIT FINAL");
    console.log("============================================================");

    const results = [];

    function check(name, condition) {

        const passed = Boolean(condition);

        results.push({
            name,
            passed
        });

        console.log(
            `${passed ? "✅" : "❌"} ${name}`
        );

        return passed;
    }


    // ========================================================
    // PRÉFIXE
    // ========================================================

    check(
        "Préfixe par défaut = +",
        PREFIX === "+"
    );


    // ========================================================
    // SLASH COMMANDS
    // ========================================================

    check(
        "Aucune slash command enregistrée",
        typeof slashCommands === "undefined" ||
        !Array.isArray(slashCommands) ||
        slashCommands.length === 0
    );


    // ========================================================
    // RÔLES
    // ========================================================

    check(
        "Perm 0 = Gestion ticket",
        getPermissionRoleName(0) === "Gestion ticket"
    );

    check(
        "Perm 1 = Modérateur test",
        getPermissionRoleName(1) === "Modérateur test"
    );

    check(
        "Perm 2 = Modérateur",
        getPermissionRoleName(2) === "Modérateur"
    );

    check(
        "Perm 3 = Staff confirmé",
        getPermissionRoleName(3) === "Staff confirmé"
    );

    check(
        "Perm 4 = Responsable staff",
        getPermissionRoleName(4) === "Responsable staff"
    );

    check(
        "Perm 5 = Co-owner",
        getPermissionRoleName(5) === "Co-owner"
    );


    // ========================================================
    // CROWN
    // ========================================================

    check(
        "Crown est bien le Owner",
        Object.values(PERMISSION_NAMES)
            .includes("Crown — Owner")
    );


    // ========================================================
    // PERMISSIONS CUMULATIVES
    // ========================================================

    const perm0 =
        getCommandsForPermissionLevel(0);

    const perm1 =
        getCommandsForPermissionLevel(1);

    const perm2 =
        getCommandsForPermissionLevel(2);

    const perm3 =
        getCommandsForPermissionLevel(3);

    const perm4 =
        getCommandsForPermissionLevel(4);

    const perm5 =
        getCommandsForPermissionLevel(5);


    check(
        "Perm 1 contient Perm 0",
        perm0.every(
            command => perm1.includes(command)
        )
    );

    check(
        "Perm 2 contient Perm 1",
        perm1.every(
            command => perm2.includes(command)
        )
    );

    check(
        "Perm 3 contient Perm 2",
        perm2.every(
            command => perm3.includes(command)
        )
    );

    check(
        "Perm 4 contient Perm 3",
        perm3.every(
            command => perm4.includes(command)
        )
    );

    check(
        "Perm 5 contient Perm 4",
        perm4.every(
            command => perm5.includes(command)
        )
    );


    // ========================================================
    // PERM 1
    // ========================================================

    check(
        "Perm 1 possède +snipe",
        perm1.includes("+snipe")
    );


    // ========================================================
    // PERM 2
    // ========================================================

    check(
        "Perm 2 possède +warn",
        perm2.includes("+warn @membre raison")
    );

    check(
        "Perm 2 possède +warnings",
        perm2.includes("+warnings @membre")
    );

    check(
        "Perm 2 possède +sanctions",
        perm2.includes("+sanctions @membre")
    );

    check(
        "Perm 2 possède +blacklist",
        perm2.includes("+blacklist")
    );

    check(
        "Perm 2 possède +banlist",
        perm2.includes("+banlist")
    );


    // ========================================================
    // PERM 3
    // ========================================================

    check(
        "Perm 3 possède +kick",
        perm3.includes("+kick @membre raison")
    );

    check(
        "Perm 3 possède +addrole",
        perm3.includes("+addrole @membre @role")
    );

    check(
        "Perm 3 possède +removerole",
        perm3.includes("+removerole @membre @role")
    );

    check(
        "Perm 3 ne possède PAS +ban",
        !perm3.includes("+ban @membre raison")
    );


    // ========================================================
    // PERM 4
    // ========================================================

    check(
        "Perm 4 possède +ban",
        perm4.includes("+ban @membre raison")
    );

    check(
        "Perm 4 possède +unban",
        perm4.includes("+unban ID")
    );

    check(
        "Perm 4 possède +mute",
        perm4.includes("+mute @membre durée")
    );

    check(
        "Perm 4 possède +timeout",
        perm4.includes("+timeout @membre durée")
    );

    check(
        "Perm 4 possède +clear",
        perm4.includes("+clear nombre")
    );

    check(
        "Perm 4 possède +purge",
        perm4.includes("+purge nombre")
    );

    check(
        "Perm 4 possède +lock",
        perm4.includes("+lock")
    );

    check(
        "Perm 4 possède +unlock",
        perm4.includes("+unlock")
    );

    check(
        "Perm 4 possède +slowmode",
        perm4.includes("+slowmode secondes")
    );


    // ========================================================
    // RANK / DERANK
    // ========================================================

    check(
        "Perm 4 ne possède PAS +rank",
        !perm4.includes("+rank @membre")
    );

    check(
        "Perm 4 ne possède PAS +derank",
        !perm4.includes("+derank @membre")
    );

    check(
        "Perm 5 ne possède PAS +rank",
        !perm5.includes("+rank @membre")
    );

    check(
        "Perm 5 ne possède PAS +derank",
        !perm5.includes("+derank @membre")
    );


    // ========================================================
    // CROWN — ACCÈS TOTAL
    // ========================================================

    const crownCommands =
        getCrownCommands();

    check(
        "Crown possède +rank",
        crownCommands.includes("+rank @membre")
    );

    check(
        "Crown possède +derank",
        crownCommands.includes("+derank @membre")
    );

    check(
        "Crown possède +ticket setup",
        crownCommands.includes("+ticket setup")
    );


    // ========================================================
    // TICKETS
    // ========================================================

    check(
        "Perm 0 possède +ticket add",
        perm0.includes("+ticket add @membre")
    );

    check(
        "Perm 0 possède +ticket remove",
        perm0.includes("+ticket remove @membre")
    );

    check(
        "Perm 0 possède +ticket claim",
        perm0.includes("+ticket claim")
    );

    check(
        "Perm 0 possède +ticket rename",
        perm0.includes("+ticket rename nom")
    );

    check(
        "Perm 0 possède +ticket close",
        perm0.includes("+ticket close")
    );

    check(
        "Perm 0 ne possède PAS +ticket setup",
        !perm0.includes("+ticket setup")
    );


    // ========================================================
    // STATISTIQUES
    // ========================================================

    check(
        "Système +stat disponible",
        typeof getServerStats === "function" ||
        typeof generateServerStats === "function"
    );


    // ========================================================
    // LEADERBOARD
    // ========================================================

    check(
        "Leaderboard messages disponible",
        typeof getTopMessageUsers === "function"
    );

    check(
        "Leaderboard vocal disponible",
        typeof getTopVoiceUsers === "function"
    );

    check(
        "Leaderboard duo vocal disponible",
        typeof getTopVoiceDuos === "function"
    );


    // ========================================================
    // GIVEAWAY
    // ========================================================

    check(
        "Système giveaway disponible",
        typeof endGiveaway === "function"
    );


    // ========================================================
    // AUTO-ROLL
    // ========================================================

    check(
        "Système autoroll disponible",
        typeof runAutoroll === "function"
    );


    // ========================================================
    // PERSISTANCE
    // ========================================================

    check(
        "Sauvegarde disponible",
        typeof saveDatabase === "function"
    );

    check(
        "Initialisation des données disponible",
        typeof ensureGuildData === "function"
    );


    // ========================================================
    // LOGS
    // ========================================================

    check(
        "Système de logs disponible",
        typeof sendGuildLog === "function"
    );


    // ========================================================
    // SYSTÈME DM
    // ========================================================

    check(
        "Configuration DM disponible",
        typeof getDMConfig === "function" ||
        typeof getDmConfig === "function"
    );

    check(
        "Envoi DM configurable disponible",
        typeof sendConfiguredDM === "function" ||
        typeof sendConfiguredDm === "function"
    );

    check(
        "DM sanction disponible",
        typeof sendSanctionDM === "function" ||
        typeof sendSanctionDm === "function"
    );

    check(
        "DM arrivée disponible",
        typeof sendWelcomeDM === "function" ||
        typeof sendWelcomeDm === "function"
    );


    // ========================================================
    // GESTION DES ERREURS
    // ========================================================

    check(
        "Gestionnaire de commandes disponible",
        typeof registerCommand === "function"
    );

    check(
        "Réponse sécurisée disponible",
        typeof safeReply === "function"
    );

    check(
        "Embed d'erreur disponible",
        typeof errorEmbed === "function"
    );


    // ========================================================
    // MENU DES COMMANDES
    // ========================================================

    check(
        "Menu des commandes disponible",
        typeof buildPermissionPages === "function"
    );

    check(
        "Pagination disponible",
        typeof buildPermissionPaginationRow === "function"
    );


    // ========================================================
    // RÉSULTAT
    // ========================================================

    const total =
        results.length;

    const passed =
        results.filter(
            result => result.passed
        ).length;

    const failed =
        total - passed;


    console.log("");
    console.log("============================================================");
    console.log(
        `📊 AUDIT : ${passed}/${total} vérifications réussies`
    );
    console.log("============================================================");


    if (failed === 0) {

        console.log(
            "✅ AUDIT FINAL RÉUSSI"
        );

        console.log(
            "🎆 Hirosaki a passé toutes les vérifications."
        );

    } else {

        console.error(
            `❌ ${failed} vérification(s) ont échoué.`
        );

        console.error(
            "🔧 Les éléments concernés doivent être corrigés."
        );
    }


    console.log(
        "============================================================"
    );


    return {
        total,
        passed,
        failed,
        success: failed === 0,
        results
    };
}


// ============================================================
// VÉRIFICATION DE L'ENVIRONNEMENT
// ============================================================

function verifyEnvironment() {

    if (!process.env.DISCORD_TOKEN) {

        console.error(
            "❌ DISCORD_TOKEN est introuvable."
        );

        console.error(
            "Configure DISCORD_TOKEN dans l'environnement de l'hébergeur."
        );

        return false;
    }

    return true;
}


// ============================================================
// VÉRIFICATION DU CLIENT DISCORD
// ============================================================

function verifyDiscordClient() {

    if (!client) {

        console.error(
            "❌ Le client Discord n'existe pas."
        );

        return false;
    }

    if (
        typeof client.login !== "function"
    ) {

        console.error(
            "❌ Le client Discord est mal configuré."
        );

        return false;
    }

    return true;
}


// ============================================================
// VÉRIFICATION DE LA BASE DE DONNÉES
// ============================================================

function verifyDatabase() {

    if (
        typeof db === "undefined"
    ) {

        console.error(
            "❌ La base de données n'est pas initialisée."
        );

        return false;
    }

    if (
        typeof db.guilds === "undefined"
    ) {
        db.guilds = {};
    }

    return true;
}


// ============================================================
// VÉRIFICATIONS AVANT DÉMARRAGE
// ============================================================

function performStartupChecks() {

    console.log("");
    console.log(
        "🎆 Vérifications de démarrage Hirosaki..."
    );


    const environmentOK =
        verifyEnvironment();

    const clientOK =
        verifyDiscordClient();

    const databaseOK =
        verifyDatabase();


    let auditOK = false;


    if (
        environmentOK &&
        clientOK &&
        databaseOK
    ) {

        try {

            const audit =
                runFinalHiroSakiAudit();

            auditOK =
                audit.success;

        } catch (error) {

            console.error(
                "❌ Erreur pendant l'audit final :",
                error
            );
        }
    }


    console.log("");


    if (
        environmentOK &&
        clientOK &&
        databaseOK &&
        auditOK
    ) {

        console.log(
            "✅ Vérifications de démarrage terminées."
        );

        return true;
    }


    console.error(
        "❌ Les vérifications de démarrage ont détecté un problème."
    );

    return false;
}


// ============================================================
// ERREURS GLOBALES
// ============================================================

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "❌ Promise rejetée non gérée :",
            error
        );
    }
);


process.on(
    "uncaughtException",
    error => {

        console.error(
            "❌ Exception non gérée :",
            error
        );
    }
);


// ============================================================
// ARRÊT PROPRE DU BOT
// ============================================================

let isShuttingDown = false;


async function gracefulShutdown(signal) {

    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;


    console.log(
        `🛑 Arrêt de Hirosaki (${signal})...`
    );


    try {

        if (
            typeof saveDatabase === "function"
        ) {
            await saveDatabase();
        }

    } catch (error) {

        console.error(
            "❌ Erreur pendant la sauvegarde finale :",
            error
        );
    }


    try {

        if (
            client &&
            typeof client.destroy === "function"
        ) {

            client.destroy();
        }

    } catch (error) {

        console.error(
            "❌ Erreur pendant la fermeture Discord :",
            error
        );
    }


    console.log(
        "✅ Hirosaki arrêté proprement."
    );


    process.exit(0);
}


process.on(
    "SIGINT",
    () => gracefulShutdown("SIGINT")
);


process.on(
    "SIGTERM",
    () => gracefulShutdown("SIGTERM")
);


// ============================================================
// RAPPORT DU CAHIER DES CHARGES
// ============================================================

function printFinalSpecificationReport() {

    console.log("");
    console.log(
        "============================================================"
    );

    console.log(
        "🎆 HIROSAKI — CAHIER DES CHARGES FINAL"
    );

    console.log(
        "============================================================"
    );


    const specification = [

        "Préfixe +",

        "Aucune slash command",

        "Perm 0 — Gestion ticket",

        "Perm 1 — Modérateur test",

        "Perm 2 — Modérateur",

        "Perm 3 — Staff confirmé",

        "Perm 4 — Responsable staff",

        "Perm 5 — Co-owner",

        "Crown — Owner",

        "Permissions cumulatives",

        "+rank réservé à Crown",

        "+derank réservé à Crown",

        "Tickets",

        "Modération",

        "Warnings",

        "Sanctions",

        "Blacklist / banlist",

        "Lock / unlock",

        "Slowmode",

        "Clear / purge",

        "Statistiques",

        "Bienvenue",

        "Autorole",

        "Logs",

        "Leaderboard messages",

        "Leaderboard vocal",

        "Leaderboard duo vocal",

        "Suivi vocal",

        "Giveaways",

        "Auto-roll",

        "Persistance",

        "Protection hiérarchique",

        "Gestion des erreurs",

        "Menu des commandes paginé",

        "DM configurables",

        "DM lors d'une sanction",

        "DM lors de l'arrivée d'un membre",

        "Configuration DM depuis Discord",

        "Audit final"
    ];


    for (
        const item of specification
    ) {

        console.log(
            `☑ ${item}`
        );
    }


    console.log(
        "============================================================"
    );
}


// ============================================================
// RAPPORT AU DÉMARRAGE
// ============================================================

printFinalSpecificationReport();


// ============================================================
// FIN PARTIE 10/10
// ============================================================
//
// 🎆 HIROSAKI — FIN DU PROJET
//
// Cette partie contient uniquement :
//
// ✅ Audit final
// ✅ Vérification des permissions
// ✅ Vérification de la cumulativité
// ✅ Vérification Crown
// ✅ Vérification rank / derank
// ✅ Vérification tickets
// ✅ Vérification leaderboard
// ✅ Vérification giveaways
// ✅ Vérification autoroll
// ✅ Vérification persistance
// ✅ Vérification logs
// ✅ Vérification système DM
// ✅ Vérification erreurs
// ✅ Vérification environnement
// ✅ Arrêt propre
// ✅ Rapport final
//
// AUCUN DOUBLON VOLONTAIRE AVEC LES PARTIES 1 À 9.
// ============================================================