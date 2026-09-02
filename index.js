const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    ChannelType,
    EmbedBuilder,
    ComponentType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Collection,
    ActivityType
} = require("discord.js");

require("dotenv").config();

const fs = require("fs");
const path = require("path");

// ============================================================
// CONFIGURATION PRINCIPALE
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = "+";

if (!TOKEN) {
    console.error(
        "❌ DISCORD_TOKEN est introuvable dans les variables d'environnement."
    );
    process.exit(1);
}

// ============================================================
// CLIENT DISCORD
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ],

    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.GuildMember,
        Partials.User
    ]
});

// ============================================================
// DOSSIER / BASE DE DONNÉES
// ============================================================

const DATA_FOLDER = path.join(
    __dirname,
    "data"
);

const DATABASE_FILE = path.join(
    DATA_FOLDER,
    "hirosaki.json"
);

if (!fs.existsSync(DATA_FOLDER)) {
    fs.mkdirSync(
        DATA_FOLDER,
        {
            recursive: true
        }
    );
}

// ============================================================
// STRUCTURE PAR DÉFAUT
// ============================================================

const DEFAULT_DATABASE = {
    guilds: {},
    sanctions: {},
    messages: {},
    voice: {},
    duos: {},
    giveaways: {},
    snipes: {},
    schedules: {},
    recentMessages: {},
    statsReset: {
        lastResetKey: null
    }
};

function createDatabase() {
    return JSON.parse(
        JSON.stringify(
            DEFAULT_DATABASE
        )
    );
}

function loadDatabase() {
    if (!fs.existsSync(DATABASE_FILE)) {
        const database =
            createDatabase();

        fs.writeFileSync(
            DATABASE_FILE,
            JSON.stringify(
                database,
                null,
                4
            )
        );

        return database;
    }

    try {
        const database =
            JSON.parse(
                fs.readFileSync(
                    DATABASE_FILE,
                    "utf8"
                )
            );

        for (
            const key of Object.keys(
                DEFAULT_DATABASE
            )
        ) {
            if (
                !database[key] ||
                typeof database[key] !==
                    "object"
            ) {
                database[key] =
                    {};
            }
        }

        return database;
    } catch (error) {
        console.error(
            "❌ Impossible de lire la base de données :",
            error
        );

        return createDatabase();
    }
}

const db =
    loadDatabase();

let saveTimer = null;

function saveDatabase() {
    clearTimeout(
        saveTimer
    );

    saveTimer =
        setTimeout(() => {
            try {
                fs.writeFileSync(
                    DATABASE_FILE,
                    JSON.stringify(
                        db,
                        null,
                        4
                    )
                );
            } catch (error) {
                console.error(
                    "❌ Erreur lors de la sauvegarde :",
                    error
                );
            }
        }, 250);
}

// ============================================================
// CONFIGURATION D'UN SERVEUR
// ============================================================

function createGuildConfig() {
    return {
        roles: {
            crown: null,
            perm1: null,
            perm2: null,
            perm3: null,
            perm4: null,
            perm5: null,
            ticket: null
        },

        dmSanctions: {
            enabled: false,
            message:
                "Bonjour {user},\n\n" +
                "Tu viens de recevoir une sanction sur **{server}**.\n\n" +
                "Sanction : **{sanction}**\n" +
                "Raison : **{reason}**\n" +
                "Modérateur : **{moderator}**"
        },

        welcome: {
            enabled: false,
            channelId: null,
            message:
                "Bienvenue {user} sur **{server}** !\n" +
                "Tu es notre membre numéro **{member.count}**."
        },

        autorole: {
            enabled: false,
            roleId: null
        },

        ticket: {
            enabled: false,
            categoryId: null,
            panelChannelId: null,
            panelMessageId: null,
            title:
                "🎫 Support Hirosaki",
            description:
                "Clique sur le bouton ci-dessous pour ouvrir un ticket.",
            buttonLabel:
                "Créer un ticket",
            buttonEmoji:
                "🎫",
            ticketName:
                "ticket-{username}",
            closeDelay: 5
        },

        leaderboardSchedule: {
            enabled: false,
            channelId: null,
            hour: null,
            minute: null
        },

        statSchedule: {
            enabled: false,
            channelId: null,
            hour: null,
            minute: null
        }
    };
}

function ensureGuild(guildId) {
    if (
        !db.guilds[guildId]
    ) {
        db.guilds[guildId] =
            createGuildConfig();
    }

    const config =
        db.guilds[guildId];

    if (
        !db.sanctions[guildId]
    ) {
        db.sanctions[guildId] =
            {};
    }

    if (
        !db.messages[guildId]
    ) {
        db.messages[guildId] =
            {};
    }

    if (
        !db.voice[guildId]
    ) {
        db.voice[guildId] =
            {};
    }

    if (
        !db.duos[guildId]
    ) {
        db.duos[guildId] =
            {};
    }

    if (
        !db.giveaways[guildId]
    ) {
        db.giveaways[guildId] =
            {};
    }

    if (
        !db.snipes[guildId]
    ) {
        db.snipes[guildId] =
            {};
    }

    if (
        !db.schedules[guildId]
    ) {
        db.schedules[guildId] =
            {};
    }

    return config;
}

// ============================================================
// HIÉRARCHIE DES PERMISSIONS
// ============================================================
//
// Les permissions sont CUMULABLES.
//
// Perm 1 = Modérateur test
// Perm 2 = Modérateur
// Perm 3 = Staff confirmé
// Perm 4 = Responsable staff
// Perm 5 = Co owner
//
// Crown = Owner du bot / accès spécial rank + derank
// Perm 0 = Gestion ticket
// ============================================================

const PERMISSION_ROLES = {
    1: "Modérateur test",
    2: "Modérateur",
    3: "Staff confirmé",
    4: "Responsable staff",
    5: "Co owner"
};

const TICKET_ROLE_NAME =
    "Gestion ticket";

const CROWN_ROLE_NAME =
    "Crown";

// ============================================================
// RÉCUPÉRATION DES RÔLES
// ============================================================

function findRoleByName(
    guild,
    name
) {
    if (!guild) {
        return null;
    }

    const normalizedName =
        String(name)
            .normalize("NFD")
            .replace(
                /[\u0300-\u036f]/g,
                ""
            )
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                " "
            )
            .trim();

    return guild.roles.cache.find(
        role =>
            String(role.name)
                .normalize("NFD")
                .replace(
                    /[\u0300-\u036f]/g,
                    ""
                )
                .toLowerCase()
                .replace(
                    /[^a-z0-9]+/g,
                    " "
                )
                .trim() ===
            normalizedName
    ) || null;
}

function getCrownRole(guild) {
    return findRoleByName(
        guild,
        CROWN_ROLE_NAME
    );
}

function getTicketRole(guild) {
    return findRoleByName(
        guild,
        TICKET_ROLE_NAME
    );
}

function getPermissionRole(
    guild,
    level
) {
    const roleName =
        PERMISSION_ROLES[level];

    if (!roleName) {
        return null;
    }

    const candidates = [
        roleName,
        `Perm ${level}`,
        `Perm${level}`,
        `Perm ${level} - ${roleName}`
    ];

    for (const candidate of candidates) {
        const role =
            findRoleByName(
                guild,
                candidate
            );

        if (role) {
            return role;
        }
    }

    return null;
}

// ============================================================
// NIVEAU DE PERMISSION D'UN MEMBRE
// ============================================================

function isCrown(member) {
    if (!member) {
        return false;
    }

    const crown =
        getCrownRole(
            member.guild
        );

    if (!crown) {
        return false;
    }

    return member.roles.cache.has(
        crown.id
    );
}

function hasTicketPermission(
    member
) {
    if (!member) {
        return false;
    }

    if (
        isCrown(member)
    ) {
        return true;
    }

    const ticketRole =
        getTicketRole(
            member.guild
        );

    return Boolean(
        ticketRole &&
        member.roles.cache.has(
            ticketRole.id
        )
    );
}

function getPermissionLevel(
    member
) {
    if (!member) {
        return 0;
    }

    // Crown possède toutes les permissions.
    if (
        isCrown(member)
    ) {
        return 999;
    }

    let highest =
        0;

    for (
        const [
            level,
            roleName
        ] of Object.entries(
            PERMISSION_ROLES
        )
    ) {
        const role =
            getPermissionRole(
                member.guild,
                level
            );

        if (
            role &&
            member.roles.cache.has(
                role.id
            )
        ) {
            highest =
                Math.max(
                    highest,
                    Number(level)
                );
        }
    }

    return highest;
}

function hasPermission(
    member,
    requiredLevel
) {
    return (
        getPermissionLevel(
            member
        ) >=
        requiredLevel
    );
}

// ============================================================
// PERMISSIONS EXACTES DES COMMANDES
// ============================================================

const COMMAND_PERMISSIONS = {
    snipe: 1,

    warn: 2,
    unwarn: 2,
    sanction: 2,
    "all-sanction": 2,

    kick: 3,
    mute: 3,
    unmute: 3,

    addrole: 4,
    "remove-role": 4,

    ban: 5,
    unban: 5,
    unbanall: 5,

    clear: 2,
    purge: 2,
    "clear-sanction": 2,
    banlist: 5,

    autorole: 4,

    welcome: 4,
    "welcome-message": 4,

    "ticket-add": 0,
    "ticket-close": 0,
    "ticket-claim": 0,

    "ticket-config": 4,

    "stat-schedule": 4,
    "leaderboard-schedule": 4,

    embed: 4,
    dm: 4
};

// ============================================================
// COMMANDES
// ============================================================

const commands =
    new Collection();

function registerCommand(
    name,
    options = {}
) {
    // Évite qu'une commande déclarée deux fois dans un ancien bloc de
    // migration remplace silencieusement la première implémentation.
    if (
        commands.has(
            name.toLowerCase()
        )
    ) {
        return;
    }

    const command = {
        name,
        aliases:
            options.aliases || [],
        permission:
            options.permission ??
            COMMAND_PERMISSIONS[
                name
            ] ??
            0,
        crownOnly:
            options.crownOnly ||
            false,
        execute:
            options.execute
    };

    commands.set(
        name.toLowerCase(),
        command
    );

    for (
        const alias of command.aliases
    ) {
        commands.set(
            alias.toLowerCase(),
            command
        );
    }
}

// ============================================================
// OUTILS EMBED
// ============================================================

const COLORS = {
    primary: 0x5865F2,
    success: 0x57F287,
    danger: 0xED4245,
    warning: 0xFEE75C,
    neutral: 0x2B2D31
};

function createEmbed({
    title,
    description,
    color = COLORS.primary,
    thumbnail = null,
    footer = null
}) {
    const messageEmbed =
        new EmbedBuilder()
            .setColor(color);

    if (title) {
        messageEmbed.setTitle(
            title
        );
    }

    if (description) {
        messageEmbed.setDescription(
            description
        );
    }

    if (thumbnail) {
        messageEmbed.setThumbnail(
            thumbnail
        );
    }

    if (footer) {
        messageEmbed.setFooter({
            text: footer
        });
    }

    messageEmbed.setTimestamp();

    return messageEmbed;
}

function successEmbed(
    text
) {
    return createEmbed({
        title:
            "✅ Hirosaki",
        description:
            text,
        color:
            COLORS.success
    });
}

function errorEmbed(
    text
) {
    return createEmbed({
        title:
            "❌ Hirosaki",
        description:
            text,
        color:
            COLORS.danger
    });
}

function infoEmbed(
    text
) {
    return createEmbed({
        title:
            "ℹ️ Hirosaki",
        description:
            text,
        color:
            COLORS.primary
    });
}

// ============================================================
// RÉPONSE EMBED
// ============================================================

async function sendEmbed(
    message,
    messageEmbed
) {
    return message.reply({
        embeds: [
            messageEmbed
        ],
        allowedMentions: {
            repliedUser:
                false
        }
    });
}

// ============================================================
// PARSAGE D'UN MEMBRE
// ============================================================

async function resolveMember(
    message,
    value
) {
    if (
        !message.guild ||
        !value
    ) {
        return null;
    }

    const mention =
        value.match(
            /^<@!?(\d+)>$/
        );

    if (mention) {
        return message.guild.members
            .fetch(
                mention[1]
            )
            .catch(() => null);
    }

    if (
        /^\d{17,20}$/.test(
            value
        )
    ) {
        return message.guild.members
            .fetch(value)
            .catch(() => null);
    }

    const search =
        value.toLowerCase();

    const exact =
        message.guild.members.cache.find(
            member =>
                member.user.username
                    .toLowerCase() ===
                    search ||
                member.displayName
                    .toLowerCase() ===
                    search
        );

    if (exact) {
        return exact;
    }

    return (
        message.guild.members.cache.find(
            member =>
                member.user.username
                    .toLowerCase()
                    .includes(search) ||
                member.displayName
                    .toLowerCase()
                    .includes(search)
        ) || null
    );
}

// ============================================================
// PARSAGE D'UN RÔLE
// ============================================================

function resolveRole(
    guild,
    value
) {
    if (
        !guild ||
        !value
    ) {
        return null;
    }

    const mention =
        value.match(
            /^<@&(\d+)>$/
        );

    if (mention) {
        return (
            guild.roles.cache.get(
                mention[1]
            ) || null
        );
    }

    if (
        /^\d{17,20}$/.test(
            value
        )
    ) {
        return (
            guild.roles.cache.get(
                value
            ) || null
        );
    }

    const search =
        value.toLowerCase();

    return (
        guild.roles.cache.find(
            role =>
                role.name
                    .toLowerCase() ===
                search
        ) || null
    );
}

// ============================================================
// PARSAGE D'UN SALON
// ============================================================

function resolveChannel(
    guild,
    value
) {
    if (
        !guild ||
        !value
    ) {
        return null;
    }

    const mention =
        value.match(
            /^<#(\d+)>$/
        );

    if (mention) {
        return (
            guild.channels.cache.get(
                mention[1]
            ) || null
        );
    }

    if (
        /^\d{17,20}$/.test(
            value
        )
    ) {
        return (
            guild.channels.cache.get(
                value
            ) || null
        );
    }

    const search =
        value.toLowerCase();

    return (
        guild.channels.cache.find(
            channel =>
                channel.name
                    ?.toLowerCase() ===
                search
        ) || null
    );
}

// ============================================================
// VÉRIFICATION PERMISSION
// ============================================================

async function requirePermission(
    message,
    level
) {
    if (
        isCrown(
            message.member
        )
    ) {
        return true;
    }

    if (
        hasPermission(
            message.member,
            level
        )
    ) {
        return true;
    }

    await sendEmbed(
        message,
        errorEmbed(
            `Tu n'as pas la permission nécessaire.\n\n` +
            `Permission requise : **Perm ${level}**.`
        )
    );

    return false;
}

// ============================================================
// VÉRIFICATION CROWN
// ============================================================

async function requireCrown(
    message
) {
    if (
        isCrown(
            message.member
        )
    ) {
        return true;
    }

    await sendEmbed(
        message,
        errorEmbed(
            "Cette commande est réservée au rôle **Crown**."
        )
    );

    return false;
}

// ============================================================
// VÉRIFICATION GESTION TICKET
// ============================================================

async function requireTicketPermission(
    message
) {
    if (
        isCrown(
            message.member
        ) ||
        hasTicketPermission(
            message.member
        )
    ) {
        return true;
    }

    await sendEmbed(
        message,
        errorEmbed(
            "Tu n'as pas la permission **Perm 0 — Gestion ticket**."
        )
    );

    return false;
}

// ============================================================
// FORMATAGE NOMBRE
// ============================================================

function formatNumber(
    value
) {
    return Number(
        value || 0
    ).toLocaleString(
        "fr-FR"
    );
}

// ============================================================
// FORMATAGE DURÉE
// ============================================================

function formatDuration(
    milliseconds
) {
    if (
        !milliseconds ||
        milliseconds <= 0
    ) {
        return "0 seconde";
    }

    let seconds =
        Math.floor(
            milliseconds /
                1000
        );

    const days =
        Math.floor(
            seconds /
                86400
        );

    seconds %= 86400;

    const hours =
        Math.floor(
            seconds /
                3600
        );

    seconds %= 3600;

    const minutes =
        Math.floor(
            seconds /
                60
        );

    seconds %= 60;

    const parts = [];

    if (days) {
        parts.push(
            `${days}j`
        );
    }

    if (hours) {
        parts.push(
            `${hours}h`
        );
    }

    if (minutes) {
        parts.push(
            `${minutes}m`
        );
    }

    if (
        seconds ||
        parts.length === 0
    ) {
        parts.push(
            `${seconds}s`
        );
    }

    return parts.join(
        " "
    );
}

// ============================================================
// PARSAGE D'UNE DURÉE
// ============================================================

function parseDuration(
    value
) {
    if (!value) {
        return null;
    }

    const match =
        String(value)
            .toLowerCase()
            .match(
                /^(\d+)(s|m|h|d|w)$/
            );

    if (!match) {
        return null;
    }

    const amount =
        Number(
            match[1]
        );

    const units = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 *
            60 *
            60 *
            1000,
        w: 7 *
            24 *
            60 *
            60 *
            1000
    };

    return (
        amount *
        units[match[2]]
    );
}

// ============================================================
// VARIABLES DE BIENVENUE
// ============================================================

function replaceWelcomeVariables(
    text,
    member
) {
    const guild =
        member.guild;

    const onlineMembers =
        guild.members.cache.filter(
            currentMember =>
                currentMember.presence
                    ?.status &&
                currentMember.presence
                    .status !==
                    "offline"
        ).size;

    return text
        .replace(
            /\{user\}/gi,
            `${member}`
        )
        .replace(
            /\{username\}/gi,
            member.user.username
        )
        .replace(
            /\{member\.count\}/gi,
            `${guild.memberCount}`
        )
        .replace(
            /\{server\}/gi,
            guild.name
        )
        .replace(
            /\{server\.name\}/gi,
            guild.name
        )
        .replace(
            /\{server\.id\}/gi,
            guild.id
        )
        .replace(
            /\{member\.id\}/gi,
            member.id
        )
        .replace(
            /\{member\.tag\}/gi,
            member.user.tag
        )
        .replace(
            /\{online\}/gi,
            `${onlineMembers}`
        );
}

// ============================================================
// SESSION VOCAL
// ============================================================

const voiceSessions =
    new Map();

// Cache très court des messages reçus pour les suppressions
// de messages partiels/non présents dans le cache Discord.
const recentMessageSnapshots =
    new Map();

function rememberMessage(
    message
) {
    const guildId =
        message.guildId ||
        message.guild?.id;

    const channelId =
        message.channelId ||
        message.channel?.id;

    if (
        !guildId ||
        !channelId ||
        !message.id ||
        message.author?.bot
    ) {
        return;
    }

    const snapshot = {
        id:
            message.id,
        guildId,
        channelId,
        content:
            typeof message.content ===
                "string"
                ? message.content
                : "",
        authorId:
            message.author?.id ||
            null,
        authorTag:
            message.author?.tag ||
            message.author?.username ||
            "Utilisateur inconnu",
        avatar:
            message.author?.displayAvatarURL?.(
                {
                    extension: "png",
                    size: 256
                }
            ) || null,
        createdAt:
            message.createdTimestamp ||
            Date.now(),
        attachments:
            [
                ...(message.attachments?.values?.() ||
                    [])
            ].map(
                attachment =>
                    attachment.url
            )
    };

    recentMessageSnapshots.set(
        message.id,
        snapshot
    );

    if (
        !db.recentMessages[guildId]
    ) {
        db.recentMessages[guildId] =
            {};
    }

    const channelSnapshots =
        db.recentMessages[guildId][
            channelId
        ] || [];

    db.recentMessages[guildId][
        channelId
    ] = [
        ...channelSnapshots.filter(
            item =>
                item.id !==
                message.id
        ),
        snapshot
    ].slice(
        -50
    );

    while (
        recentMessageSnapshots.size >
        1000
    ) {
        const oldestId =
            recentMessageSnapshots
                .keys()
                .next()
                .value;

        recentMessageSnapshots.delete(
            oldestId
        );
    }
}

function findStoredMessageSnapshot(
    messageId
) {
    const inMemory =
        recentMessageSnapshots.get(
            messageId
        );

    if (inMemory) {
        return inMemory;
    }

    for (
        const channelsByGuild of Object.values(
            db.recentMessages || {}
        )
    ) {
        for (
            const snapshots of Object.values(
                channelsByGuild || {}
            )
        ) {
            const snapshot =
                snapshots.find(
                    item =>
                        item.id ===
                        messageId
                );

            if (snapshot) {
                return snapshot;
            }
        }
    }

    return null;
}

// ============================================================
// ANTI-DOUBLON COMMANDES
// ============================================================

function getCommandFromMessage(
    message
) {
    if (
        !message.content ||
        !message.content.startsWith(
            PREFIX
        )
    ) {
        return null;
    }

    const content =
        message.content.slice(
            PREFIX.length
        ).trim();

    if (!content) {
        return null;
    }

    const parts =
        content.split(
            /\s+/
        );

    let commandName =
        parts
            .shift()
            .toLowerCase();

    // Les commandes historiques du cahier des charges peuvent être écrites
    // avec ou sans tiret : "+all sanction", "+clear sanction", "+remove roll".
    const secondWord =
        parts[0]
            ? parts[0].toLowerCase()
            : "";

    if (
        commandName === "all" &&
        secondWord === "sanction"
    ) {
        commandName = "all-sanction";
        parts.shift();
    } else if (
        commandName === "clear" &&
        secondWord === "sanction"
    ) {
        commandName = "clear-sanction";
        parts.shift();
    } else if (
        commandName === "remove" &&
        (secondWord === "role" ||
            secondWord === "roll")
    ) {
        commandName = "remove-role";
        parts.shift();
    }

    return {
        commandName,
        args: parts
    };
}
// ============================================================
// PARTIE 2/6 — SANCTIONS & MODÉRATION
// ============================================================

// ------------------------------------------------------------
// OUTILS SANCTIONS
// ------------------------------------------------------------

function ensureMemberSanctions(guildId, userId) {
    ensureGuild(guildId);

    if (!db.sanctions[guildId][userId]) {
        db.sanctions[guildId][userId] = [];
    }

    return db.sanctions[guildId][userId];
}

function createSanction(
    guild,
    member,
    moderator,
    type,
    reason
) {
    const sanctions =
        ensureMemberSanctions(
            guild.id,
            member.id
        );

    const sanction = {
        id:
            `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`,

        type,
        reason:
            reason || "Aucune raison fournie",

        userId:
            member.id,

        userTag:
            member.user.tag,

        moderatorId:
            moderator.id,

        moderatorTag:
            moderator.tag,

        createdAt:
            Date.now()
    };

    sanctions.push(sanction);

    saveDatabase();

    return sanction;
}

function removeSanction(
    guildId,
    userId,
    sanctionId
) {
    const sanctions =
        ensureMemberSanctions(
            guildId,
            userId
        );

    const index =
        sanctions.findIndex(
            sanction =>
                sanction.id ===
                sanctionId
        );

    if (index === -1) {
        return null;
    }

    return sanctions.splice(
        index,
        1
    )[0];
}

function getAllGuildSanctions(
    guildId
) {
    ensureGuild(guildId);

    const result = [];

    for (
        const [
            userId,
            sanctions
        ] of Object.entries(
            db.sanctions[guildId]
        )
    ) {
        for (
            const sanction of sanctions
        ) {
            result.push({
                ...sanction,
                userId
            });
        }
    }

    return result.sort(
        (a, b) =>
            b.createdAt -
            a.createdAt
    );
}

// ------------------------------------------------------------
// DM SANCTION
// ------------------------------------------------------------

async function sendSanctionDM(
    guild,
    member,
    sanction
) {
    const config =
        ensureGuild(
            guild.id
        );

    if (
        !config.dmSanctions.enabled
    ) {
        return;
    }

    const message =
        config.dmSanctions.message
            .replace(
                /\{user\}/gi,
                `${member}`
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
                /\{sanction\}/gi,
                sanction.type
            )
            .replace(
                /\{reason\}/gi,
                sanction.reason
            )
            .replace(
                /\{moderator\}/gi,
                sanction.moderatorTag
            )
            .replace(
                /\{sanction\.id\}/gi,
                sanction.id
            );

    const dmEmbed =
        createEmbed({
            title:
                "⚠️ Sanction Hirosaki",
            description:
                message,
            color:
                COLORS.danger,
            thumbnail:
                guild.iconURL({
                    extension:
                        "png",
                    size:
                        256
                }),
            footer:
                guild.name
        });

    await member.send({
        embeds: [
            dmEmbed
        ]
    }).catch(() => {});
}

// ------------------------------------------------------------
// COMMANDE +SNIPE
// ------------------------------------------------------------

registerCommand(
    "snipe",
    {
        permission: 1,

        execute: async message => {
            const guildSnipes =
                db.snipes[
                    message.guild.id
                ];

            const data =
                guildSnipes?.[
                    message.channel.id
                ];

            if (!data) {
                return sendEmbed(
                    message,
                    infoEmbed(
                        "Aucun message supprimé n'est disponible."
                    )
                );
            }

            let deletedContent =
                typeof data.content ===
                    "string"
                    ? data.content.trim()
                    : "";

            if (
                !deletedContent &&
                data.attachments?.length
            ) {
                deletedContent =
                    data.attachments
                        .map(
                            (url, index) =>
                                `[Pièce jointe ${index + 1}](${url})`
                        )
                        .join("\n");
            }

            if (!deletedContent) {
                deletedContent =
                    "*Message supprimé sans contenu texte.*";
            }

            if (
                deletedContent.length >
                3900
            ) {
                deletedContent =
                    `${deletedContent.slice(0, 3897)}...`;
            }

            const snipeEmbed =
                createEmbed({
                    title:
                        "🗑️ Message supprimé",
                    description:
                        deletedContent,
                    color:
                        COLORS.warning
                });

            return sendEmbed(
                message,
                snipeEmbed
            );
        }
    }
);

// ------------------------------------------------------------
// +WARN
// ------------------------------------------------------------

registerCommand(
    "warn",
    {
        permission: 2,

        execute: async (
            message,
            args
        ) => {
            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            if (!member) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}warn @membre [raison]\``
                    )
                );
            }

            if (
                member.id ===
                message.author.id
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Tu ne peux pas te sanctionner toi-même."
                    )
                );
            }

            if (
                member.user.bot
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Les bots ne peuvent pas être sanctionnés avec cette commande."
                    )
                );
            }

            if (
                !message.member.permissions.has(
                    PermissionsBitField.Flags.ModerateMembers
                ) &&
                !isCrown(
                    message.member
                )
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Tu n'as pas la permission Discord nécessaire."
                    )
                );
            }

            const reason =
                args.join(" ") ||
                "Aucune raison fournie";

            const sanction =
                createSanction(
                    message.guild,
                    member,
                    message.author,
                    "Warn",
                    reason
                );

            await sendSanctionDM(
                message.guild,
                member,
                sanction
            );

            return sendEmbed(
                message,
                successEmbed(
                    `⚠️ ${member} a reçu un **warn**.\n\n` +
                    `**Raison :** ${reason}\n` +
                    `**ID sanction :** \`${sanction.id}\``
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +UNWARN
// ------------------------------------------------------------

registerCommand(
    "unwarn",
    {
        permission: 2,

        execute: async (
            message,
            args
        ) => {
            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            const sanctionId =
                args.shift();

            if (
                !member ||
                !sanctionId
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}unwarn @membre ID_SANCTION\``
                    )
                );
            }

            const sanctions =
                ensureMemberSanctions(
                    message.guild.id,
                    member.id
                );

            const sanction =
                sanctions.find(
                    item =>
                        item.id ===
                        sanctionId
                );

            if (!sanction) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Cette sanction est introuvable."
                    )
                );
            }

            if (
                sanction.type !==
                "Warn"
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Cette sanction n'est pas un warn."
                    )
                );
            }

            removeSanction(
                message.guild.id,
                member.id,
                sanctionId
            );

            return sendEmbed(
                message,
                successEmbed(
                    `✅ Le warn de ${member} a été retiré.\n` +
                    `**ID :** \`${sanctionId}\``
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +SANCTION
// ------------------------------------------------------------

registerCommand(
    "sanction",
    {
        permission: 2,

        execute: async (
            message,
            args
        ) => {
            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            if (!member) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}sanction @membre\``
                    )
                );
            }

            const sanctions =
                ensureMemberSanctions(
                    message.guild.id,
                    member.id
                );

            if (
                sanctions.length ===
                0
            ) {
                return sendEmbed(
                    message,
                    infoEmbed(
                        `✅ ${member} n'a aucune sanction enregistrée.`
                    )
                );
            }

            const lines =
                sanctions
                    .slice(-20)
                    .reverse()
                    .map(
                        (
                            sanction,
                            index
                        ) =>
                            `**${index + 1}. ${sanction.type}**\n` +
                            `> ID : \`${sanction.id}\`\n` +
                            `> Raison : ${sanction.reason}\n` +
                            `> Modérateur : <@${sanction.moderatorId}>\n` +
                            `> <t:${Math.floor(
                                sanction.createdAt / 1000
                            )}:R>`
                    );

            const sanctionEmbed =
                createEmbed({
                    title:
                        `📋 Sanctions de ${member.user.tag}`,
                    description:
                        lines.join(
                            "\n\n"
                        ),
                    color:
                        COLORS.warning,
                    thumbnail:
                        member.displayAvatarURL({
                            extension:
                                "png",
                            size:
                                256
                        }),
                    footer:
                        `${sanctions.length} sanction(s) au total`
                });

            return sendEmbed(
                message,
                sanctionEmbed
            );
        }
    }
);

// ------------------------------------------------------------
// +ALL SANCTION
// ------------------------------------------------------------

registerCommand(
    "all-sanction",
    {
        permission: 2,

        aliases: [
            "allsanction"
        ],

        execute: async message => {
            const sanctions =
                getAllGuildSanctions(
                    message.guild.id
                );

            if (
                sanctions.length ===
                0
            ) {
                return sendEmbed(
                    message,
                    infoEmbed(
                        "Aucune sanction n'est enregistrée sur ce serveur."
                    )
                );
            }

            const display =
                sanctions
                    .slice(0, 25)
                    .map(
                        (
                            sanction,
                            index
                        ) =>
                            `**${index + 1}. ${sanction.type}** — <@${sanction.userId}>\n` +
                            `> ${sanction.reason}\n` +
                            `> Modérateur : <@${sanction.moderatorId}> • <t:${Math.floor(
                                sanction.createdAt / 1000
                            )}:R>`
                    )
                    .join(
                        "\n\n"
                    );

            const allSanctionEmbed =
                createEmbed({
                    title:
                        "📋 Toutes les sanctions",
                    description:
                        display,
                    color:
                        COLORS.warning,
                    thumbnail:
                        message.guild.iconURL({
                            extension:
                                "png",
                            size:
                                256
                        }),
                    footer:
                        `${sanctions.length} sanction(s) enregistrée(s)`
                });

            return sendEmbed(
                message,
                allSanctionEmbed
            );
        }
    }
);

// ------------------------------------------------------------
// +CLEAR SANCTION
// ------------------------------------------------------------

registerCommand(
    "clear-sanction",
    {
        permission: 2,

        aliases: [
            "clearsanction"
        ],

        execute: async (
            message,
            args
        ) => {
            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            if (!member) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}clear-sanction @membre\``
                    )
                );
            }

            ensureMemberSanctions(
                message.guild.id,
                member.id
            );

            const count =
                db.sanctions[
                    message.guild.id
                ][member.id].length;

            db.sanctions[
                message.guild.id
            ][member.id] = [];

            saveDatabase();

            return sendEmbed(
                message,
                successEmbed(
                    `🧹 **${count}** sanction(s) supprimée(s) pour ${member}.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +KICK
// ------------------------------------------------------------

registerCommand(
    "kick",
    {
        permission: 3,

        execute: async (
            message,
            args
        ) => {
            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            if (!member) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}kick @membre [raison]\``
                    )
                );
            }

            if (
                !member.kickable
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Je ne peux pas expulser ce membre. Vérifie la hiérarchie de mes rôles."
                    )
                );
            }

            const reason =
                args.join(" ") ||
                "Aucune raison fournie";

            const sanction =
                createSanction(
                    message.guild,
                    member,
                    message.author,
                    "Kick",
                    reason
                );

            await sendSanctionDM(
                message.guild,
                member,
                sanction
            );

            await member.kick(
                reason
            );

            return sendEmbed(
                message,
                successEmbed(
                    `👢 ${member.user.tag} a été expulsé.\n\n` +
                    `**Raison :** ${reason}`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +MUTE
// ------------------------------------------------------------

registerCommand(
    "mute",
    {
        permission: 3,

        execute: async (
            message,
            args
        ) => {
            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            const duration =
                parseDuration(
                    args.shift()
                );

            if (
                !member ||
                !duration
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}mute @membre 10m [raison]\`\n\nDurées acceptées : \`s\`, \`m\`, \`h\`, \`d\`, \`w\``
                    )
                );
            }

            if (
                duration >
                28 * 24 * 60 * 60 * 1000
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Le mute ne peut pas dépasser 28 jours."
                    )
                );
            }

            if (
                !member.moderatable
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Je ne peux pas mute ce membre. Vérifie la hiérarchie de mes rôles."
                    )
                );
            }

            const reason =
                args.join(" ") ||
                "Aucune raison fournie";

            const sanction =
                createSanction(
                    message.guild,
                    member,
                    message.author,
                    "Mute",
                    reason
                );

            await member.timeout(
                duration,
                reason
            );

            await sendSanctionDM(
                message.guild,
                member,
                sanction
            );

            return sendEmbed(
                message,
                successEmbed(
                    `🔇 ${member} a été mute pendant **${formatDuration(
                        duration
                    )}**.\n\n` +
                    `**Raison :** ${reason}`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +UNMUTE
// ------------------------------------------------------------

registerCommand(
    "unmute",
    {
        permission: 3,

        execute: async (
            message,
            args
        ) => {
            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            if (!member) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}unmute @membre\``
                    )
                );
            }

            if (
                !member.moderatable
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Je ne peux pas retirer le mute de ce membre."
                    )
                );
            }

            await member.timeout(
                null,
                "Unmute"
            );

            return sendEmbed(
                message,
                successEmbed(
                    `🔊 ${member} a été unmute.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +BAN
// ------------------------------------------------------------

registerCommand(
    "ban",
    {
        permission: 5,

        execute: async (
            message,
            args
        ) => {
            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            if (!member) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}ban @membre [raison]\``
                    )
                );
            }

            if (
                !member.bannable
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Je ne peux pas bannir ce membre. Vérifie la hiérarchie de mes rôles."
                    )
                );
            }

            const reason =
                args.join(" ") ||
                "Aucune raison fournie";

            const sanction =
                createSanction(
                    message.guild,
                    member,
                    message.author,
                    "Ban",
                    reason
                );

            await sendSanctionDM(
                message.guild,
                member,
                sanction
            );

            await member.ban({
                reason
            });

            return sendEmbed(
                message,
                successEmbed(
                    `🔨 ${member.user.tag} a été banni.\n\n` +
                    `**Raison :** ${reason}`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +UNBAN
// ------------------------------------------------------------

registerCommand(
    "unban",
    {
        permission: 5,

        execute: async (
            message,
            args
        ) => {
            const userId =
                args.shift();

            if (
                !userId ||
                !/^\d{17,20}$/.test(
                    userId
                )
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}unban ID\``
                    )
                );
            }

            const bans =
                await message.guild.bans
                    .fetch()
                    .catch(
                        () => null
                    );

            if (!bans) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Impossible de récupérer la liste des bannissements."
                    )
                );
            }

            if (
                !bans.has(
                    userId
                )
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Cet utilisateur n'est pas banni."
                    )
                );
            }

            await message.guild.members
                .unban(
                    userId,
                    `Unban par ${message.author.tag}`
                );

            return sendEmbed(
                message,
                successEmbed(
                    `🔓 L'utilisateur \`${userId}\` a été débanni.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +UNBANALL
// ------------------------------------------------------------

registerCommand(
    "unbanall",
    {
        permission: 5,

        execute: async message => {
            const bans =
                await message.guild.bans
                    .fetch()
                    .catch(
                        () => null
                    );

            if (!bans) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Impossible de récupérer les bannissements."
                    )
                );
            }

            if (
                bans.size === 0
            ) {
                return sendEmbed(
                    message,
                    infoEmbed(
                        "Aucun membre n'est actuellement banni."
                    )
                );
            }

            let successCount =
                0;

            for (
                const [
                    userId
                ] of bans
            ) {
                try {
                    await message.guild.members.unban(
                        userId,
                        `Unbanall par ${message.author.tag}`
                    );

                    successCount++;
                } catch (
                    error
                ) {
                    console.error(
                        `Impossible de débannir ${userId}:`,
                        error
                    );
                }
            }

            return sendEmbed(
                message,
                successEmbed(
                    `🔓 **${successCount}** bannissement(s) retiré(s) sur **${bans.size}**.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +BANLIST
// ------------------------------------------------------------

registerCommand(
    "banlist",
    {
        permission: 5,

        execute: async message => {
            const bans =
                await message.guild.bans
                    .fetch()
                    .catch(
                        () => null
                    );

            if (!bans) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Impossible de récupérer la liste des bannissements."
                    )
                );
            }

            if (
                bans.size === 0
            ) {
                return sendEmbed(
                    message,
                    infoEmbed(
                        "✅ Aucun membre n'est banni."
                    )
                );
            }

            const list =
                [...bans.values()]
                    .slice(0, 25)
                    .map(
                        (
                            ban,
                            index
                        ) =>
                            `**${index + 1}.** ${ban.user.tag}\n> ID : \`${ban.user.id}\`\n> Raison : ${ban.reason || "Aucune raison"}`
                    )
                    .join(
                        "\n\n"
                    );

            const banEmbed =
                createEmbed({
                    title:
                        "🔨 Liste des bannissements",
                    description:
                        list,
                    color:
                        COLORS.danger,
                    thumbnail:
                        message.guild.iconURL({
                            extension:
                                "png",
                            size:
                                256
                        }),
                    footer:
                        `${bans.size} membre(s) banni(s)`
                });

            return sendEmbed(
                message,
                banEmbed
            );
        }
    }
);
// ============================================================
// PARTIE 3/6 — STATISTIQUES & LEADERBOARD
// ============================================================

// ------------------------------------------------------------
// STATISTIQUES DES MEMBRES
// ------------------------------------------------------------

function ensureMemberStats(
    guildId,
    userId
) {
    ensureGuild(guildId);

    if (
        typeof db.messages[guildId][userId] !==
        "number"
    ) {
        db.messages[guildId][userId] = 0;
    }

    if (
        typeof db.voice[guildId][userId] !==
        "number"
    ) {
        db.voice[guildId][userId] = 0;
    }

    return {
        messages:
            db.messages[guildId][userId],

        voice:
            db.voice[guildId][userId]
    };
}

// ------------------------------------------------------------
// COMPTEUR DE MESSAGES
// ------------------------------------------------------------

function addMessageStat(
    guildId,
    userId
) {
    ensureMemberStats(
        guildId,
        userId
    );

    db.messages[guildId][userId]++;

    saveDatabase();
}

// ------------------------------------------------------------
// COMPTEUR VOCAL
// ------------------------------------------------------------

function startVoiceSession(
    guildId,
    userId
) {
    const key =
        `${guildId}:${userId}`;

    if (
        voiceSessions.has(key)
    ) {
        return;
    }

    voiceSessions.set(
        key,
        Date.now()
    );
}

function finishVoiceSession(
    guildId,
    userId
) {
    const key =
        `${guildId}:${userId}`;

    const started =
        voiceSessions.get(key);

    if (!started) {
        return;
    }

    const duration =
        Date.now() -
        started;

    ensureMemberStats(
        guildId,
        userId
    );

    db.voice[guildId][userId] +=
        duration;

    voiceSessions.delete(
        key
    );

    saveDatabase();
}

// ------------------------------------------------------------
// STATISTIQUES DU SERVEUR
// ------------------------------------------------------------

function getServerStatistics(
    guild
) {
    const members =
        guild.memberCount;

    let online = 0;
    let voice = 0;
    let streaming = 0;

    for (
        const member of guild.members.cache.values()
    ) {
        if (
            member.user.bot
        ) {
            continue;
        }

        if (
            member.presence &&
            member.presence.status &&
            member.presence.status !==
                "offline"
        ) {
            online++;
        }

        if (
            member.voice &&
            member.voice.channelId
        ) {
            voice++;
        }

        if (
            member.voice &&
            member.voice.streaming
        ) {
            streaming++;
        }
    }

    return {
        members,
        online,
        voice,
        streaming,
        boosts:
            guild.premiumSubscriptionCount ||
            0
    };
}

// ------------------------------------------------------------
// +STAT
// ------------------------------------------------------------

registerCommand(
    "stat",
    {
        permission: 0,

        aliases: [
            "stats"
        ],

        execute: async message => {
            const guild =
                message.guild;

            const stats =
                getServerStatistics(
                    guild
                );

            const icon =
                guild.iconURL({
                    extension:
                        "png",
                    size:
                        512
                });

            const statEmbed =
                createEmbed({
                    title:
                        "Hirosaki 🎆 Statistiques",
                    color:
                        COLORS.primary,
                    thumbnail:
                        icon,
                    footer:
                        guild.name
                });

            statEmbed.addFields(
                {
                    name:
                        "👥 Membres",
                    value:
                        `**${formatNumber(
                            stats.members
                        )}**`,
                    inline:
                        true
                },
                {
                    name:
                        "🟢 En ligne",
                    value:
                        `**${formatNumber(
                            stats.online
                        )}**`,
                    inline:
                        true
                },
                {
                    name:
                        "🎙️ En vocal",
                    value:
                        `**${formatNumber(
                            stats.voice
                        )}**`,
                    inline:
                        true
                },
                {
                    name:
                        "📺 En stream",
                    value:
                        `**${formatNumber(
                            stats.streaming
                        )}**`,
                    inline:
                        true
                },
                {
                    name:
                        "🚀 Boosts",
                    value:
                        `**${formatNumber(
                            stats.boosts
                        )}**`,
                    inline:
                        true
                }
            );

            return sendEmbed(
                message,
                statEmbed
            );
        }
    }
);

// ------------------------------------------------------------
// LEADERBOARD — MESSAGES
// ------------------------------------------------------------

function getMessageLeaderboard(
    guild,
    limit = 10
) {
    ensureGuild(
        guild.id
    );

    return Object.entries(
        db.messages[guild.id]
    )
        .map(
            ([userId, count]) => ({
                userId,
                count:
                    Number(count) || 0
            })
        )
        .filter(
            entry =>
                entry.count > 0
        )
        .sort(
            (a, b) =>
                b.count -
                a.count
        )
        .slice(
            0,
            limit
        );
}

// ------------------------------------------------------------
// LEADERBOARD — VOCAL
// ------------------------------------------------------------

function getVoiceLeaderboard(
    guild,
    limit = 10
) {
    ensureGuild(
        guild.id
    );

    const entries =
        new Map(
            Object.entries(
                db.voice[guild.id]
            ).map(
                ([userId, duration]) => [
                    userId,
                    {
                        userId,
                        duration:
                            Number(duration) ||
                            0
                    }
                ]
            )
        );

    const now =
        Date.now();

    for (
        const [
            key,
            startedAt
        ] of voiceSessions
    ) {
        const [
            guildId,
            userId
        ] = key.split(":");

        if (
            guildId !== guild.id ||
            typeof startedAt !==
                "number"
        ) {
            continue;
        }

        const entry =
            entries.get(userId) ||
            {
                userId,
                duration: 0
            };

        entry.duration +=
            Math.max(
                0,
                now - startedAt
            );

        entries.set(
            userId,
            entry
        );
    }

    return [...entries.values()]
        .filter(
            entry =>
                entry.duration > 0
        )
        .sort(
            (a, b) =>
                b.duration -
                a.duration
        )
        .slice(
            0,
            limit
        );
}

// ------------------------------------------------------------
// DUOS
// ------------------------------------------------------------
//
// Un duo = deux membres qui passent du temps
// ensemble dans le même salon vocal.
//
// La durée est enregistrée en millisecondes.
// ------------------------------------------------------------

const duoVoiceSessions =
    new Map();

function createDuoKey(
    userA,
    userB
) {
    return [
        userA,
        userB
    ]
        .sort()
        .join(":");
}

function startDuoSession(
    guildId,
    userA,
    userB
) {
    if (
        userA === userB
    ) {
        return;
    }

    const key =
        `${guildId}:${createDuoKey(
            userA,
            userB
        )}`;

    if (
        duoVoiceSessions.has(
            key
        )
    ) {
        return;
    }

    duoVoiceSessions.set(
        key,
        Date.now()
    );
}

function finishDuoSession(
    guildId,
    userA,
    userB
) {
    if (
        userA === userB
    ) {
        return;
    }

    const key =
        `${guildId}:${createDuoKey(
            userA,
            userB
        )}`;

    const started =
        duoVoiceSessions.get(
            key
        );

    if (!started) {
        return;
    }

    const duration =
        Date.now() -
        started;

    ensureGuild(
        guildId
    );

    const duoKey =
        createDuoKey(
            userA,
            userB
        );

    if (
        !db.duos[guildId][duoKey]
    ) {
        db.duos[guildId][duoKey] = {
            users: [
                userA,
                userB
            ],
            duration: 0
        };
    }

    db.duos[guildId][duoKey]
        .duration +=
        duration;

    duoVoiceSessions.delete(
        key
    );

    saveDatabase();
}

function getDuoLeaderboard(
    guild,
    limit = 10
) {
    ensureGuild(
        guild.id
    );

    const entries =
        new Map(
            Object.entries(
                db.duos[guild.id]
            ).map(
                ([key, duo]) => [
                    key,
                    {
                        key,
                        users:
                            duo.users || [],
                        duration:
                            Number(
                                duo.duration
                            ) || 0
                    }
                ]
            )
        );

    const now =
        Date.now();

    for (
        const [
            sessionKey,
            startedAt
        ] of duoVoiceSessions
    ) {
        const parts =
            sessionKey.split(":");

        if (
            parts.length !== 3 ||
            parts[0] !== guild.id ||
            typeof startedAt !==
                "number"
        ) {
            continue;
        }

        const key =
            createDuoKey(
                parts[1],
                parts[2]
            );

        const entry =
            entries.get(key) ||
            {
                key,
                users: [
                    parts[1],
                    parts[2]
                ],
                duration: 0
            };

        entry.duration +=
            Math.max(
                0,
                now - startedAt
            );

        entries.set(
            key,
            entry
        );
    }

    return [...entries.values()]
        .filter(
            duo =>
                duo.users.length ===
                    2 &&
                duo.duration > 0
        )
        .sort(
            (a, b) =>
                b.duration -
                a.duration
        )
        .slice(
            0,
            limit
        );
}

// ------------------------------------------------------------
// RESET HEBDOMADAIRE DES STATISTIQUES
// ------------------------------------------------------------

const STATS_TIME_ZONE =
    "Europe/Paris";

function getStatsWeekKey(
    date = new Date()
) {
    const parts =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone:
                    STATS_TIME_ZONE,
                weekday:
                    "short",
                year:
                    "numeric",
                month:
                    "2-digit",
                day:
                    "2-digit"
            }
        ).formatToParts(
            date
        );

    const values =
        Object.fromEntries(
            parts.map(
                part => [
                    part.type,
                    part.value
                ]
            )
        );

    const localDate =
        Date.UTC(
            Number(values.year),
            Number(values.month) - 1,
            Number(values.day)
        );

    const sundayDate =
        new Date(
            localDate -
                new Date(
                    localDate
                ).getUTCDay() *
                    24 *
                    60 *
                    60 *
                    1000
        );

    return [
        sundayDate.getUTCFullYear(),
        String(
            sundayDate.getUTCMonth() + 1
        ).padStart(
            2,
            "0"
        ),
        String(
            sundayDate.getUTCDate()
        ).padStart(
            2,
            "0"
        )
    ].join("-");
}

function resetWeeklyStatisticsIfNeeded() {
    if (
        !db.statsReset ||
        typeof db.statsReset !==
            "object"
    ) {
        db.statsReset = {};
    }

    const weekKey =
        getStatsWeekKey();

    // Initialise le repère sans effacer
    // les anciennes statistiques déjà présentes.
    if (
        typeof db.statsReset.lastResetKey !==
        "string"
    ) {
        db.statsReset.lastResetKey =
            weekKey;
        saveDatabase();
        return false;
    }

    if (
        db.statsReset.lastResetKey ===
        weekKey
    ) {
        return false;
    }

    db.messages = {};
    db.voice = {};
    db.duos = {};

    for (
        const guildId of new Set([
            ...Object.keys(
                db.guilds
            ),
            ...client.guilds.cache.keys()
        ])
    ) {
        ensureGuild(
            guildId
        );
    }

    const now =
        Date.now();

    // Les sessions ouvertes repartent de zéro
    // au début de la nouvelle semaine.
    for (
        const key of voiceSessions.keys()
    ) {
        voiceSessions.set(
            key,
            now
        );
    }

    for (
        const key of duoVoiceSessions.keys()
    ) {
        duoVoiceSessions.set(
            key,
            now
        );
    }

    db.statsReset.lastResetKey =
        weekKey;

    saveDatabase();

    console.log(
        `📊 Statistiques réinitialisées pour la semaine du dimanche ${weekKey}.`
    );

    return true;
}

// ------------------------------------------------------------
// FORMATAGE LEADERBOARD MEMBRE
// ------------------------------------------------------------

function formatMemberLeaderboard(
    guild,
    entries,
    valueFormatter
) {
    if (
        entries.length === 0
    ) {
        return "Aucune donnée disponible.";
    }

    return entries
        .map(
            (
                entry,
                index
            ) => {
                const member =
                    guild.members.cache.get(
                        entry.userId
                    );

                const username =
                    member
                        ? member.user.username
                        : `Utilisateur ${entry.userId}`;

                let position;

                if (
                    index === 0
                ) {
                    position = "🥇";
                } else if (
                    index === 1
                ) {
                    position = "🥈";
                } else if (
                    index === 2
                ) {
                    position = "🥉";
                } else {
                    position =
                        `**${index + 1}.**`;
                }

                return (
                    `${position} **${username}** — ` +
                    `${valueFormatter(entry)}`
                );
            }
        )
        .join("\n");
}

// ------------------------------------------------------------
// FORMATAGE LEADERBOARD DUO
// ------------------------------------------------------------

function formatDuoLeaderboard(
    guild,
    entries
) {
    if (
        entries.length === 0
    ) {
        return "Aucune donnée disponible.";
    }

    return entries
        .map(
            (
                duo,
                index
            ) => {
                const memberA =
                    guild.members.cache.get(
                        duo.users[0]
                    );

                const memberB =
                    guild.members.cache.get(
                        duo.users[1]
                    );

                const nameA =
                    memberA
                        ? memberA.user.username
                        : `Utilisateur ${duo.users[0]}`;

                const nameB =
                    memberB
                        ? memberB.user.username
                        : `Utilisateur ${duo.users[1]}`;

                let position;

                if (
                    index === 0
                ) {
                    position = "🥇";
                } else if (
                    index === 1
                ) {
                    position = "🥈";
                } else if (
                    index === 2
                ) {
                    position = "🥉";
                } else {
                    position =
                        `**${index + 1}.**`;
                }

                return (
                    `${position} **${nameA} × ${nameB}** — ` +
                    `**${formatDuration(
                        duo.duration
                    )}**`
                );
            }
        )
        .join("\n");
}

// ------------------------------------------------------------
// +LEADERBOARD
// ------------------------------------------------------------

registerCommand(
    "leaderboard",
    {
        permission: 0,

        aliases: [
            "lb"
        ],

        execute: async message => {
            const guild =
                message.guild;

            const messageTop =
                getMessageLeaderboard(
                    guild,
                    1
                );

            const voiceTop =
                getVoiceLeaderboard(
                    guild,
                    1
                );

            const duoTop =
                getDuoLeaderboard(
                    guild,
                    1
                );

            const leaderboardEmbed =
                createEmbed({
                    title:
                        "🏆 Hirosaki • Leaderboard",
                    color:
                        COLORS.warning,
                    thumbnail:
                        guild.iconURL({
                            extension:
                                "png",
                            size:
                                512
                        }),
                    footer:
                        guild.name
                });

            leaderboardEmbed.addFields(
                {
                    name:
                        "💬 Top messages",
                    value:
                        formatMemberLeaderboard(
                            guild,
                            messageTop,
                            entry =>
                                `**${formatNumber(
                                    entry.count
                                )} messages**`
                        ),
                    inline:
                        false
                },
                {
                    name:
                        "🎙️ Top vocal",
                    value:
                        formatMemberLeaderboard(
                            guild,
                            voiceTop,
                            entry =>
                                `**${formatDuration(
                                    entry.duration
                                )}**`
                        ),
                    inline:
                        false
                },
                {
                    name:
                        "👥 Meilleur duo vocal",
                    value:
                        formatDuoLeaderboard(
                            guild,
                            duoTop
                        ),
                    inline:
                        false
                }
            );

            return sendEmbed(
                message,
                leaderboardEmbed
            );
        }
    }
);

// ------------------------------------------------------------
// MISE À JOUR DES DUOS D'UN SALON VOCAL
// ------------------------------------------------------------

function updateDuoSessions(
    guild
) {
    const activePairs =
        new Set();

    for (
        const channel of guild.channels.cache.values()
    ) {
        if (
            channel.type !==
            ChannelType.GuildVoice
        ) {
            continue;
        }

        const members =
            [...channel.members.values()]
                .filter(
                    member =>
                        !member.user.bot
                );

        if (
            members.length <
            2
        ) {
            continue;
        }

        for (
            let i = 0;
            i < members.length;
            i++
        ) {
            for (
                let j = i + 1;
                j < members.length;
                j++
            ) {
                const userA =
                    members[i].id;

                const userB =
                    members[j].id;

                const pairKey =
                    `${guild.id}:${createDuoKey(
                        userA,
                        userB
                    )}`;

                activePairs.add(
                    pairKey
                );

                startDuoSession(
                    guild.id,
                    userA,
                    userB
                );
            }
        }
    }

    // Ferme les sessions de duo
    // qui ne sont plus actives.
    for (
        const [
            key
        ] of duoVoiceSessions
    ) {
        if (
            !key.startsWith(
                `${guild.id}:`
            )
        ) {
            continue;
        }

        if (
            activePairs.has(key)
        ) {
            continue;
        }

        const parts =
            key.split(":");

        if (
            parts.length !==
            3
        ) {
            duoVoiceSessions.delete(
                key
            );

            continue;
        }

        finishDuoSession(
            guild.id,
            parts[1],
            parts[2]
        );
    }
}

// ------------------------------------------------------------
// MISE À JOUR DES SESSIONS VOCALES
// ------------------------------------------------------------

client.on(
    "voiceStateUpdate",
    async (
        oldState,
        newState
    ) => {
        if (
            !newState.guild
        ) {
            return;
        }

        const guild =
            newState.guild;

        if (
            newState.member?.user.bot ||
            oldState.member?.user.bot
        ) {
            return;
        }

        const userId =
            newState.id;

        // Entrée dans un vocal
        if (
            !oldState.channelId &&
            newState.channelId
        ) {
            startVoiceSession(
                guild.id,
                userId
            );
        }

        // Sortie complète du vocal
        if (
            oldState.channelId &&
            !newState.channelId
        ) {
            finishVoiceSession(
                guild.id,
                userId
            );
        }

        // Si le membre change de vocal,
        // sa durée continue normalement.
        updateDuoSessions(
            guild
        );
    }
);

// ------------------------------------------------------------
// SYNCHRONISATION VOCALE PÉRIODIQUE
// ------------------------------------------------------------

setInterval(
    () => {
        for (
            const guild of client.guilds.cache.values()
        ) {
            updateDuoSessions(
                guild
            );
        }
    },
    10_000
);

// ------------------------------------------------------------
// COMPTEUR DES MESSAGES
// ------------------------------------------------------------
//
// Le listener messageCreate sera centralisé plus bas.
// Cette fonction est volontairement séparée afin d'éviter
// d'avoir plusieurs listeners qui exécutent les commandes.
// ------------------------------------------------------------

function recordMessage(
    message
) {
    if (
        !message.guild ||
        message.author.bot
    ) {
        return;
    }

    addMessageStat(
        message.guild.id,
        message.author.id
    );
}
// ============================================================
// PARTIE 4/6 — PLANIFICATION, RÔLES, BIENVENUE & EMBEDS
// ============================================================

// ------------------------------------------------------------
// OUTIL : PARSER UNE HEURE
// ------------------------------------------------------------

function parseClockTime(value) {
    if (!value) {
        return null;
    }

    const match = String(value).match(
        /^([01]?\d|2[0-3]):([0-5]\d)$/
    );

    if (!match) {
        return null;
    }

    return {
        hour: Number(match[1]),
        minute: Number(match[2])
    };
}

// ------------------------------------------------------------
// ENVOI D'UN RAPPORT STATISTIQUES
// ------------------------------------------------------------

async function sendScheduledStat(guild) {
    const config =
        ensureGuild(guild.id);

    const channelId =
        config.statSchedule.channelId;

    if (!channelId) {
        return;
    }

    const channel =
        guild.channels.cache.get(
            channelId
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return;
    }

    const stats =
        getServerStatistics(guild);

    const statEmbed =
        createEmbed({
            title:
                "Hirosaki 🎆 Statistiques",
            color:
                COLORS.primary,
            thumbnail:
                guild.iconURL({
                    extension: "png",
                    size: 512
                }),
            footer:
                `${guild.name} • Statistiques automatiques`
        });

    statEmbed.addFields(
        {
            name: "👥 Membres",
            value:
                `**${formatNumber(
                    stats.members
                )}**`,
            inline: true
        },
        {
            name: "🟢 En ligne",
            value:
                `**${formatNumber(
                    stats.online
                )}**`,
            inline: true
        },
        {
            name: "🎙️ En vocal",
            value:
                `**${formatNumber(
                    stats.voice
                )}**`,
            inline: true
        },
        {
            name: "📺 En stream",
            value:
                `**${formatNumber(
                    stats.streaming
                )}**`,
            inline: true
        },
        {
            name: "🚀 Boosts",
            value:
                `**${formatNumber(
                    stats.boosts
                )}**`,
            inline: true
        }
    );

    await channel.send({
        embeds: [statEmbed]
    }).catch(() => {});
}

// ------------------------------------------------------------
// ENVOI D'UN LEADERBOARD AUTOMATIQUE
// ------------------------------------------------------------

async function sendScheduledLeaderboard(
    guild
) {
    const config =
        ensureGuild(guild.id);

    const channelId =
        config.leaderboardSchedule.channelId;

    if (!channelId) {
        return;
    }

    const channel =
        guild.channels.cache.get(
            channelId
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return;
    }

    const messageTop =
        getMessageLeaderboard(
            guild,
            1
        );

    const voiceTop =
        getVoiceLeaderboard(
            guild,
            1
        );

    const duoTop =
        getDuoLeaderboard(
            guild,
            1
        );

    const leaderboardEmbed =
        createEmbed({
            title:
                "🏆 Hirosaki • Leaderboard",
            color:
                COLORS.warning,
            thumbnail:
                guild.iconURL({
                    extension: "png",
                    size: 512
                }),
            footer:
                `${guild.name} • Leaderboard automatique`
        });

    leaderboardEmbed.addFields(
        {
            name:
                "💬 Top messages",
            value:
                formatMemberLeaderboard(
                    guild,
                    messageTop,
                    entry =>
                        `**${formatNumber(
                            entry.count
                        )} messages**`
                ),
            inline: false
        },
        {
            name:
                "🎙️ Top vocal",
            value:
                formatMemberLeaderboard(
                    guild,
                    voiceTop,
                    entry =>
                        `**${formatDuration(
                            entry.duration
                        )}**`
                ),
            inline: false
        },
        {
            name:
                "👥 Meilleur duo vocal",
            value:
                formatDuoLeaderboard(
                    guild,
                    duoTop
                ),
            inline: false
        }
    );

    await channel.send({
        embeds: [
            leaderboardEmbed
        ]
    }).catch(() => {});
}

// ------------------------------------------------------------
// +STAT-SCHEDULE
// ------------------------------------------------------------

registerCommand(
    "stat-schedule",
    {
        permission: 4,

        aliases: [
            "stat-auto"
        ],

        execute: async (
            message,
            args
        ) => {
            const config =
                ensureGuild(
                    message.guild.id
                );

            const action =
                (
                    args.shift() ||
                    ""
                ).toLowerCase();

            if (
                action ===
                "off"
            ) {
                config.statSchedule = {
                    enabled: false,
                    channelId: null,
                    hour: null,
                    minute: null
                };

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        "📊 L'envoi automatique des statistiques est désactivé."
                    )
                );
            }

            const channel =
                resolveChannel(
                    message.guild,
                    action
                );

            const timeValue =
                args.shift();

            const clock =
                parseClockTime(
                    timeValue
                );

            if (
                !channel ||
                !timeValue ||
                !clock
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}stat-schedule #salon HH:MM\`\n\n` +
                        `Pour désactiver : \`${PREFIX}stat-schedule off\``
                    )
                );
            }

            if (
                !channel.isTextBased()
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Le salon doit être un salon textuel."
                    )
                );
            }

            config.statSchedule = {
                enabled: true,
                channelId:
                    channel.id,
                hour:
                    clock.hour,
                minute:
                    clock.minute
            };

            saveDatabase();

            return sendEmbed(
                message,
                successEmbed(
                    `📊 Les statistiques seront automatiquement envoyées dans ${channel} tous les jours à **${String(
                        clock.hour
                    ).padStart(
                        2,
                        "0"
                    )}:${String(
                        clock.minute
                    ).padStart(
                        2,
                        "0"
                    )}.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +LEADERBOARD-SCHEDULE
// ------------------------------------------------------------

registerCommand(
    "leaderboard-schedule",
    {
        permission: 4,

        aliases: [
            "leaderboard-auto",
            "lb-schedule"
        ],

        execute: async (
            message,
            args
        ) => {
            const config =
                ensureGuild(
                    message.guild.id
                );

            const action =
                (
                    args.shift() ||
                    ""
                ).toLowerCase();

            if (
                action ===
                "off"
            ) {
                config.leaderboardSchedule = {
                    enabled: false,
                    channelId: null,
                    hour: null,
                    minute: null
                };

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        "🏆 L'envoi automatique du leaderboard est désactivé."
                    )
                );
            }

            const channel =
                resolveChannel(
                    message.guild,
                    action
                );

            const timeValue =
                args.shift();

            const clock =
                parseClockTime(
                    timeValue
                );

            if (
                !channel ||
                !timeValue ||
                !clock
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}leaderboard-schedule #salon HH:MM\`\n\n` +
                        `Pour désactiver : \`${PREFIX}leaderboard-schedule off\``
                    )
                );
            }

            if (
                !channel.isTextBased()
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Le salon doit être un salon textuel."
                    )
                );
            }

            config.leaderboardSchedule = {
                enabled: true,
                channelId:
                    channel.id,
                hour:
                    clock.hour,
                minute:
                    clock.minute
            };

            saveDatabase();

            return sendEmbed(
                message,
                successEmbed(
                    `🏆 Le leaderboard sera automatiquement envoyé dans ${channel} tous les jours à **${String(
                        clock.hour
                    ).padStart(
                        2,
                        "0"
                    )}:${String(
                        clock.minute
                    ).padStart(
                        2,
                        "0"
                    )}.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// PLANIFICATEUR GLOBAL
// ------------------------------------------------------------

let lastScheduleMinute =
    null;

setInterval(
    async () => {
        resetWeeklyStatisticsIfNeeded();

        const now =
            new Date();

        const hour =
            now.getHours();

        const minute =
            now.getMinutes();

        const currentKey =
            `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${hour}-${minute}`;

        if (
            currentKey ===
            lastScheduleMinute
        ) {
            return;
        }

        lastScheduleMinute =
            currentKey;

        for (
            const guild of client.guilds.cache.values()
        ) {
            const config =
                ensureGuild(
                    guild.id
                );

            if (
                config.statSchedule.enabled &&
                config.statSchedule.hour ===
                    hour &&
                config.statSchedule.minute ===
                    minute
            ) {
                await sendScheduledStat(
                    guild
                );
            }

            if (
                config.leaderboardSchedule.enabled &&
                config.leaderboardSchedule.hour ===
                    hour &&
                config.leaderboardSchedule.minute ===
                    minute
            ) {
                await sendScheduledLeaderboard(
                    guild
                );
            }
        }
    },
    10_000
);

// ------------------------------------------------------------
// +ADDROLE
// ------------------------------------------------------------

registerCommand(
    "addrole",
    {
        permission: 4,

        aliases: [
            "add-role"
        ],

        execute: async (
            message,
            args
        ) => {
            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            const role =
                resolveRole(
                    message.guild,
                    args.shift()
                );

            if (
                !member ||
                !role
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}addrole @membre @role\``
                    )
                );
            }

            if (
                role.managed
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Ce rôle est géré par une intégration et ne peut pas être attribué."
                    )
                );
            }

            if (
                role.position >=
                message.guild.members.me.roles.highest.position
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Ce rôle est au-dessus de mon rôle le plus haut."
                    )
                );
            }

            if (
                role.position >=
                message.member.roles.highest.position &&
                !isCrown(
                    message.member
                )
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Tu ne peux pas attribuer un rôle égal ou supérieur à ton rôle le plus haut."
                    )
                );
            }

            if (
                member.roles.cache.has(
                    role.id
                )
            ) {
                return sendEmbed(
                    message,
                    infoEmbed(
                        `ℹ️ ${member} possède déjà le rôle ${role}.`
                    )
                );
            }

            await member.roles.add(
                role,
                `Addrole par ${message.author.tag}`
            );

            return sendEmbed(
                message,
                successEmbed(
                    `✅ Le rôle ${role} a été ajouté à ${member}.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +REMOVE ROLE
// ------------------------------------------------------------

registerCommand(
    "remove-role",
    {
        permission: 4,

        aliases: [
            "removerole",
            "remove-roll",
            "removeroll"
        ],

        execute: async (
            message,
            args
        ) => {
            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            const role =
                resolveRole(
                    message.guild,
                    args.shift()
                );

            if (
                !member ||
                !role
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}remove-role @membre @role\``
                    )
                );
            }

            if (
                role.managed
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Ce rôle est géré par une intégration."
                    )
                );
            }

            if (
                role.position >=
                message.guild.members.me.roles.highest.position
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Ce rôle est au-dessus de mon rôle le plus haut."
                    )
                );
            }

            if (
                role.position >=
                message.member.roles.highest.position &&
                !isCrown(
                    message.member
                )
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Tu ne peux pas retirer un rôle égal ou supérieur à ton rôle le plus haut."
                    )
                );
            }

            if (
                !member.roles.cache.has(
                    role.id
                )
            ) {
                return sendEmbed(
                    message,
                    infoEmbed(
                        `ℹ️ ${member} ne possède pas le rôle ${role}.`
                    )
                );
            }

            await member.roles.remove(
                role,
                `Remove role par ${message.author.tag}`
            );

            return sendEmbed(
                message,
                successEmbed(
                    `✅ Le rôle ${role} a été retiré de ${member}.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +AUTOROLE
// ------------------------------------------------------------

registerCommand(
    "autorole",
    {
        permission: 4,

        execute: async (
            message,
            args
        ) => {
            const config =
                ensureGuild(
                    message.guild.id
                );

            const action =
                (
                    args.shift() ||
                    ""
                ).toLowerCase();

            if (
                action ===
                "off"
            ) {
                config.autorole = {
                    enabled: false,
                    roleId: null
                };

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        "🤖 L'autorôle a été désactivé."
                    )
                );
            }

            const role =
                resolveRole(
                    message.guild,
                    action
                );

            if (!role) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}autorole @role\`\n\n` +
                        `Pour désactiver : \`${PREFIX}autorole off\``
                    )
                );
            }

            if (
                role.managed
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Ce rôle ne peut pas être utilisé comme autorôle."
                    )
                );
            }

            if (
                role.position >=
                message.guild.members.me.roles.highest.position
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Le rôle choisi est au-dessus de mon rôle."
                    )
                );
            }

            config.autorole = {
                enabled: true,
                roleId:
                    role.id
            };

            saveDatabase();

            return sendEmbed(
                message,
                successEmbed(
                    `🤖 L'autorôle est maintenant configuré sur ${role}.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +WELCOME
// ------------------------------------------------------------

registerCommand(
    "welcome",
    {
        permission: 4,

        aliases: [
            "bienvenue"
        ],

        execute: async (
            message,
            args
        ) => {
            const config =
                ensureGuild(
                    message.guild.id
                );

            const action =
                (
                    args.shift() ||
                    ""
                ).toLowerCase();

            if (
                action ===
                "off"
            ) {
                config.welcome.enabled =
                    false;

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        "👋 Le système de bienvenue est désactivé."
                    )
                );
            }

            const channel =
                resolveChannel(
                    message.guild,
                    action
                );

            if (!channel) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}welcome #salon\`\n\n` +
                        `Pour désactiver : \`${PREFIX}welcome off\``
                    )
                );
            }

            if (
                !channel.isTextBased()
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Le salon doit être textuel."
                    )
                );
            }

            config.welcome.enabled =
                true;

            config.welcome.channelId =
                channel.id;

            saveDatabase();

            return sendEmbed(
                message,
                successEmbed(
                    `👋 Le salon de bienvenue est maintenant ${channel}.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +WELCOME-MESSAGE
// ------------------------------------------------------------

registerCommand(
    "welcome-message",
    {
        permission: 4,

        aliases: [
            "welcome-msg",
            "bienvenue-message"
        ],

        execute: async (
            message,
            args
        ) => {
            const config =
                ensureGuild(
                    message.guild.id
                );

            const text =
                args.join(" ");

            if (!text) {
                return sendEmbed(
                    message,
                    infoEmbed(
                        `Message actuel :\n\n${config.welcome.message}\n\n` +
                        `Variables disponibles :\n` +
                        `\`{user}\` • \`{username}\` • \`{member.count}\` • \`{server}\` • \`{server.name}\` • \`{server.id}\` • \`{member.id}\` • \`{member.tag}\` • \`{online}\``
                    )
                );
            }

            config.welcome.message =
                text;

            saveDatabase();

            return sendEmbed(
                message,
                successEmbed(
                    "✅ Le message de bienvenue a été modifié."
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +DM — CONFIGURATION DES MESSAGES PRIVÉS DE SANCTION
// ------------------------------------------------------------
//
// +dm on|off
// +dm message <texte>
//
// Variables disponibles : {user}, {username}, {server}, {sanction},
// {reason}, {moderator}, {sanction.id}
// ------------------------------------------------------------

registerCommand(
    "dm",
    {
        permission: 4,

        aliases: [
            "sanction-dm",
            "dmsanction"
        ],

        execute: async (
            message,
            args
        ) => {
            const config =
                ensureGuild(
                    message.guild.id
                );

            const action =
                (
                    args.shift() ||
                    ""
                ).toLowerCase();

            if (
                action === "on" ||
                action === "off"
            ) {
                config.dmSanctions.enabled =
                    action === "on";

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        action === "on"
                            ? "📩 Les messages privés de sanction sont activés."
                            : "📩 Les messages privés de sanction sont désactivés."
                    )
                );
            }

            if (
                action === "message" ||
                action === "msg"
            ) {
                const text =
                    args.join(" ").trim();

                if (!text) {
                    return sendEmbed(
                        message,
                        infoEmbed(
                            `Message actuel :\n\n${config.dmSanctions.message}`
                        )
                    );
                }

                config.dmSanctions.message =
                    text;

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        "✅ Le message privé de sanction a été modifié."
                    )
                );
            }

            return sendEmbed(
                message,
                infoEmbed(
                    `État actuel : **${config.dmSanctions.enabled ? "activé" : "désactivé"}**\n\n` +
                    `\`${PREFIX}dm on\` ou \`${PREFIX}dm off\`\n` +
                    `\`${PREFIX}dm message <texte>\``
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +EMBED
// ------------------------------------------------------------
//
// Permet de créer rapidement un embed.
// Format :
// +embed #salon | titre | description
// ------------------------------------------------------------

registerCommand(
    "embed",
    {
        permission: 4,

        aliases: [
            "createembed",
            "create-embed"
        ],

        execute: async (
            message,
            args
        ) => {
            const raw =
                args.join(" ");

            const parts =
                raw.split("|")
                    .map(
                        part =>
                            part.trim()
                    );

            if (
                parts.length <
                3
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}embed #salon | titre | description\``
                    )
                );
            }

            const channel =
                resolveChannel(
                    message.guild,
                    parts[0]
                );

            if (
                !channel ||
                !channel.isTextBased()
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Salon invalide."
                    )
                );
            }

            const title =
                parts[1];

            const description =
                parts
                    .slice(2)
                    .join(" | ");

            if (
                !title ||
                !description
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Le titre et la description sont obligatoires."
                    )
                );
            }

            const customEmbed =
                createEmbed({
                    title,
                    description,
                    color:
                        COLORS.primary,
                    thumbnail:
                        message.guild.iconURL({
                            extension:
                                "png",
                            size:
                                512
                        }),
                    footer:
                        message.guild.name
                });

            await channel.send({
                embeds: [
                    customEmbed
                ]
            });

            return sendEmbed(
                message,
                successEmbed(
                    `✅ Embed envoyé dans ${channel}.`
                )
            );
        }
    }
);
// ============================================================
// PARTIE 5/6 — TICKETS, RANK/DERANK, VOCAL & GIVEAWAYS
// ============================================================

// ------------------------------------------------------------
// OUTILS TICKETS
// ------------------------------------------------------------

function isTicketChannel(channel) {
    if (!channel) {
        return false;
    }

    return Boolean(
        channel.topic &&
        channel.topic.startsWith("hirosaki-ticket:")
    );
}

function getTicketOwnerId(channel) {
    if (!isTicketChannel(channel)) {
        return null;
    }

    return channel.topic.split(":")[1] || null;
}

function getTicketChannelName(config, username) {
    const template =
        config.ticket.ticketName ||
        "ticket-{username}";

    return template
        .replace(
            /\{username\}/gi,
            username.toLowerCase().replace(/[^a-z0-9-_]/g, "")
        )
        .slice(0, 90);
}

// ------------------------------------------------------------
// +TICKET-CONFIG
// ------------------------------------------------------------

registerCommand(
    "ticket-config",
    {
        permission: 4,

        aliases: [
            "ticketconfig"
        ],

        execute: async (
            message,
            args
        ) => {
            const config =
                ensureGuild(message.guild.id);

            const action =
                (args.shift() || "").toLowerCase();

            if (!action) {
                return sendEmbed(
                    message,
                    infoEmbed(
                        `Configuration actuelle :\n\n` +
                        `**Activé :** ${config.ticket.enabled ? "Oui" : "Non"}\n` +
                        `**Catégorie :** ${
                            config.ticket.categoryId
                                ? `<#${config.ticket.categoryId}>`
                                : "Non configurée"
                        }\n` +
                        `**Salon panel :** ${
                            config.ticket.panelChannelId
                                ? `<#${config.ticket.panelChannelId}>`
                                : "Non configuré"
                        }\n\n` +
                        `Commandes :\n` +
                        `\`${PREFIX}ticket-config on\`\n` +
                        `\`${PREFIX}ticket-config off\`\n` +
                        `\`${PREFIX}ticket-config category #catégorie\`\n` +
                        `\`${PREFIX}ticket-config panel #salon\``
                    )
                );
            }

            if (action === "on") {
                config.ticket.enabled = true;

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        "🎫 Le système de tickets est activé."
                    )
                );
            }

            if (action === "off") {
                config.ticket.enabled = false;

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        "🎫 Le système de tickets est désactivé."
                    )
                );
            }

            if (action === "category") {
                const value =
                    args.shift();

                const category =
                    resolveChannel(
                        message.guild,
                        value
                    );

                if (
                    !category ||
                    category.type !== ChannelType.GuildCategory
                ) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            `Utilisation : \`${PREFIX}ticket-config category #catégorie\``
                        )
                    );
                }

                config.ticket.categoryId =
                    category.id;

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        `🎫 Catégorie des tickets configurée sur ${category}.`
                    )
                );
            }

            if (action === "panel") {
                const value =
                    args.shift();

                const channel =
                    resolveChannel(
                        message.guild,
                        value
                    );

                if (
                    !channel ||
                    !channel.isTextBased()
                ) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            `Utilisation : \`${PREFIX}ticket-config panel #salon\``
                        )
                    );
                }

                config.ticket.panelChannelId =
                    channel.id;

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        `🎫 Salon du panel ticket configuré sur ${channel}.`
                    )
                );
            }

            return sendEmbed(
                message,
                errorEmbed(
                    "❌ Option inconnue."
                )
            );
        }
    }
);

// ------------------------------------------------------------
// CRÉATION DU PANEL TICKET
// ------------------------------------------------------------

async function createTicketPanel(guild) {
    const config =
        ensureGuild(guild.id);

    if (
        !config.ticket.panelChannelId
    ) {
        return null;
    }

    const channel =
        guild.channels.cache.get(
            config.ticket.panelChannelId
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return null;
    }

    const embed =
        createEmbed({
            title:
                config.ticket.title,
            description:
                config.ticket.description,
            color:
                COLORS.primary,
            thumbnail:
                guild.iconURL({
                    extension: "png",
                    size: 512
                }),
            footer:
                guild.name
        });

    const button =
        new ButtonBuilder()
            .setCustomId(
                "hirosaki_ticket_create"
            )
            .setLabel(
                config.ticket.buttonLabel ||
                    "Créer un ticket"
            )
            .setEmoji(
                config.ticket.buttonEmoji ||
                    "🎫"
            )
            .setStyle(
                ButtonStyle.Primary
            );

    const row =
        new ActionRowBuilder()
            .addComponents(
                button
            );

    const sent =
        await channel.send({
            embeds: [embed],
            components: [row]
        }).catch(() => null);

    if (!sent) {
        return null;
    }

    config.ticket.panelMessageId =
        sent.id;

    saveDatabase();

    return sent;
}

// ------------------------------------------------------------
// +TICKET
// ------------------------------------------------------------

registerCommand(
    "ticket",
    {
        permission: 4,

        aliases: [
            "tickets"
        ],

        execute: async (
            message,
            args
        ) => {
            const config =
                ensureGuild(message.guild.id);

            const action =
                (args.shift() || "").toLowerCase();

            if (action === "panel") {
                if (
                    !config.ticket.panelChannelId
                ) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            `Configure d'abord le salon avec \`${PREFIX}ticket-config panel #salon\`.`
                        )
                    );
                }

                const panel =
                    await createTicketPanel(
                        message.guild
                    );

                if (!panel) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            "❌ Impossible d'envoyer le panel ticket."
                        )
                    );
                }

                return sendEmbed(
                    message,
                    successEmbed(
                        `🎫 Panel ticket envoyé dans <#${config.ticket.panelChannelId}>.`
                    )
                );
            }

            if (action === "title") {
                const title =
                    args.join(" ");

                if (!title) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            `Utilisation : \`${PREFIX}ticket title Nouveau titre\``
                        )
                    );
                }

                config.ticket.title =
                    title;

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        "✅ Le titre du panel ticket a été modifié."
                    )
                );
            }

            if (action === "description") {
                const description =
                    args.join(" ");

                if (!description) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            `Utilisation : \`${PREFIX}ticket description Texte du panel\``
                        )
                    );
                }

                config.ticket.description =
                    description;

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        "✅ La description du panel ticket a été modifiée."
                    )
                );
            }

            if (action === "button") {
                const label =
                    args.join(" ");

                if (!label) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            `Utilisation : \`${PREFIX}ticket button Nom du bouton\``
                        )
                    );
                }

                config.ticket.buttonLabel =
                    label.slice(0, 80);

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        "✅ Le bouton du panel ticket a été modifié."
                    )
                );
            }

            return sendEmbed(
                message,
                infoEmbed(
                    `Commandes ticket :\n\n` +
                    `\`${PREFIX}ticket panel\` — envoyer le panel\n` +
                    `\`${PREFIX}ticket title <texte>\`\n` +
                    `\`${PREFIX}ticket description <texte>\`\n` +
                    `\`${PREFIX}ticket button <texte>\`\n` +
                    `\`${PREFIX}ticket-config on/off\`\n` +
                    `\`${PREFIX}ticket-config category #catégorie\`\n` +
                    `\`${PREFIX}ticket-config panel #salon\``
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +TICKET-ADD
// ------------------------------------------------------------

registerCommand(
    "ticket-add",
    {
        permission: 0,

        aliases: [
            "ticketadd"
        ],

        execute: async (
            message,
            args
        ) => {
            if (
                !(await requireTicketPermission(message))
            ) {
                return;
            }

            if (
                !isTicketChannel(message.channel)
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Cette commande doit être utilisée dans un ticket."
                    )
                );
            }

            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            if (!member) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}ticket-add @membre\``
                    )
                );
            }

            await message.channel.permissionOverwrites.edit(
                member.id,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                    EmbedLinks: true
                }
            );

            return sendEmbed(
                message,
                successEmbed(
                    `✅ ${member} a été ajouté au ticket.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +TICKET-CLAIM
// ------------------------------------------------------------

registerCommand(
    "ticket-claim",
    {
        permission: 0,

        aliases: [
            "ticketclaim"
        ],

        execute: async message => {
            if (
                !(await requireTicketPermission(message))
            ) {
                return;
            }

            if (
                !isTicketChannel(message.channel)
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Cette commande doit être utilisée dans un ticket."
                    )
                );
            }

            await message.channel.permissionOverwrites.edit(
                message.author.id,
                {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }
            );

            return sendEmbed(
                message,
                successEmbed(
                    `🎫 Ticket pris en charge par ${message.author}.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +TICKET-CLOSE
// ------------------------------------------------------------

registerCommand(
    "ticket-close",
    {
        permission: 0,

        aliases: [
            "ticketclose"
        ],

        execute: async message => {
            if (
                !(await requireTicketPermission(message))
            ) {
                return;
            }

            if (
                !isTicketChannel(message.channel)
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Cette commande doit être utilisée dans un ticket."
                    )
                );
            }

            const channel =
                message.channel;

            await sendEmbed(
                message,
                successEmbed(
                    "🔒 Ce ticket va être fermé dans quelques secondes."
                )
            );

            const config =
                ensureGuild(
                    message.guild.id
                );

            const delay =
                Math.max(
                    1,
                    Number(
                        config.ticket.closeDelay
                    ) || 5
                );

            setTimeout(
                async () => {
                    await channel.delete(
                        "Ticket fermé"
                    ).catch(() => {});
                },
                delay * 1000
            );
        }
    }
);

// ------------------------------------------------------------
// CRÉATION D'UN TICKET
// ------------------------------------------------------------

async function createTicketForMember(
    interaction
) {
    const guild =
        interaction.guild;

    const member =
        interaction.member;

    const config =
        ensureGuild(guild.id);

    if (
        !config.ticket.enabled
    ) {
        return interaction.reply({
            embeds: [
                errorEmbed(
                    "❌ Le système de tickets est actuellement désactivé."
                )
            ],
            ephemeral: true
        });
    }

    const existing =
        guild.channels.cache.find(
            channel =>
                isTicketChannel(channel) &&
                getTicketOwnerId(channel) ===
                    member.id
        );

    if (existing) {
        return interaction.reply({
            embeds: [
                infoEmbed(
                    `🎫 Tu as déjà un ticket ouvert : ${existing}`
                )
            ],
            ephemeral: true
        });
    }

    let parent = null;

    if (
        config.ticket.categoryId
    ) {
        const category =
            guild.channels.cache.get(
                config.ticket.categoryId
            );

        if (
            category &&
            category.type ===
                ChannelType.GuildCategory
        ) {
            parent = category;
        }
    }

    const permissionOverwrites = [
        {
            id:
                guild.roles.everyone.id,
            deny: [
                PermissionsBitField.Flags.ViewChannel
            ]
        },
        {
            id:
                member.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks
            ]
        }
    ];

    const ticketRole =
        getTicketRole(guild);

    if (ticketRole) {
        permissionOverwrites.push({
            id: ticketRole.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks
            ]
        });
    }

    const channel =
        await guild.channels.create({
            name:
                getTicketChannelName(
                    config,
                    member.user.username
                ),
            type:
                ChannelType.GuildText,
            parent:
                parent
                    ? parent.id
                    : undefined,
            topic:
                `hirosaki-ticket:${member.id}`,
            permissionOverwrites
        }).catch(() => null);

    if (!channel) {
        return interaction.reply({
            embeds: [
                errorEmbed(
                    "❌ Impossible de créer le ticket. Vérifie les permissions du bot."
                )
            ],
            ephemeral: true
        });
    }

    const embed =
        createEmbed({
            title:
                "🎫 Ticket ouvert",
            description:
                `Bienvenue ${member} !\n\n` +
                `Explique ta demande et un membre de **Gestion ticket** viendra t'aider.\n\n` +
                `Utilise \`${PREFIX}ticket-close\` pour fermer le ticket.`,
            color:
                COLORS.primary,
            thumbnail:
                guild.iconURL({
                    extension: "png",
                    size: 256
                }),
            footer:
                guild.name
        });

    await channel.send({
        content:
            `${member}${ticketRole ? ` <@&${ticketRole.id}>` : ""}`,
        embeds: [
            embed
        ],
        allowedMentions: {
            users: [
                member.id
            ],
            roles:
                ticketRole
                    ? [ticketRole.id]
                    : []
        }
    });

    return interaction.reply({
        embeds: [
            successEmbed(
                `🎫 Ton ticket a été créé : ${channel}`
            )
        ],
        ephemeral: true
    });
}

// ------------------------------------------------------------
// +RANK
// ------------------------------------------------------------

registerCommand(
    "rank",
    {
        crownOnly: true,

        execute: async (
            message,
            args
        ) => {
            if (
                !(await requireCrown(message))
            ) {
                return;
            }

            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            const botHighestRole =
                message.guild.members.me?.roles.highest;

            if (!member) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}rank @membre\``
                    )
                );
            }

            if (!botHighestRole) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Je ne peux pas déterminer mon rôle le plus élevé."
                    )
                );
            }

            const currentRole =
                member.roles.cache
                    .filter(
                        role =>
                            role.id !==
                                message.guild.id &&
                            !role.managed
                    )
                    .sort(
                        (a, b) =>
                            b.position -
                            a.position
                    )
                    .first();

            if (
                currentRole &&
                currentRole.position >=
                    botHighestRole.position
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Je ne peux pas modifier ce membre car son rôle est au-dessus ou au même niveau que le mien."
                    )
                );
            }

            const nextRole =
                message.guild.roles.cache
                    .filter(
                        role =>
                            role.id !==
                                message.guild.id &&
                            !role.managed &&
                            role.position <
                                botHighestRole.position &&
                            role.position >
                                (currentRole?.position ??
                                    0)
                    )
                    .sort(
                        (a, b) =>
                            a.position -
                            b.position
                    )
                    .first();

            if (!nextRole) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        currentRole
                            ? `❌ ${member} possède déjà le rôle le plus élevé que je peux attribuer.`
                            : `❌ Aucun rôle attribuable n'est disponible pour ${member}.`
                    )
                );
            }

            if (currentRole) {
                await member.roles.remove(
                    currentRole,
                    `Ancien rôle retiré lors du rank par ${message.author.tag}`
                );
            }

            await member.roles.add(
                nextRole,
                `Rank automatique par ${message.author.tag}`
            );

            return sendEmbed(
                message,
                successEmbed(
                    `⬆️ ${member} passe au rôle ${nextRole}.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +DERANK
// ------------------------------------------------------------

registerCommand(
    "derank",
    {
        crownOnly: true,

        execute: async (
            message,
            args
        ) => {
            if (
                !(await requireCrown(message))
            ) {
                return;
            }

            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            const botHighestRole =
                message.guild.members.me?.roles.highest;

            if (!member) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}derank @membre\``
                    )
                );
            }

            if (!botHighestRole) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Je ne peux pas déterminer mon rôle le plus élevé."
                    )
                );
            }

            const currentRole =
                member.roles.cache
                    .filter(
                        role =>
                            role.id !==
                                message.guild.id &&
                            !role.managed
                    )
                    .sort(
                        (a, b) =>
                            b.position -
                            a.position
                    )
                    .first();

            if (!currentRole) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `❌ ${member} n'a pas de rôle attribuable à retirer.`
                    )
                );
            }

            if (
                currentRole.position >=
                botHighestRole.position
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Je ne peux pas modifier ce membre car son rôle est au-dessus ou au même niveau que le mien."
                    )
                );
            }

            const previousRole =
                message.guild.roles.cache
                    .filter(
                        role =>
                            role.id !==
                                message.guild.id &&
                            !role.managed &&
                            role.position <
                                currentRole.position &&
                            role.position <
                                botHighestRole.position
                    )
                    .sort(
                        (a, b) =>
                            b.position -
                            a.position
                    )
                    .first();

            if (!previousRole) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `❌ ${member} possède déjà le rôle le plus bas que je peux gérer.`
                    )
                );
            }

            await member.roles.remove(
                currentRole,
                `Ancien rôle retiré lors du derank par ${message.author.tag}`
            );

            await member.roles.add(
                previousRole,
                `Derank automatique par ${message.author.tag}`
            );

            return sendEmbed(
                message,
                successEmbed(
                    `⬇️ ${member} descend au rôle ${previousRole}.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +JOINVOICE
// ------------------------------------------------------------

registerCommand(
    "joinvoice",
    {
        permission: 4,

        aliases: [
            "join-voc",
            "joinvoc"
        ],

        execute: async message => {
            const voiceChannel =
                message.member?.voice?.channel;

            if (!voiceChannel) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Tu dois être dans un salon vocal pour que je te rejoigne."
                    )
                );
            }

            const botMember =
                message.guild.members.me;

            if (!botMember) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Impossible de récupérer mon membre Discord."
                    )
                );
            }

            const permissions =
                voiceChannel.permissionsFor(
                    botMember
                );

            if (
                !permissions?.has(
                    PermissionsBitField.Flags.Connect
                )
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Je n'ai pas la permission de rejoindre ce salon vocal."
                    )
                );
            }

            return sendEmbed(
                message,
                infoEmbed(
                    `🎙️ La connexion vocale sera gérée par le système vocal du bot dans la partie finale.`
                )
            );
        }
    }
);

// ============================================================
// GIVEAWAYS
// ============================================================

function ensureGiveaways(guildId) {
    ensureGuild(guildId);

    if (
        !db.giveaways[guildId] ||
        typeof db.giveaways[guildId] !== "object"
    ) {
        db.giveaways[guildId] = {};
    }

    return db.giveaways[guildId];
}

function generateGiveawayId() {
    return (
        `${Date.now()}-` +
        Math.random()
            .toString(36)
            .slice(2, 8)
    );
}

function getGiveawayEntries(
    giveaway
) {
    return Array.isArray(
        giveaway.entries
    )
        ? giveaway.entries
        : [];
}

function pickGiveawayWinner(
    giveaway
) {
    const entries =
        getGiveawayEntries(
            giveaway
        );

    if (
        entries.length === 0
    ) {
        return null;
    }

    const index =
        Math.floor(
            Math.random() *
                entries.length
        );

    return entries[index];
}

// ------------------------------------------------------------
// +GIVEAWAY
// ------------------------------------------------------------

registerCommand(
    "giveaway",
    {
        permission: 4,

        aliases: [
            "giveaways"
        ],

        execute: async (
            message,
            args
        ) => {
            const action =
                (
                    args.shift() ||
                    ""
                ).toLowerCase();

            const giveaways =
                ensureGiveaways(
                    message.guild.id
                );

            if (
                action === "start"
            ) {
                const duration =
                    parseDuration(
                        args.shift()
                    );

                const winners =
                    Number(
                        args.shift()
                    );

                const prize =
                    args.join(" ");

                if (
                    !duration ||
                    !winners ||
                    winners < 1 ||
                    !prize
                ) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            `Utilisation : \`${PREFIX}giveaway start 1h 1 Prix\``
                        )
                    );
                }

                const giveawayId =
                    generateGiveawayId();

                const giveaway = {
                    id:
                        giveawayId,
                    guildId:
                        message.guild.id,
                    channelId:
                        message.channel.id,
                    messageId:
                        null,
                    prize,
                    winners,
                    duration,
                    endAt:
                        Date.now() +
                        duration,
                    entries: [],
                    ended: false
                };

                const endTimestamp =
                    Math.floor(
                        giveaway.endAt /
                            1000
                    );

                const giveawayEmbed =
                    createEmbed({
                        title:
                            "🎉 GIVEAWAY",
                        description:
                            `## ${prize}\n\n` +
                            `🏆 **Gagnant(s) :** ${winners}\n` +
                            `⏰ **Fin :** <t:${endTimestamp}:R>\n\n` +
                            `Clique sur 🎉 pour participer !`,
                        color:
                            COLORS.warning,
                        thumbnail:
                            message.guild.iconURL({
                                extension:
                                    "png",
                                size:
                                    512
                            }),
                        footer:
                            `ID : ${giveawayId}`
                    });

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    `hirosaki_giveaway_join:${giveawayId}`
                                )
                                .setLabel(
                                    "Participer"
                                )
                                .setEmoji(
                                    "🎉"
                                )
                                .setStyle(
                                    ButtonStyle.Success
                                )
                        );

                const giveawayMessage =
                    await message.channel.send({
                        embeds: [
                            giveawayEmbed
                        ],
                        components: [
                            row
                        ]
                    }).catch(
                        () => null
                    );

                if (!giveawayMessage) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            "❌ Impossible de créer le giveaway."
                        )
                    );
                }

                giveaway.messageId =
                    giveawayMessage.id;

                giveaways[giveawayId] =
                    giveaway;

                saveDatabase();

                return sendEmbed(
                    message,
                    successEmbed(
                        `🎉 Giveaway créé !\n**ID :** \`${giveawayId}\``
                    )
                );
            }

            if (
                action === "reroll" ||
                action === "rerooll"
            ) {
                const giveawayId =
                    args.shift();

                const giveaway =
                    giveaways[
                        giveawayId
                    ];

                if (!giveaway) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            "❌ Giveaway introuvable."
                        )
                    );
                }

                const winner =
                    pickGiveawayWinner(
                        giveaway
                    );

                if (!winner) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            "❌ Aucun participant disponible pour effectuer un reroll."
                        )
                    );
                }

                return sendEmbed(
                    message,
                    successEmbed(
                        `🎉 Nouveau gagnant : <@${winner}> !\n\n` +
                        `**Prix :** ${giveaway.prize}`
                    )
                );
            }

            if (
                action === "end"
            ) {
                const giveawayId =
                    args.shift();

                const giveaway =
                    giveaways[
                        giveawayId
                    ];

                if (!giveaway) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            "❌ Giveaway introuvable."
                        )
                    );
                }

                if (
                    giveaway.ended
                ) {
                    return sendEmbed(
                        message,
                        infoEmbed(
                            "Ce giveaway est déjà terminé."
                        )
                    );
                }

                await finishGiveaway(
                    message.guild,
                    giveawayId
                );

                return;
            }

            return sendEmbed(
                message,
                infoEmbed(
                    `Commandes giveaway :\n\n` +
                    `\`${PREFIX}giveaway start 1h 1 Prix\`\n` +
                    `\`${PREFIX}giveaway end ID\`\n` +
                    `\`${PREFIX}giveaway reroll ID\``
                )
            );
        }
    }
);

// ------------------------------------------------------------
// FIN D'UN GIVEAWAY
// ------------------------------------------------------------

async function finishGiveaway(
    guild,
    giveawayId
) {
    const giveaways =
        ensureGiveaways(
            guild.id
        );

    const giveaway =
        giveaways[
            giveawayId
        ];

    if (
        !giveaway ||
        giveaway.ended
    ) {
        return;
    }

    giveaway.ended =
        true;

    const entries =
        getGiveawayEntries(
            giveaway
        );

    const winners = [];

    const available =
        [...entries];

    const amount =
        Math.min(
            giveaway.winners,
            available.length
        );

    for (
        let i = 0;
        i < amount;
        i++
    ) {
        const index =
            Math.floor(
                Math.random() *
                    available.length
            );

        winners.push(
            available[index]
        );

        available.splice(
            index,
            1
        );
    }

    const channel =
        guild.channels.cache.get(
            giveaway.channelId
        );

    if (channel?.isTextBased()) {
        const winnerText =
            winners.length
                ? winners
                      .map(
                          id =>
                              `<@${id}>`
                      )
                      .join(", ")
                : "Aucun gagnant";

        const embed =
            createEmbed({
                title:
                    "🎉 Giveaway terminé",
                description:
                    `**Prix :** ${giveaway.prize}\n\n` +
                    `🏆 **Gagnant(s) :** ${winnerText}`,
                color:
                    COLORS.success,
                thumbnail:
                    guild.iconURL({
                        extension:
                            "png",
                        size:
                            512
                    }),
                footer:
                    `ID : ${giveaway.id}`
            });

        await channel.send({
            embeds: [
                embed
            ]
        }).catch(() => {});
    }

    saveDatabase();
}

// ------------------------------------------------------------
// VÉRIFICATION AUTOMATIQUE DES GIVEAWAYS
// ------------------------------------------------------------

setInterval(
    async () => {
        const now =
            Date.now();

        for (
            const guild of client.guilds.cache.values()
        ) {
            const giveaways =
                ensureGiveaways(
                    guild.id
                );

            for (
                const [
                    giveawayId,
                    giveaway
                ] of Object.entries(
                    giveaways
                )
            ) {
                if (
                    giveaway.ended
                ) {
                    continue;
                }

                if (
                    giveaway.endAt <=
                    now
                ) {
                    await finishGiveaway(
                        guild,
                        giveawayId
                    );
                }
            }
        }
    },
    5_000
);

// ============================================================
// INTERACTIONS — TICKETS & GIVEAWAYS
// ============================================================

client.on(
    "interactionCreate",
    async interaction => {
        if (
            !interaction.isButton()
        ) {
            return;
        }

        try {
            // ------------------------------
            // CRÉATION TICKET
            // ------------------------------

            if (
                interaction.customId ===
                "hirosaki_ticket_create"
            ) {
                await createTicketForMember(
                    interaction
                );

                return;
            }

            // ------------------------------
            // PARTICIPATION GIVEAWAY
            // ------------------------------

            if (
                interaction.customId.startsWith(
                    "hirosaki_giveaway_join:"
                )
            ) {
                const giveawayId =
                    interaction.customId.split(
                        ":"
                    )[1];

                const giveaways =
                    ensureGiveaways(
                        interaction.guild.id
                    );

                const giveaway =
                    giveaways[
                        giveawayId
                    ];

                if (
                    !giveaway ||
                    giveaway.ended
                ) {
                    return interaction.reply({
                        embeds: [
                            errorEmbed(
                                "❌ Ce giveaway est terminé ou introuvable."
                            )
                        ],
                        ephemeral: true
                    });
                }

                if (
                    giveaway.endAt <=
                    Date.now()
                ) {
                    await finishGiveaway(
                        interaction.guild,
                        giveawayId
                    );

                    return interaction.reply({
                        embeds: [
                            errorEmbed(
                                "❌ Ce giveaway vient de se terminer."
                            )
                        ],
                        ephemeral: true
                    });
                }

                const entries =
                    getGiveawayEntries(
                        giveaway
                    );

                const index =
                    entries.indexOf(
                        interaction.user.id
                    );

                if (
                    index !== -1
                ) {
                    entries.splice(
                        index,
                        1
                    );

                    saveDatabase();

                    return interaction.reply({
                        embeds: [
                            infoEmbed(
                                "↩️ Tu as été retiré du giveaway."
                            )
                        ],
                        ephemeral: true
                    });
                }

                entries.push(
                    interaction.user.id
                );

                giveaway.entries =
                    entries;

                saveDatabase();

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "🎉 Tu participes maintenant au giveaway !"
                        )
                    ],
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error(
                "Erreur interaction partie 5 :",
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                await interaction.reply({
                    embeds: [
                        errorEmbed(
                            "❌ Une erreur est survenue."
                        )
                    ],
                    ephemeral: true
                }).catch(
                    () => {}
                );
            }
        }
    }
);
// ============================================================
// PARTIE 6/6 — STAT, LEADERBOARD, SANCTIONS, CLEAR, HELP,
//             BIENVENUE, AUTOROLE ET ÉVÉNEMENTS
// ============================================================

// ------------------------------------------------------------
// +STAT
// ------------------------------------------------------------

registerCommand(
    "stat",
    {
        permission: 0,

        aliases: [
            "stats",
            "statistics"
        ],

        execute: async message => {
            const guild =
                message.guild;

            const stats =
                getServerStatistics(
                    guild
                );

            const embed =
                createEmbed({
                    title:
                        "Hirosaki 🎆 Statistiques",
                    color:
                        COLORS.primary,
                    thumbnail:
                        guild.iconURL({
                            extension: "png",
                            size: 512
                        }),
                    footer:
                        `${guild.name} • ID : ${guild.id}`
                });

            embed.addFields(
                {
                    name: "👥 Membres",
                    value:
                        `**${formatNumber(
                            stats.members
                        )}**`,
                    inline: true
                },
                {
                    name: "🟢 En ligne",
                    value:
                        `**${formatNumber(
                            stats.online
                        )}**`,
                    inline: true
                },
                {
                    name: "🎙️ En vocal",
                    value:
                        `**${formatNumber(
                            stats.voice
                        )}**`,
                    inline: true
                },
                {
                    name: "📺 En stream",
                    value:
                        `**${formatNumber(
                            stats.streaming
                        )}**`,
                    inline: true
                },
                {
                    name: "🚀 Boosts",
                    value:
                        `**${formatNumber(
                            stats.boosts
                        )}**`,
                    inline: true
                }
            );

            return sendEmbed(
                message,
                embed
            );
        }
    }
);

// ------------------------------------------------------------
// +LEADERBOARD
// ------------------------------------------------------------

registerCommand(
    "leaderboard",
    {
        permission: 0,

        aliases: [
            "lb"
        ],

        execute: async message => {
            const guild =
                message.guild;

            // IMPORTANT :
            // Les trois classements sont dans
            // UN SEUL EMBED.
            const messageTop =
                getMessageLeaderboard(
                    guild,
                    1
                );

            const voiceTop =
                getVoiceLeaderboard(
                    guild,
                    1
                );

            const duoTop =
                getDuoLeaderboard(
                    guild,
                    1
                );

            const embed =
                createEmbed({
                    title:
                        "🏆 Hirosaki • Leaderboard",
                    description:
                        "Classement des membres les plus actifs du serveur.",
                    color:
                        COLORS.warning,
                    thumbnail:
                        guild.iconURL({
                            extension: "png",
                            size: 512
                        }),
                    footer:
                        guild.name
                });

            embed.addFields(
                {
                    name:
                        "💬 Top messages",
                    value:
                        formatMemberLeaderboard(
                            guild,
                            messageTop,
                            entry =>
                                `**${formatNumber(
                                    entry.count
                                )} messages**`
                        ),
                    inline: false
                },
                {
                    name:
                        "🎙️ Top vocal",
                    value:
                        formatMemberLeaderboard(
                            guild,
                            voiceTop,
                            entry =>
                                `**${formatDuration(
                                    entry.duration
                                )}**`
                        ),
                    inline: false
                },
                {
                    name:
                        "👥 Meilleur duo vocal",
                    value:
                        formatDuoLeaderboard(
                            guild,
                            duoTop
                        ),
                    inline: false
                }
            );

            return sendEmbed(
                message,
                embed
            );
        }
    }
);

// ------------------------------------------------------------
// +CLEAR
// ------------------------------------------------------------

registerCommand(
    "clear",
    {
        permission: 3,

        aliases: [],

        execute: async (
            message,
            args
        ) => {
            const amount =
                Number(
                    args.shift()
                );

            if (
                !Number.isInteger(
                    amount
                ) ||
                amount < 1 ||
                amount > 100
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}clear 1-100\``
                    )
                );
            }

            if (
                !message.channel.isTextBased()
            ) {
                return;
            }

            const deleted =
                await message.channel.bulkDelete(
                    amount,
                    true
                ).catch(
                    () => null
                );

            if (!deleted) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Impossible de supprimer les messages."
                    )
                );
            }

            const confirmation =
                await message.channel.send({
                    embeds: [
                        successEmbed(
                            `🧹 **${deleted.size}** message(s) supprimé(s).`
                        )
                    ]
                }).catch(
                    () => null
                );

            if (confirmation) {
                setTimeout(
                    () =>
                        confirmation.delete()
                            .catch(() => {}),
                    3000
                );
            }
        }
    }
);

// ------------------------------------------------------------
// +PURGE
// ------------------------------------------------------------

registerCommand(
    "purge",
    {
        permission: 3,

        execute: async (
            message,
            args
        ) => {
            const amount =
                Number(
                    args.shift()
                );

            if (
                !Number.isInteger(
                    amount
                ) ||
                amount < 1 ||
                amount > 100
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}purge 1-100\``
                    )
                );
            }

            const deleted =
                await message.channel.bulkDelete(
                    amount,
                    true
                ).catch(
                    () => null
                );

            if (!deleted) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Impossible de supprimer les messages."
                    )
                );
            }

            return sendEmbed(
                message,
                successEmbed(
                    `🧹 **${deleted.size}** message(s) supprimé(s).`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +CLEAR SANCTION
// ------------------------------------------------------------

registerCommand(
    "clear-sanction",
    {
        permission: 2,

        aliases: [
            "clearsanction"
        ],

        execute: async (
            message,
            args
        ) => {
            const member =
                await resolveMember(
                    message,
                    args.shift()
                );

            if (!member) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        `Utilisation : \`${PREFIX}clear-sanction @membre\``
                    )
                );
            }

            const guildData =
                ensureGuild(
                    message.guild.id
                );

            if (
                !guildData.sanctions[
                    member.id
                ]
            ) {
                guildData.sanctions[
                    member.id
                ] = [];
            }

            guildData.sanctions[
                member.id
            ] = [];

            saveDatabase();

            return sendEmbed(
                message,
                successEmbed(
                    `🧹 Toutes les sanctions de ${member} ont été supprimées.`
                )
            );
        }
    }
);

// ------------------------------------------------------------
// +BANLIST
// ------------------------------------------------------------

registerCommand(
    "banlist",
    {
        permission: 5,

        aliases: [
            "ban-list"
        ],

        execute: async message => {
            const bans =
                await message.guild.bans.fetch()
                    .catch(() => null);

            if (!bans) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Impossible de récupérer la liste des bannis."
                    )
                );
            }

            if (bans.size === 0) {
                return sendEmbed(
                    message,
                    infoEmbed(
                        "🔨 Aucun membre n'est actuellement banni."
                    )
                );
            }

            const entries =
                [...bans.values()]
                    .slice(0, 50);

            const description =
                entries
                    .map(
                        (ban, index) =>
                            `**${index + 1}.** ${ban.user.tag}\n` +
                            `> \`${ban.user.id}\``
                    )
                    .join("\n\n");

            const embed =
                createEmbed({
                    title:
                        "🔨 Hirosaki • Liste des bannis",
                    description,
                    color:
                        COLORS.danger,
                    thumbnail:
                        message.guild.iconURL({
                            extension: "png",
                            size: 512
                        }),
                    footer:
                        `${bans.size} bannissement(s)`
                });

            return sendEmbed(
                message,
                embed
            );
        }
    }
);

// ============================================================
// HELP AVEC PAGES
// ============================================================

function getHelpPages() {
    return [
        {
            title:
                "Hirosaki 🎆 • Perm 0",
            description:
                "**Gestion ticket**\n\n" +
                `\`${PREFIX}ticket-add\`\n` +
                `\`${PREFIX}ticket-close\`\n` +
                `\`${PREFIX}ticket-claim\`\n\n` +
                "Perm 0 correspond au rôle **Gestion ticket**."
        },

        {
            title:
                "Hirosaki 🎆 • Perm 1",
            description:
                "**Modérateur test**\n\n" +
                `\`${PREFIX}snipe\`\n\n` +
                "Permissions héritées de la Perm 1."
        },

        {
            title:
                "Hirosaki 🎆 • Perm 2",
            description:
                "**Modérateur**\n\n" +
                `\`${PREFIX}warn\`\n` +
                `\`${PREFIX}unwarn\`\n` +
                `\`${PREFIX}sanction\`\n` +
                `\`${PREFIX}all-sanction\`\n\n` +
                "Toutes les permissions de la Perm 1 sont également disponibles."
        },

        {
            title:
                "Hirosaki 🎆 • Perm 3",
            description:
                "**Staff confirmé**\n\n" +
                `\`${PREFIX}kick\`\n` +
                `\`${PREFIX}mute\`\n` +
                `\`${PREFIX}unmute\`\n\n` +
                "Toutes les permissions des Perm 1 et 2 sont également disponibles."
        },

        {
            title:
                "Hirosaki 🎆 • Perm 4",
            description:
                "**Responsable staff**\n\n" +
                `\`${PREFIX}addrole\`\n` +
                `\`${PREFIX}remove-role\`\n` +
                `\`${PREFIX}autorole\`\n` +
                `\`${PREFIX}embed\`\n` +
                `\`${PREFIX}dm\`\n` +
                `\`${PREFIX}welcome\`\n` +
                `\`${PREFIX}ticket\`\n` +
                `\`${PREFIX}giveaway\`\n\n` +
                "Toutes les permissions des Perm 1, 2 et 3 sont également disponibles."
        },

        {
            title:
                "Hirosaki 🎆 • Perm 5",
            description:
                "**Co-owner**\n\n" +
                `\`${PREFIX}ban\`\n` +
                `\`${PREFIX}unban\`\n` +
                `\`${PREFIX}unbanall\`\n` +
                `\`${PREFIX}banlist\`\n\n` +
                "Toutes les permissions des Perm 1 à 4 sont également disponibles."
        },

        {
            title:
                "Hirosaki 🎆 • Crown 👑",
            description:
                "**Owner — accès total**\n\n" +
                `\`${PREFIX}rank\`\n` +
                `\`${PREFIX}derank\`\n\n` +
                "Le rôle **Crown** est indépendant de la Perm 5 et possède un accès complet au bot."
        },

        {
            title:
                "Hirosaki 🎆 • Commandes générales",
            description:
                `\`${PREFIX}stat\`\n` +
                `\`${PREFIX}leaderboard\`\n` +
                `\`${PREFIX}snipe\`\n` +
                `\`${PREFIX}clear\`\n` +
                `\`${PREFIX}purge\`\n` +
                `\`${PREFIX}help\`\n` +
                `\`${PREFIX}joinvoice\``
        }
    ];
}

function buildHelpEmbed(
    page,
    total
) {
    const embed =
        createEmbed({
            title:
                page.title,
            description:
                page.description,
            color:
                COLORS.primary
        });

    embed.setFooter({
        text:
            `Page ${page.number + 1}/${total}`
    });

    return embed;
}

// ------------------------------------------------------------
// +HELP
// ------------------------------------------------------------

registerCommand(
    "help",
    {
        permission: 0,

        aliases: [
            "h",
            "commands"
        ],

        execute: async message => {
            const rawPages =
                getHelpPages();

            const pages =
                rawPages.map(
                    (page, index) => ({
                        ...page,
                        number: index
                    })
                );

            let currentPage =
                0;

            const getRows =
                () =>
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    "hirosaki_help_previous"
                                )
                                .setLabel(
                                    "←"
                                )
                                .setStyle(
                                    ButtonStyle.Secondary
                                )
                                .setDisabled(
                                    currentPage ===
                                        0
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    "hirosaki_help_next"
                                )
                                .setLabel(
                                    "→"
                                )
                                .setStyle(
                                    ButtonStyle.Secondary
                                )
                                .setDisabled(
                                    currentPage ===
                                        pages.length - 1
                                )
                        );

            const sent =
                await message.channel.send({
                    embeds: [
                        buildHelpEmbed(
                            pages[currentPage],
                            pages.length
                        )
                    ],
                    components: [
                        getRows()
                    ]
                });

            const collector =
                sent.createMessageComponentCollector({
                    componentType:
                        ComponentType.Button,
                    time:
                        5 * 60 * 1000
                });

            collector.on(
                "collect",
                async interaction => {
                    if (
                        interaction.user.id !==
                        message.author.id
                    ) {
                        return interaction.reply({
                            embeds: [
                                errorEmbed(
                                    "❌ Tu ne peux pas utiliser les boutons de ce menu."
                                )
                            ],
                            ephemeral: true
                        });
                    }

                    if (
                        interaction.customId ===
                        "hirosaki_help_previous"
                    ) {
                        currentPage =
                            Math.max(
                                0,
                                currentPage - 1
                            );
                    }

                    if (
                        interaction.customId ===
                        "hirosaki_help_next"
                    ) {
                        currentPage =
                            Math.min(
                                pages.length - 1,
                                currentPage + 1
                            );
                    }

                    await interaction.update({
                        embeds: [
                            buildHelpEmbed(
                                pages[currentPage],
                                pages.length
                            )
                        ],
                        components: [
                            getRows()
                        ]
                    });
                }
            );

            collector.on(
                "end",
                async () => {
                    await sent.edit({
                        components: [
                            new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(
                                            "hirosaki_help_previous_end"
                                        )
                                        .setLabel(
                                            "←"
                                        )
                                        .setStyle(
                                            ButtonStyle.Secondary
                                        )
                                        .setDisabled(
                                            true
                                        ),

                                    new ButtonBuilder()
                                        .setCustomId(
                                            "hirosaki_help_next_end"
                                        )
                                        .setLabel(
                                            "→"
                                        )
                                        .setStyle(
                                            ButtonStyle.Secondary
                                        )
                                        .setDisabled(
                                            true
                                        )
                                )
                        ]
                    }).catch(
                        () => {}
                    );
                }
            );
        }
    }
);

// ============================================================
// BIENVENUE
// ============================================================

function replaceWelcomeVariables(
    text,
    member
) {
    const guild =
        member.guild;

    const online =
        guild.members.cache.filter(
            m =>
                m.presence &&
                m.presence.status !==
                    "offline"
        ).size;

    return String(text)
        .replace(
            /\{user\}/gi,
            `${member}`
        )
        .replace(
            /\{username\}/gi,
            member.user.username
        )
        .replace(
            /\{member\.count\}/gi,
            String(
                guild.memberCount
            )
        )
        .replace(
            /\{server\}/gi,
            guild.name
        )
        .replace(
            /\{server\.name\}/gi,
            guild.name
        )
        .replace(
            /\{server\.id\}/gi,
            guild.id
        )
        .replace(
            /\{member\.id\}/gi,
            member.id
        )
        .replace(
            /\{member\.tag\}/gi,
            member.user.tag
        )
        .replace(
            /\{online\}/gi,
            String(online)
        );
}

// ============================================================
// ÉVÉNEMENT : NOUVEAU MEMBRE
// ============================================================

client.on(
    "guildMemberAdd",
    async member => {
        try {
            const config =
                ensureGuild(
                    member.guild.id
                );

            // --------------------------
            // AUTOROLE
            // --------------------------

            if (
                config.autorole.enabled &&
                config.autorole.roleId
            ) {
                const role =
                    member.guild.roles.cache.get(
                        config.autorole.roleId
                    );

                if (
                    role &&
                    role.position <
                        member.guild.members.me.roles.highest.position
                ) {
                    await member.roles.add(
                        role,
                        "Autorole Hirosaki"
                    ).catch(() => {});
                }
            }

            // --------------------------
            // BIENVENUE
            // --------------------------

            if (
                !config.welcome.enabled ||
                !config.welcome.channelId
            ) {
                return;
            }

            const channel =
                member.guild.channels.cache.get(
                    config.welcome.channelId
                );

            if (
                !channel ||
                !channel.isTextBased()
            ) {
                return;
            }

            const content =
                replaceWelcomeVariables(
                    config.welcome.message,
                    member
                );

            const embed =
                createEmbed({
                    title:
                        "👋 Bienvenue !",
                    description:
                        content,
                    color:
                        COLORS.primary,
                    thumbnail:
                        member.user.displayAvatarURL({
                            extension: "png",
                            size: 512
                        }),
                    footer:
                        member.guild.name
                });

            await channel.send({
                embeds: [
                    embed
                ]
            }).catch(
                () => {}
            );
        } catch (error) {
            console.error(
                "Erreur guildMemberAdd :",
                error
            );
        }
    }
);

// ============================================================
// SNIPE — SUPPRESSION DE MESSAGE
// ============================================================

async function rememberDeletedMessage(
    message
) {
    try {
        if (
            !message ||
            message.author?.bot
        ) {
            return;
        }

        let deletedMessage =
            message;

        const snapshot =
            findStoredMessageSnapshot(
                message.id
            );

        // Le snapshot est prioritaire : il est disponible
        // immédiatement, sans attendre un fetch Discord.
        // Cela évite que +snipe passe avant la sauvegarde.
        if (
            message.partial &&
            !snapshot
        ) {
            deletedMessage =
                await message.fetch()
                    .catch(
                        () => message
                    );
        }

        const guildId =
            deletedMessage.guildId ||
            deletedMessage.guild?.id ||
            snapshot?.guildId;

        const channelId =
            deletedMessage.channelId ||
            deletedMessage.channel?.id ||
            snapshot?.channelId;

        if (
            !guildId ||
            !channelId
        ) {
            return;
        }

        const author =
            deletedMessage.author;

        const content =
            typeof deletedMessage.content ===
                "string" &&
            deletedMessage.content.length
                ? deletedMessage.content
                : snapshot?.content || "";

        const attachments =
            [
                ...(deletedMessage.attachments?.values?.() ||
                    [])
            ].map(
                attachment =>
                    attachment.url
            );

        const guildData =
            ensureGuild(
                guildId
            );

        guildData.snipes[
            channelId
        ] = {
            content,
            authorId:
                author?.id ||
                snapshot?.authorId ||
                null,
            authorTag:
                author?.tag ||
                snapshot?.authorTag ||
                "Utilisateur inconnu",
            avatar:
                author?.displayAvatarURL?.(
                    {
                        extension: "png",
                        size: 256
                    }
                ) ||
                snapshot?.avatar ||
                null,
            createdAt:
                deletedMessage.createdTimestamp ||
                snapshot?.createdAt ||
                Date.now(),
            deletedAt:
                Date.now(),
            attachments:
                attachments.length
                    ? attachments
                    : snapshot?.attachments ||
                        []
        };

        saveDatabase();
    } catch (error) {
        console.error(
            "Erreur messageDelete :",
            error
        );
    }
}

client.on(
    "messageDelete",
    rememberDeletedMessage
);

client.on(
    "messageDeleteBulk",
    async messages => {
        for (
            const message of messages.values()
        ) {
            await rememberDeletedMessage(
                message
            );
        }
    }
);
// ============================================================
// GESTION DES COMMANDES PREFIX
// ============================================================

client.on(
    "messageCreate",
    async message => {
        try {
            if (
                !message.guild ||
                message.author.bot
            ) {
                return;
            }

            rememberMessage(
                message
            );

            recordMessage(
                message
            );

            const parsed =
                getCommandFromMessage(
                    message
                );

            if (!parsed) {
                return;
            }

            const command =
                commands.get(
                    parsed.commandName
                );

            if (!command) {
                return;
            }

            // Commandes tickets
            if (
                command.name === "ticket-add" ||
                command.name === "ticket-close" ||
                command.name === "ticket-claim"
            ) {
                if (
                    !hasTicketPermission(
                        message.member
                    )
                ) {
                    return sendEmbed(
                        message,
                        errorEmbed(
                            "❌ Tu n'as pas la permission d'utiliser cette commande."
                        )
                    );
                }
            }

            // Permissions normales
            if (
                command.permission > 0 &&
                !hasPermission(
                    message.member,
                    command.permission
                )
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Tu n'as pas la permission d'utiliser cette commande."
                    )
                );
            }

            // Commandes réservées à Crown
            if (
                command.crownOnly &&
                !isCrown(message.member)
            ) {
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Cette commande est réservée au rôle Crown."
                    )
                );
            }

            await command.execute(
                message,
                parsed.args
            );
        } catch (error) {
            console.error(
                "Erreur commande :",
                error
            );

            await sendEmbed(
                message,
                errorEmbed(
                    "❌ Une erreur est survenue pendant l'exécution de la commande."
                )
            ).catch(
                () => {}
            );
        }
    }
);
// ============================================================
// SAUVEGARDE DES SESSIONS VOCALES AU REDÉMARRAGE
// ============================================================

async function closeVoiceSessions() {
    const now =
        Date.now();

    for (
        const [
            key,
            startedAt
        ] of voiceSessions
    ) {
        const parts =
            key.split(":");

        const guildId =
            parts[0];

        const userId =
            parts[1];

        const guild =
            client.guilds.cache.get(
                guildId
            );

        if (!guild) {
            continue;
        }

        if (
            typeof startedAt !==
            "number"
        ) {
            continue;
        }

        ensureMemberStats(
            guildId,
            userId
        );

        db.voice[guildId][userId] +=
            Math.max(
                0,
                now - startedAt
            );
    }

    voiceSessions.clear();

    for (
        const [
            sessionKey,
            startedAt
        ] of duoVoiceSessions
    ) {
        const parts =
            sessionKey.split(":");

        if (
            parts.length !== 3 ||
            typeof startedAt !==
                "number"
        ) {
            continue;
        }

        const guildId =
            parts[0];

        const userA =
            parts[1];

        const userB =
            parts[2];

        ensureGuild(
            guildId
        );

        const duoKey =
            createDuoKey(
                userA,
                userB
            );

        if (
            !db.duos[guildId][duoKey]
        ) {
            db.duos[guildId][duoKey] = {
                users: [
                    userA,
                    userB
                ],
                duration: 0
            };
        }

        db.duos[guildId][duoKey]
            .duration +=
            Math.max(
                0,
                now - startedAt
            );
    }

    duoVoiceSessions.clear();
    saveDatabase();
}

// ============================================================
// ARRÊT PROPRE
// ============================================================

async function gracefulShutdown(
    signal
) {
    console.log(
        `Signal ${signal} reçu. Sauvegarde...`
    );

    await closeVoiceSessions();

    saveDatabase();

    client.destroy();

    process.exit(0);
}

process.on(
    "SIGINT",
    () =>
        gracefulShutdown(
            "SIGINT"
        )
);

process.on(
    "SIGTERM",
    () =>
        gracefulShutdown(
            "SIGTERM"
        )
);

// ============================================================
// GESTION DES ERREURS
// ============================================================

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "Unhandled rejection :",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "Uncaught exception :",
            error
        );
    }
);

// ============================================================
// CONNEXION DU BOT
// ============================================================

client.once(
    "clientReady",
    () => {
        console.log(
            "========================================"
        );

        console.log(
            `✅ ${client.user.tag} est connecté.`
        );

        console.log(
            `📡 Serveurs : ${client.guilds.cache.size}`
        );

        console.log(
            `⚙️ Préfixe : ${PREFIX}`
        );

        console.log(
            "========================================"
        );

        client.user.setActivity(
            `${PREFIX}help`,
            {
                type:
                    ActivityType.Listening
            }
        );
    }
);

// ============================================================
// LANCEMENT
// ============================================================

if (!TOKEN) {
    console.error(
        "❌ TOKEN_DISCORD est absent du fichier .env."
    );

    process.exit(1);
}

client.login(
    TOKEN
);
