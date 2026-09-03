const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    ChannelType,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Collection,
    ActivityType
} = require("discord.js");

const {
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus,
    getVoiceConnection
} = require("@discordjs/voice");

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

const activeVoiceConnections = new Map();

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
    polls: {},
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
            title: "⚠️ Sanction Hirosaki",
            message:
                "Bonjour {user},\n\n" +
                "Tu viens de recevoir une sanction sur **{server}**.\n\n" +
                "Sanction : **{sanction}**\n" +
                "Raison : **{reason}**\n" +
                "Modérateur : **{moderator}**",
            color: "#ED4245",
            footer: "{server}",
            thumbnail: "server",
            image: null,
            timestamp: true
        },

        welcome: {
            enabled: false,
            channelId: null,
            title: "👋 Bienvenue !",
            message:
                "Bienvenue {user} sur **{server}** !\n" +
                "Tu es notre membre numéro **{member.count}**.",
            color: "#5865F2",
            footer: "{server}",
            thumbnail: "member",
            image: null,
            timestamp: true
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

    autorole: 0,

    welcome: 0,
    "welcome-message": 0,

    "ticket-add": 0,
    "ticket-close": 0,
    "ticket-claim": 0,

    "ticket-config": 0,

    "stat-schedule": 0,
    "leaderboard-schedule": 0,

    embed: 0,
    dm: 0
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

function isValidEmbedUrl(value) {
    if (!value) return false;
    try {
        const url = new URL(String(value));
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function parseEmbedColor(value, fallback = COLORS.primary) {
    if (value === null || value === undefined || String(value).trim() === "") return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(COLORS, normalized)) return COLORS[normalized];
    const hex = normalized.replace(/^#/, "");
    return /^[0-9a-f]{6}$/.test(hex) ? parseInt(hex, 16) : null;
}

function formatEmbedColor(value, fallback = "#5865F2") {
    const color = parseEmbedColor(value, parseEmbedColor(fallback));
    return color === null ? fallback : "#" + color.toString(16).padStart(6, "0").toUpperCase();
}

function parsePipeOptions(parts) {
    const options = {};
    for (const part of parts || []) {
        const separator = String(part).indexOf("=");
        if (separator < 1) continue;
        const key = String(part).slice(0, separator).trim().toLowerCase();
        const value = String(part).slice(separator + 1).trim();
        if (key && value) options[key] = value;
    }
    return options;
}

function resolveEmbedImage(value, guild, member = null, fallback = null) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "none" || mode === "off") return null;
    if (mode === "server") return guild?.iconURL({ extension: "png", size: 512 }) || fallback;
    if (mode === "member" || mode === "user") return member?.user?.displayAvatarURL({ extension: "png", size: 512 }) || fallback;
    return isValidEmbedUrl(value) ? value : fallback;
}

function replaceTemplateVariables(text, values) {
    return Object.entries(values || {}).reduce((result, [key, value]) => {
        const pattern = new RegExp("\\{" + key.replace(".", "\\.") + "\\}", "gi");
        return result.replace(pattern, String(value ?? ""));
    }, String(text ?? ""));
}

function createEmbed({ title, description, color = COLORS.primary, thumbnail = null, footer = null, footerIcon = null, image = null, author = null, authorIcon = null, url = null, fields = [], timestamp = true }) {
    const messageEmbed = new EmbedBuilder();
    const parsedColor = parseEmbedColor(color, COLORS.primary);
    messageEmbed.setColor(parsedColor === null ? COLORS.primary : parsedColor);
    if (title) messageEmbed.setTitle(String(title).slice(0, 256));
    if (description) messageEmbed.setDescription(String(description).slice(0, 4096));
    if (url && isValidEmbedUrl(url)) messageEmbed.setURL(url);
    if (author) {
        const authorData = { name: String(author).slice(0, 256) };
        if (authorIcon && isValidEmbedUrl(authorIcon)) authorData.iconURL = authorIcon;
        messageEmbed.setAuthor(authorData);
    }
    if (thumbnail && isValidEmbedUrl(thumbnail)) messageEmbed.setThumbnail(thumbnail);
    if (image && isValidEmbedUrl(image)) messageEmbed.setImage(image);
    if (footer) {
        const footerData = { text: String(footer).slice(0, 2048) };
        if (footerIcon && isValidEmbedUrl(footerIcon)) footerData.iconURL = footerIcon;
        messageEmbed.setFooter(footerData);
    }
    const validFields = Array.isArray(fields) ? fields.filter(field => field?.name && field?.value).slice(0, 25).map(field => ({ name: String(field.name).slice(0, 256), value: String(field.value).slice(0, 1024), inline: Boolean(field.inline) })) : [];
    if (validFields.length) messageEmbed.addFields(validFields);
    if (timestamp) messageEmbed.setTimestamp();
    return messageEmbed;
}

function successEmbed(text) { return createEmbed({ title: "✅ Hirosaki", description: text, color: COLORS.success }); }
function errorEmbed(text) { return createEmbed({ title: "❌ Hirosaki", description: text, color: COLORS.danger }); }
function infoEmbed(text) { return createEmbed({ title: "ℹ️ Hirosaki", description: text, color: COLORS.primary }); }

function createConfigInput(id, label, style, value, required = false) {
    const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
    if (value !== null && value !== undefined && String(value) !== "") input.setValue(String(value).slice(0, 4000));
    return new ActionRowBuilder().addComponents(input);
}

async function showTemplateConfigModal(interaction, type, config) {
    const settings = type === "dm" ? config.dmSanctions : config.welcome;
    const isDM = type === "dm";
    const modal = new ModalBuilder()
        .setCustomId("hirosaki_" + type + "_config:" + interaction.user.id)
        .setTitle(isDM ? "Configurer les DM de sanction" : "Configurer la bienvenue")
        .addComponents(
            createConfigInput("title", "Titre de l'embed", TextInputStyle.Short, settings.title || (isDM ? "⚠️ Sanction Hirosaki" : "👋 Bienvenue !"), true),
            createConfigInput("message", "Description / message", TextInputStyle.Paragraph, settings.message || "", true),
            createConfigInput("color", "Couleur (#5865F2 ou nom)", TextInputStyle.Short, formatEmbedColor(settings.color, isDM ? "#ED4245" : "#5865F2")),
            createConfigInput("footer", "Footer (variables acceptées)", TextInputStyle.Short, settings.footer || "{server}"),
            createConfigInput("image", "Image URL (facultatif)", TextInputStyle.Short, settings.image || "")
        );
    await interaction.showModal(modal);
}

function configFormButton(type, userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("hirosaki_open_" + type + "_form:" + userId)
            .setLabel("Ouvrir le formulaire")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📝")
    );
}

async function sendConfigFormButton(message, type) {
    const label = type === "dm" ? "DM de sanction" : "message de bienvenue";
    return message.reply({
        embeds: [infoEmbed("📝 Clique sur le bouton ci-dessous pour configurer le " + label + ".")],
        components: [configFormButton(type, message.author.id)],
        allowedMentions: { repliedUser: false }
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

function getRecentChannelSnapshots(
    guildId,
    channelId
) {
    const persisted =
        db.recentMessages?.[
            guildId
        ]?.[
            channelId
        ];

    const snapshots =
        Array.isArray(
            persisted
        )
            ? persisted
            : [];

    return [
        ...snapshots
    ].sort(
        (a, b) =>
            (Number(b.createdAt) || 0) -
            (Number(a.createdAt) || 0)
    );
}

async function recoverDeletedMessage(
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
        !message.channel?.messages?.fetch
    ) {
        return null;
    }

    const snapshots =
        getRecentChannelSnapshots(
            guildId,
            channelId
        ).filter(
            snapshot =>
                snapshot.id !==
                    message.id &&
                (Number(
                    snapshot.createdAt
                ) || 0) <=
                    (Number(
                        message.createdTimestamp
                    ) || Date.now())
        );

    if (
        snapshots.length ===
        0
    ) {
        return null;
    }

    const recentMessages =
        await message.channel.messages
            .fetch({
                limit: 100
            })
            .catch(
                () => null
            );

    if (
        !recentMessages
    ) {
        return null;
    }

    const existingIds =
        new Set(
            recentMessages.keys()
        );

    return (
        snapshots.find(
            snapshot =>
                !existingIds.has(
                    snapshot.id
                )
        ) || null
    );
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

function replaceSanctionVariables(text, guild, member, sanction) {
    return replaceTemplateVariables(text, { user: member, username: member.user.username, server: guild.name, sanction: sanction.type, reason: sanction.reason, moderator: sanction.moderatorTag, "sanction.id": sanction.id });
}

function buildSanctionDMEmbed(guild, member, sanction) {
    const config = ensureGuild(guild.id).dmSanctions;
    return createEmbed({ title: replaceSanctionVariables(config.title || "⚠️ Sanction Hirosaki", guild, member, sanction), description: replaceSanctionVariables(config.message, guild, member, sanction), color: parseEmbedColor(config.color, COLORS.danger), thumbnail: resolveEmbedImage(config.thumbnail || "server", guild, member, guild.iconURL({ extension: "png", size: 256 })), image: resolveEmbedImage(config.image, guild, member, null), footer: replaceSanctionVariables(config.footer || "{server}", guild, member, sanction), timestamp: config.timestamp !== false });
}

async function sendSanctionDM(guild, member, sanction, { force = false } = {}) {
    const config = ensureGuild(guild.id);
    if (!config.dmSanctions.enabled && !force) return false;
    try {
        await member.send({ embeds: [buildSanctionDMEmbed(guild, member, sanction)] });
        return true;
    } catch {
        return false;
    }
}

// COMMANDE +SNIPE// COMMANDE +SNIPE
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

            let data =
                guildSnipes?.[
                    message.channel.id
                ];

            if (
                !data
            ) {
                const recovered =
                    await recoverDeletedMessage(
                        message
                    );

                if (
                    recovered
                ) {
                    data = {
                        ...recovered,
                        deletedAt:
                            Date.now()
                    };

                    db.snipes[
                        message.guild.id
                    ][
                        message.channel.id
                    ] = data;

                    saveDatabase();
                }
            }

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
// MISE À JOUR DES DUOS ET SESSIONS VOCALES
// ------------------------------------------------------------

function syncVoiceSessions(guild) {
    const activeUsers = new Set();

    for (const channel of guild.channels.cache.values()) {
        if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) continue;
        for (const member of channel.members.values()) {
            if (member.user.bot) continue;
            activeUsers.add(member.id);
            startVoiceSession(guild.id, member.id);
        }
    }

    for (const key of voiceSessions.keys()) {
        if (!key.startsWith(guild.id + ":")) continue;
        const userId = key.slice(guild.id.length + 1);
        if (!activeUsers.has(userId)) finishVoiceSession(guild.id, userId);
    }
}

function updateDuoSessions(guild) {
    const activePairs = new Set();

    for (const channel of guild.channels.cache.values()) {
        if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) continue;
        const members = [...channel.members.values()].filter(member => !member.user.bot);
        if (members.length < 2) continue;

        for (let i = 0; i < members.length; i++) {
            for (let j = i + 1; j < members.length; j++) {
                const userA = members[i].id;
                const userB = members[j].id;
                const pairKey = guild.id + ":" + createDuoKey(userA, userB);
                activePairs.add(pairKey);
                startDuoSession(guild.id, userA, userB);
            }
        }
    }

    for (const [key] of duoVoiceSessions) {
        if (!key.startsWith(guild.id + ":") || activePairs.has(key)) continue;
        const parts = key.split(":");
        if (parts.length !== 3) {
            duoVoiceSessions.delete(key);
            continue;
        }
        finishDuoSession(guild.id, parts[1], parts[2]);
    }
}

// ------------------------------------------------------------
// SYNCHRONISATION VOCALE PÉRIODIQUE
// ------------------------------------------------------------

setInterval(
    () => {
        for (const guild of client.guilds.cache.values()) {
            syncVoiceSessions(guild);
            updateDuoSessions(guild);
        }
    },
    10_000
);

// ------------------------------------------------------------
// ÉVÉNEMENT VOCAL
// ------------------------------------------------------------

client.on(
    "voiceStateUpdate",
    async (oldState, newState) => {
        if (!newState.guild) return;
        const guild = newState.guild;
        if (newState.member?.user.bot || oldState.member?.user.bot) return;
        syncVoiceSessions(guild);
        updateDuoSessions(guild);
    }
);

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
        permission: 0,
        crownOnly: true,

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
        permission: 0,
        crownOnly: true,

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
        permission: 0,
        crownOnly: true,

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
        permission: 0,
        crownOnly: true,
        aliases: ["bienvenue"],
        execute: async (message, args) => {
            const config = ensureGuild(message.guild.id);
            const action = (args.shift() || "").toLowerCase();

            if (["form", "config", "configure"].includes(action)) return sendConfigFormButton(message, "welcome");

            if (action === "off") {
                config.welcome.enabled = false;
                saveDatabase();
                return sendEmbed(message, successEmbed("👋 Le système de bienvenue est désactivé."));
            }

            if (action === "test") {
                if (!config.welcome.channelId) return sendEmbed(message, errorEmbed("❌ Configure d'abord un salon avec " + PREFIX + "welcome #salon."));
                const channel = message.guild.channels.cache.get(config.welcome.channelId);
                if (!channel?.isTextBased()) return sendEmbed(message, errorEmbed("❌ Le salon de bienvenue configuré est introuvable ou invalide."));
                await channel.send({ content: "🧪 Aperçu du message de bienvenue", embeds: [buildWelcomeEmbed(message.member, config.welcome)] });
                return sendEmbed(message, successEmbed("👋 Aperçu envoyé dans " + channel + "."));
            }

            if (!action || action === "status") {
                const channel = config.welcome.channelId ? message.guild.channels.cache.get(config.welcome.channelId) : null;
                return sendEmbed(message, infoEmbed(
                    "👋 Configuration bienvenue\n\n" +
                    "État : " + (config.welcome.enabled ? "activé" : "désactivé") + "\n" +
                    "Salon : " + (channel ? String(channel) : "non configuré") + "\n" +
                    "Titre : " + (config.welcome.title || "👋 Bienvenue !") + "\n\n" +
                    PREFIX + "welcome #salon • choisir le salon\n" +
                    PREFIX + "welcome form • ouvrir le formulaire\n" +
                    PREFIX + "welcome test • prévisualiser\n" +
                    PREFIX + "welcome off • désactiver"
                ));
            }

            if (["title", "color", "footer", "image", "thumbnail", "timestamp"].includes(action)) {
                const value = args.join(" ").trim();
                if (!value) return sendEmbed(message, infoEmbed("Valeur actuelle : " + (config.welcome[action] ?? "non définie")));
                if (action === "color" && parseEmbedColor(value, null) === null) return sendEmbed(message, errorEmbed("❌ Couleur invalide."));
                if (["image", "thumbnail"].includes(action) && !["none", "off", "member", "user", "server"].includes(value.toLowerCase()) && !isValidEmbedUrl(value)) return sendEmbed(message, errorEmbed("❌ URL d'image invalide."));
                config.welcome[action] = action === "timestamp" ? value.toLowerCase() !== "off" : value;
                saveDatabase();
                return sendEmbed(message, successEmbed("✅ Réglage bienvenue mis à jour."));
            }

            const channel = resolveChannel(message.guild, action);
            if (!channel?.isTextBased()) return sendEmbed(message, errorEmbed(
                "Utilisation : " + PREFIX + "welcome #salon\n" +
                PREFIX + "welcome form • formulaire\n" +
                PREFIX + "welcome test • aperçu\n" +
                PREFIX + "welcome off • désactiver"
            ));

            config.welcome.enabled = true;
            config.welcome.channelId = channel.id;
            saveDatabase();
            return sendEmbed(message, successEmbed("👋 Le salon de bienvenue est maintenant " + channel + ". Utilise " + PREFIX + "welcome form pour personnaliser le message."));
        }
    }
);

// +WELCOME-MESSAGE
// ------------------------------------------------------------

registerCommand(
    "welcome-message",
    {
        permission: 0,
        crownOnly: true,

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

registerCommand(
    "dm",
    {
        permission: 0,
        crownOnly: true,
        aliases: ["sanction-dm", "dmsanction"],
        execute: async (message, args) => {
            const config = ensureGuild(message.guild.id);
            const action = (args.shift() || "").toLowerCase();

            if (["form", "config", "configure"].includes(action)) return sendConfigFormButton(message, "dm");

            if (action === "on" || action === "off") {
                config.dmSanctions.enabled = action === "on";
                saveDatabase();
                return sendEmbed(message, successEmbed(action === "on" ? "📩 Les DM de sanction sont activés." : "📩 Les DM de sanction sont désactivés."));
            }

            if (action === "test") {
                const sent = await sendSanctionDM(message.guild, message.member, { id: "TEST", type: "Warn (test)", reason: "Aperçu de configuration", moderatorTag: message.author.tag }, { force: true });
                return sendEmbed(message, sent ? successEmbed("📩 Un DM de test a été envoyé à ton compte.") : errorEmbed("❌ Impossible d'envoyer le DM. Vérifie tes paramètres de confidentialité Discord."));
            }

            if (action === "message" || action === "msg") {
                const text = args.join(" ").trim();
                if (!text) return sendEmbed(message, infoEmbed("Message actuel :\n\n" + config.dmSanctions.message));
                config.dmSanctions.message = text;
                saveDatabase();
                return sendEmbed(message, successEmbed("✅ Le message DM de sanction a été modifié."));
            }

            if (["title", "color", "footer", "image", "thumbnail", "timestamp"].includes(action)) {
                const value = args.join(" ").trim();
                if (!value) return sendEmbed(message, infoEmbed("Valeur actuelle : " + (config.dmSanctions[action] ?? "non définie")));
                if (action === "color" && parseEmbedColor(value, null) === null) return sendEmbed(message, errorEmbed("❌ Couleur invalide."));
                if (["image", "thumbnail"].includes(action) && !["none", "off", "member", "user", "server"].includes(value.toLowerCase()) && !isValidEmbedUrl(value)) return sendEmbed(message, errorEmbed("❌ URL d'image invalide."));
                config.dmSanctions[action] = action === "timestamp" ? value.toLowerCase() !== "off" : value;
                saveDatabase();
                return sendEmbed(message, successEmbed("✅ Réglage des DM de sanction mis à jour."));
            }

            return sendEmbed(message, infoEmbed(
                "📩 Configuration des DM de sanction\n\n" +
                "État : " + (config.dmSanctions.enabled ? "activé" : "désactivé") + "\n" +
                "Titre : " + (config.dmSanctions.title || "⚠️ Sanction Hirosaki") + "\n\n" +
                PREFIX + "dm on|off\n" +
                PREFIX + "dm form • ouvrir le formulaire\n" +
                PREFIX + "dm test • envoyer un aperçu\n" +
                PREFIX + "dm message <texte> • message avec variables\n" +
                "Variables : {user}, {username}, {server}, {sanction}, {reason}, {moderator}, {sanction.id}"
            ));
        }
    }
);

// +EMBED
// ------------------------------------------------------------
// Format : +embed #salon | titre | description | option=valeur
// Options : color, footer, thumbnail, image, author, url, timestamp, field
// Un field utilise le format field=Nom::Valeur.
// ------------------------------------------------------------

registerCommand(
    "embed",
    {
        permission: 0,
        crownOnly: true,
        aliases: ["createembed", "create-embed"],
        execute: async (message, args) => {
            const parts = args.join(" ").split("|").map(part => part.trim());
            if (parts.length < 3) return sendEmbed(message, errorEmbed(
                "Utilisation : " + PREFIX + "embed #salon | titre | description | color=#5865F2 | footer=Texte\n" +
                "Options : thumbnail=server, image=URL, author=Nom, timestamp=off, field=Nom::Valeur"
            ));

            const channel = resolveChannel(message.guild, parts[0]);
            if (!channel?.isTextBased()) return sendEmbed(message, errorEmbed("❌ Salon invalide."));
            const title = parts[1];
            const description = parts[2];
            if (!title || !description) return sendEmbed(message, errorEmbed("❌ Le titre et la description sont obligatoires."));

            const optionParts = parts.slice(3);
            const options = parsePipeOptions(optionParts);
            const color = parseEmbedColor(options.color, COLORS.primary);
            if (options.color && color === null) return sendEmbed(message, errorEmbed("❌ Couleur invalide."));

            const fields = optionParts.filter(part => part.toLowerCase().startsWith("field=")).map(part => {
                const value = part.slice(part.indexOf("=") + 1);
                const separator = value.indexOf("::");
                return separator > 0 ? { name: value.slice(0, separator).trim(), value: value.slice(separator + 2).trim(), inline: false } : null;
            }).filter(Boolean);

            const customEmbed = createEmbed({
                title,
                description,
                color,
                thumbnail: resolveEmbedImage(options.thumbnail, message.guild, message.member, null),
                image: options.image ? resolveEmbedImage(options.image, message.guild, message.member, null) : null,
                footer: options.footer || null,
                author: options.author || null,
                url: options.url || null,
                timestamp: options.timestamp?.toLowerCase() !== "off",
                fields
            });

            await channel.send({ embeds: [customEmbed] });
            return sendEmbed(message, successEmbed("✅ Embed envoyé dans " + channel + "."));
        }
    }
);

// ============================================================
// LISTE DES RÔLES STAFF
// ============================================================

const ROLE_BOARD_DEFINITIONS = [
    { label: "👑 Crown", roleName: CROWN_ROLE_NAME },
    { label: "⭐ Co-owner", roleName: PERMISSION_ROLES[5] },
    { label: "🛡️ Responsable staff", roleName: PERMISSION_ROLES[4] },
    { label: "🔧 Staff", roleName: PERMISSION_ROLES[3] },
    { label: "🔨 Modérateur", roleName: PERMISSION_ROLES[2] },
    { label: "🧪 Modérateur test", roleName: PERMISSION_ROLES[1] },
    { label: "🎫 Gestion ticket", roleName: TICKET_ROLE_NAME }
];

function getRoleBoardConfig(guildId) {
    const config = ensureGuild(guildId);
    if (!config.roleBoard || typeof config.roleBoard !== "object") {
        config.roleBoard = { channelId: null, messageId: null };
    }
    return config.roleBoard;
}

function formatRoleBoardMembers(role) {
    if (!role) return "Rôle introuvable sur ce serveur.";
    const mentions = [...role.members.values()].map(member => "<@" + member.id + ">");
    if (!mentions.length) return "Aucun membre";
    let output = "";
    let displayed = 0;
    for (const mention of mentions) {
        const addition = output ? ", " + mention : mention;
        if (output.length + addition.length > 1000) break;
        output += addition;
        displayed++;
    }
    if (displayed < mentions.length) output += "\n… et " + (mentions.length - displayed) + " autre(s)";
    return output;
}

function buildRoleBoardEmbed(guild) {
    const embed = createEmbed({
        title: "👥 Équipe Hirosaki",
        description: "Voici les membres actuellement présents dans les rôles staff.",
        color: COLORS.primary,
        thumbnail: guild.iconURL({ extension: "png", size: 512 }),
        footer: guild.name + " • Mise à jour automatique"
    });

    for (const definition of ROLE_BOARD_DEFINITIONS) {
        const role = findRoleByName(guild, definition.roleName);
        embed.addFields({
            name: definition.label,
            value: formatRoleBoardMembers(role),
            inline: false
        });
    }

    embed.addFields({
        name: "📋 Conditions pour le staff",
        value: "• Minimum cinq heures de vocal\n" +
            "• Être depuis au moins cinq jours sur le serveur\n" +
            "• Être actif\n\n" +
            "Si ces conditions sont respectées, n'hésitez pas à postuler en faisant un ticket.",
        inline: false
    });

    return embed;
}

async function refreshRoleBoard(guild, { fallbackChannel = null, fetchMembers = false, createIfMissing = true } = {}) {
    const boardConfig = getRoleBoardConfig(guild.id);
    if (fetchMembers) await guild.members.fetch().catch(() => {});

    let channel = boardConfig.channelId
        ? guild.channels.cache.get(boardConfig.channelId)
        : fallbackChannel;
    if (!channel?.isTextBased()) return null;

    let boardMessage = null;
    if (boardConfig.messageId) {
        boardMessage = await channel.messages.fetch(boardConfig.messageId).catch(() => null);
    }

    if (boardMessage) {
        await boardMessage.edit({ embeds: [buildRoleBoardEmbed(guild)] });
        return boardMessage;
    }

    if (!createIfMissing) return null;
    boardMessage = await channel.send({ embeds: [buildRoleBoardEmbed(guild)] }).catch(() => null);
    if (!boardMessage) return null;

    boardConfig.channelId = channel.id;
    boardConfig.messageId = boardMessage.id;
    saveDatabase();
    return boardMessage;
}

const roleBoardRefreshTimers = new Map();

function scheduleRoleBoardRefresh(guild) {
    const boardConfig = getRoleBoardConfig(guild.id);
    if (!boardConfig.messageId) return;
    const previousTimer = roleBoardRefreshTimers.get(guild.id);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(async () => {
        roleBoardRefreshTimers.delete(guild.id);
        await refreshRoleBoard(guild, { createIfMissing: false }).catch(() => {});
    }, 750);
    roleBoardRefreshTimers.set(guild.id, timer);
}

registerCommand(
    "roles",
    {
        permission: 0,
        aliases: ["staff-list", "role-list"],
        execute: async message => {
            const boardMessage = await refreshRoleBoard(message.guild, {
                fallbackChannel: message.channel,
                fetchMembers: true,
                createIfMissing: true
            });
            if (!boardMessage) return sendEmbed(message, errorEmbed("❌ Impossible d'afficher la liste des rôles dans ce salon."));
            return sendEmbed(message, successEmbed("✅ La liste des rôles a été actualisée automatiquement."));
        }
    }
);

client.on(
    "guildMemberUpdate",
    async (oldMember, newMember) => {
        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;
        const rolesChanged = oldRoles.size !== newRoles.size || [...newRoles.keys()].some(roleId => !oldRoles.has(roleId));
        if (!rolesChanged) return;
        scheduleRoleBoardRefresh(newMember.guild);
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
        permission: 0,
        crownOnly: true,

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
        permission: 0,
        crownOnly: true,

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
        permission: 0,
        crownOnly: true,
        aliases: [
            "join-voc",
            "joinvoc"
        ],
        execute: async message => {
            const voiceChannel = message.member?.voice?.channel;
            if (!voiceChannel) return sendEmbed(message, errorEmbed("❌ Tu dois être dans un salon vocal pour que je te rejoigne."));

            const botMember = message.guild.members.me;
            if (!botMember) return sendEmbed(message, errorEmbed("❌ Impossible de récupérer mon membre Discord."));

            const permissions = voiceChannel.permissionsFor(botMember);
            if (!permissions?.has(PermissionsBitField.Flags.Connect)) return sendEmbed(message, errorEmbed("❌ Je n'ai pas la permission de rejoindre ce salon vocal."));

            try {
                const currentConnection = activeVoiceConnections.get(message.guild.id) || getVoiceConnection(message.guild.id);
                if (currentConnection && currentConnection.joinConfig.channelId !== voiceChannel.id) currentConnection.destroy();

                const guildId = message.guild.id;
                  const channelId = voiceChannel.id;
                  const monitorVoiceConnection = (voiceConnection) => {
                      voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
                          if (activeVoiceConnections.get(guildId) !== voiceConnection) return;

                          try {
                              await entersState(voiceConnection, VoiceConnectionStatus.Signalling, 5_000);
                              return;
                          } catch {
                              if (activeVoiceConnections.get(guildId) !== voiceConnection) return;
                              voiceConnection.destroy();
                              activeVoiceConnections.delete(guildId);
                          }

                          setTimeout(() => {
                              if (activeVoiceConnections.has(guildId)) return;
                              const guild = client.guilds.cache.get(guildId);
                              const channel = guild?.channels.cache.get(channelId);
                              if (!guild || !channel) return;

                              try {
                                  const replacement = joinVoiceChannel({
                                      channelId,
                                      guildId,
                                      adapterCreator: guild.voiceAdapterCreator,
                                      selfDeaf: true,
                                      selfMute: true
                                  });
                                  activeVoiceConnections.set(guildId, replacement);
                                  monitorVoiceConnection(replacement);
                              } catch (error) {
                                  console.error("Erreur de reconnexion vocale :", error);
                              }
                          }, 1_500);
                      });
                  };

                  const connection = joinVoiceChannel({
                      channelId,
                      guildId,
                      adapterCreator: message.guild.voiceAdapterCreator,
                      selfDeaf: true,
                      selfMute: true
                  });
                  activeVoiceConnections.set(guildId, connection);
                  monitorVoiceConnection(connection);

                    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
                return sendEmbed(message, successEmbed("🎙️ Je suis maintenant connecté à " + voiceChannel + "."));
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                console.error("Erreur de connexion vocale :", error);
                console.error("Détail de la connexion vocale :", reason);
                const connection = activeVoiceConnections.get(message.guild.id);
                if (connection) connection.destroy();
                activeVoiceConnections.delete(message.guild.id);
                const detail = reason.length > 160 ? reason.slice(0, 157) + "…" : reason;
                return sendEmbed(
                    message,
                    errorEmbed(
                        "❌ Impossible de me connecter à ce salon vocal. Vérifie que le bot possède les permissions **Voir le salon** et **Se connecter**. " +
                        "Détail : " +
                        detail,
                    ),
                );
            }
        }
    }
);

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

function parseGiveawayEndAt(value) {
    const duration = parseDuration(value);
    if (duration) return Date.now() + duration;
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) && timestamp > Date.now() ? timestamp : null;
}

function replaceGiveawayVariables(text, giveaway, guild, winnerText = "") {
    return replaceTemplateVariables(text, { prize: giveaway.prize, winners: giveaway.winners, end: "<t:" + Math.floor(giveaway.endAt / 1000) + ":R>", winner: winnerText, server: guild.name, id: giveaway.id });
}

function buildGiveawayEmbed(guild, giveaway, ended = false, winnerText = "") {
    const defaultDescription = ended
        ? "Prix : " + giveaway.prize + "\n\n🏆 Gagnant(s) : " + (winnerText || "Aucun gagnant")
        : "## " + giveaway.prize + "\n\n🏆 Gagnant(s) : " + giveaway.winners + "\n⏰ Fin : <t:" + Math.floor(giveaway.endAt / 1000) + ":R>\n\nClique sur 🎉 pour participer !";
    return createEmbed({
        title: replaceGiveawayVariables(ended ? (giveaway.endTitle || "🎉 Giveaway terminé") : (giveaway.title || "🎉 GIVEAWAY"), giveaway, guild, winnerText),
        description: replaceGiveawayVariables(ended ? (giveaway.endDescription || defaultDescription) : (giveaway.description || defaultDescription), giveaway, guild, winnerText),
        color: parseEmbedColor(giveaway.color, COLORS.warning),
        thumbnail: resolveEmbedImage(giveaway.thumbnail || "server", guild, null, null),
        image: resolveEmbedImage(giveaway.image, guild, null, null),
        footer: replaceGiveawayVariables(giveaway.footer || ("ID : " + giveaway.id), giveaway, guild, winnerText),
        timestamp: giveaway.timestamp !== false
    });
}

function giveawayOptionError(options) {
    const color = parseEmbedColor(options.color, COLORS.warning);
    if (options.color && color === null) return "Couleur invalide.";
    for (const key of ["image", "thumbnail"]) {
        if (options[key] && !["none", "off", "server", "member", "user"].includes(options[key].toLowerCase()) && !isValidEmbedUrl(options[key])) return "URL d'image invalide pour l'option " + key + ".";
    }
    return null;
}

function buildGiveawayComponents(giveaway, ended = false) {
    if (ended) return [];
    const participantCount = getGiveawayEntries(giveaway).length;
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("hirosaki_giveaway_join:" + giveaway.id)
                .setLabel("Participer")
                .setEmoji("🎉")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("hirosaki_giveaway_count:" + giveaway.id)
                .setLabel("Participants : " + participantCount)
                .setEmoji("👥")
                .setStyle(ButtonStyle.Secondary)
        )
    ];
}

async function createGiveaway(guild, channel, { prize, winners, endAt, options = {} }) {
    const giveawayId = generateGiveawayId();
    const giveaway = {
        id: giveawayId, guildId: guild.id, channelId: channel.id, messageId: null, prize, winners,
        duration: endAt - Date.now(), endAt, title: options.title || "🎉 GIVEAWAY", endTitle: options["end-title"] || "🎉 Giveaway terminé",
        description: options.description || null, endDescription: options["end-description"] || null, color: options.color || "#FEE75C",
        footer: options.footer || ("ID : " + giveawayId), thumbnail: options.thumbnail || "server", image: options.image || null,
        timestamp: options.timestamp?.toLowerCase() !== "off", entries: [], ended: false
    };
    const giveawayMessage = await channel.send({
        embeds: [buildGiveawayEmbed(guild, giveaway)],
        components: buildGiveawayComponents(giveaway)
    }).catch(() => null);
    if (!giveawayMessage) return null;
    giveaway.messageId = giveawayMessage.id;
    ensureGiveaways(guild.id)[giveawayId] = giveaway;
    saveDatabase();
    return giveaway;
}

async function showGiveawayModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("hirosaki_giveaway_config:" + interaction.user.id)
        .setTitle("Créer un giveaway")
        .addComponents(
            createConfigInput("prize", "Prix à gagner", TextInputStyle.Short, "", true),
            createConfigInput("winners", "Nombre de gagnants", TextInputStyle.Short, "1", true),
            createConfigInput("duration", "Durée (ex: 3h, 2d)", TextInputStyle.Short, ""),
            createConfigInput("endAt", "Fin exacte ISO avec fuseau", TextInputStyle.Short, ""),
            createConfigInput("style", "Options séparées par ;", TextInputStyle.Paragraph, "title=🎁 Nitro Giveaway; color=#5865F2; footer=Bonne chance !")
        );
    await interaction.showModal(modal);
}

registerCommand(
    "giveaway",
    {
        permission: 0,
        crownOnly: true,
        aliases: ["giveaways"],
        execute: async (message, args) => {
            const action = (args.shift() || "").toLowerCase();
            const giveaways = ensureGiveaways(message.guild.id);

            if (action === "form" || action === "config" || action === "configure") {
                return message.reply({
                    embeds: [infoEmbed("📝 Clique sur le bouton pour créer un giveaway. Renseigne soit une durée, soit une date de fin exacte.")],
                    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("hirosaki_open_giveaway_form:" + message.author.id).setLabel("Créer le giveaway").setEmoji("🎁").setStyle(ButtonStyle.Primary))],
                    allowedMentions: { repliedUser: false }
                });
            }

            if (action === "start") {
                const endInput = args.shift();
                const endAt = parseGiveawayEndAt(endInput);
                const winners = Number(args.shift());
                const rawPrize = args.join(" ").trim();
                const prizeParts = rawPrize.split("|").map(part => part.trim());
                const prize = prizeParts.shift();
                const options = parsePipeOptions(prizeParts);
                if (!endAt || !winners || winners < 1 || !prize) return sendEmbed(message, errorEmbed(
                    "Utilisation : " + PREFIX + "giveaway form\n" +
                    "Ou : " + PREFIX + "giveaway start 3h 1 Nitro\n" +
                    "Options : title=..., description=..., color=#..., footer=..., image=URL, thumbnail=server|none, timestamp=off"
                ));
                const optionError = giveawayOptionError(options);
                if (optionError) return sendEmbed(message, errorEmbed("❌ " + optionError));
                const giveaway = await createGiveaway(message.guild, message.channel, { prize, winners, endAt, options });
                if (!giveaway) return sendEmbed(message, errorEmbed("❌ Impossible de créer le giveaway."));
                return sendEmbed(message, successEmbed("🎉 Giveaway créé !\nID : " + giveaway.id + "\nFin : <t:" + Math.floor(endAt / 1000) + ":F>"));
            }

            if (action === "reroll" || action === "rerooll") {
                const giveawayId = args.shift();
                const giveaway = giveaways[giveawayId];
                if (!giveaway) return sendEmbed(message, errorEmbed("❌ Giveaway introuvable."));
                const winner = pickGiveawayWinner(giveaway);
                if (!winner) return sendEmbed(message, errorEmbed("❌ Aucun participant disponible pour effectuer un reroll."));
                return sendEmbed(message, successEmbed("🎉 Nouveau gagnant : <@" + winner + "> !\n\nPrix : " + giveaway.prize));
            }

            if (action === "end") {
                const giveawayId = args.shift();
                const giveaway = giveaways[giveawayId];
                if (!giveaway) return sendEmbed(message, errorEmbed("❌ Giveaway introuvable."));
                if (giveaway.ended) return sendEmbed(message, infoEmbed("Ce giveaway est déjà terminé."));
                await finishGiveaway(message.guild, giveawayId);
                return;
            }

            return sendEmbed(message, infoEmbed(
                "Commandes giveaway :\n\n" +
                PREFIX + "giveaway form\n" +
                PREFIX + "giveaway start 3h 1 Nitro\n" +
                PREFIX + "giveaway end ID\n" +
                PREFIX + "giveaway reroll ID"
            ));
        }
    }
);

// FIN D'UN GIVEAWAY
// ------------------------------------------------------------

async function finishGiveaway(guild, giveawayId) {
    const giveaways = ensureGiveaways(guild.id);
    const giveaway = giveaways[giveawayId];
    if (!giveaway || giveaway.ended) return;

    giveaway.ended = true;
    const entries = getGiveawayEntries(giveaway);
    const winners = [];
    const available = [...entries];
    const amount = Math.min(giveaway.winners, available.length);
    for (let i = 0; i < amount; i++) {
        const index = Math.floor(Math.random() * available.length);
        winners.push(available[index]);
        available.splice(index, 1);
    }

    const channel = guild.channels.cache.get(giveaway.channelId);
    if (channel?.isTextBased()) {
        const winnerText = winners.length ? winners.map(id => "<@" + id + ">").join(", ") : "Aucun gagnant";
        await channel.send({ embeds: [buildGiveawayEmbed(guild, giveaway, true, winnerText)] }).catch(() => {});
    }
    saveDatabase();
}

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
// SONDAGES PERSONNALISÉS
// ============================================================

function ensurePolls(guildId) {
    if (!db.polls || typeof db.polls !== "object") db.polls = {};
    if (!db.polls[guildId] || typeof db.polls[guildId] !== "object") db.polls[guildId] = {};
    return db.polls[guildId];
}

function generatePollId() {
    return "poll-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function parsePollChoices(value) {
    const choices = String(value || "").split(/\r?\n/).map(choice => choice.trim()).filter(Boolean);
    if (choices.length < 2) return { error: "Renseigne au moins deux choix, un par ligne." };
    if (choices.length > 10) return { error: "Un sondage peut contenir au maximum dix choix." };
    if (choices.some(choice => choice.length > 80)) return { error: "Chaque choix doit faire au maximum 80 caractères." };
    const normalized = choices.map(choice => choice.toLowerCase());
    if (new Set(normalized).size !== normalized.length) return { error: "Les choix doivent être différents." };
    return { choices };
}

function parsePollBoolean(value) {
    return ["oui", "yes", "true", "1", "multiple", "on"].includes(String(value || "").trim().toLowerCase());
}

function buildPollComponents(poll) {
    if (poll.ended) return [];
    const rows = [];
    for (let index = 0; index < poll.options.length; index += 5) {
        const row = new ActionRowBuilder();
        for (let optionIndex = index; optionIndex < Math.min(index + 5, poll.options.length); optionIndex++) {
            const option = poll.options[optionIndex];
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId("hirosaki_poll_vote:" + poll.id + ":" + optionIndex)
                    .setLabel((optionIndex + 1) + ". " + option.slice(0, 76))
                    .setStyle(ButtonStyle.Primary)
            );
        }
        rows.push(row);
    }
    rows.push(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("hirosaki_poll_end:" + poll.id)
                .setLabel("Clôturer le sondage")
                .setEmoji("🛑")
                .setStyle(ButtonStyle.Danger)
        )
    );
    return rows;
}

function buildPollEmbed(guild, poll) {
    const votes = poll.votes && typeof poll.votes === "object" ? poll.votes : {};
    const counts = poll.options.map(() => 0);
    for (const selectedOptions of Object.values(votes)) {
        for (const optionIndex of Array.isArray(selectedOptions) ? selectedOptions : []) {
            if (counts[optionIndex] !== undefined) counts[optionIndex]++;
        }
    }
    const voterCount = Object.keys(votes).length;
    const lines = poll.options.map((option, index) => {
        const percentage = voterCount ? Math.round((counts[index] / voterCount) * 100) : 0;
        return "**" + (index + 1) + ". " + option + "** — " + counts[index] + " vote(s) · " + percentage + "%";
    });
    const mode = poll.allowMultiple ? "Tu peux sélectionner plusieurs choix." : "Un seul choix par personne.";
    const end = poll.endAt ? "Fin : <t:" + Math.floor(poll.endAt / 1000) + ":R>" : "Pas de fin automatique — utilise le bouton pour clôturer.";
    const status = poll.ended ? "\n\n🔒 **Sondage terminé**" : "";
    return createEmbed({
        title: poll.title + (poll.ended ? " • Terminé" : ""),
        description: "## " + poll.question + "\n\n" + lines.join("\n") + "\n\n👥 " + voterCount + " votant(s)\n" + mode + "\n" + end + status,
        color: parseEmbedColor(poll.color, COLORS.primary),
        thumbnail: resolveEmbedImage(poll.thumbnail, guild, null, null),
        image: resolveEmbedImage(poll.image, guild, null, null),
        footer: poll.footer || (guild.name + " • Sondage"),
        timestamp: poll.timestamp !== false
    });
}

async function createPoll(guild, channel, data) {
    const poll = {
        id: generatePollId(),
        guildId: guild.id,
        channelId: channel.id,
        messageId: null,
        creatorId: data.creatorId,
        title: data.title,
        question: data.question,
        options: data.options,
        allowMultiple: data.allowMultiple,
        color: data.color,
        footer: data.footer,
        thumbnail: data.thumbnail,
        image: data.image,
        timestamp: data.timestamp,
        endAt: data.endAt,
        votes: {},
        ended: false
    };
    const pollMessage = await channel.send({ embeds: [buildPollEmbed(guild, poll)], components: buildPollComponents(poll) }).catch(() => null);
    if (!pollMessage) return null;
    poll.messageId = pollMessage.id;
    ensurePolls(guild.id)[poll.id] = poll;
    saveDatabase();
    return poll;
}

async function finishPoll(guild, pollId, messageOverride = null) {
    const poll = ensurePolls(guild.id)[pollId];
    if (!poll || poll.ended) return false;
    poll.ended = true;
    saveDatabase();
    let pollMessage = messageOverride;
    if (!pollMessage) {
        const channel = guild.channels.cache.get(poll.channelId);
        if (channel?.isTextBased()) pollMessage = await channel.messages.fetch(poll.messageId).catch(() => null);
    }
    if (pollMessage) await pollMessage.edit({ embeds: [buildPollEmbed(guild, poll)], components: [] }).catch(() => {});
    return true;
}

async function showPollModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId("hirosaki_poll_config:" + interaction.user.id)
        .setTitle("Créer un sondage")
        .addComponents(
            createConfigInput("title", "Titre du sondage", TextInputStyle.Short, "📊 Sondage", true),
            createConfigInput("question", "Question", TextInputStyle.Paragraph, "", true),
            createConfigInput("choices", "Choix, un par ligne (2 à 10)", TextInputStyle.Paragraph, "", true),
            createConfigInput("duration", "Durée ou date exacte (facultatif)", TextInputStyle.Short, "1d"),
            createConfigInput("style", "Options séparées par ;", TextInputStyle.Paragraph, "color=#5865F2; footer=Merci pour votre vote !")
        );
    await interaction.showModal(modal);
}

registerCommand(
    "sondage",
    {
        permission: 0,
        aliases: ["poll", "sondage-form"],
        execute: async message => {
            return message.reply({
                embeds: [infoEmbed("📝 Clique sur le bouton ci-dessous pour créer un sondage entièrement personnalisable.")],
                components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("hirosaki_open_poll_form:" + message.author.id).setLabel("Créer le sondage").setEmoji("📊").setStyle(ButtonStyle.Primary))],
                allowedMentions: { repliedUser: false }
            });
        }
    }
);

setInterval(
    async () => {
        const now = Date.now();
        for (const guild of client.guilds.cache.values()) {
            for (const poll of Object.values(ensurePolls(guild.id))) {
                if (!poll.ended && poll.endAt && poll.endAt <= now) await finishPoll(guild, poll.id);
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
        if (interaction.isModalSubmit()) {
            try {
                const [modalType, userId] = interaction.customId.split(":");
                if (userId !== interaction.user.id) return;

                if (modalType === "hirosaki_poll_config") {
                    const title = interaction.fields.getTextInputValue("title").trim();
                    const question = interaction.fields.getTextInputValue("question").trim();
                    const choiceResult = parsePollChoices(interaction.fields.getTextInputValue("choices"));
                    const durationInput = interaction.fields.getTextInputValue("duration").trim();
                    const styleInput = interaction.fields.getTextInputValue("style").trim();
                    const style = parsePipeOptions(styleInput.split(";").map(part => part.trim()));
                    const endAt = durationInput ? parseGiveawayEndAt(durationInput) : null;
                    if (!title || !question) return interaction.reply({ content: "❌ Le titre et la question sont obligatoires.", ephemeral: true });
                    if (choiceResult.error) return interaction.reply({ content: "❌ " + choiceResult.error, ephemeral: true });
                    if (durationInput && !endAt) return interaction.reply({ content: "❌ Durée ou date de fin invalide. Exemples : 30m, 2h, 3d ou 2026-09-05T20:00:00+02:00.", ephemeral: true });
                    if (endAt && endAt - Date.now() < 10_000) return interaction.reply({ content: "❌ La durée doit laisser au moins 10 secondes de vote.", ephemeral: true });
                    const optionError = giveawayOptionError(style);
                    if (optionError) return interaction.reply({ content: "❌ " + optionError, ephemeral: true });
                    const poll = await createPoll(interaction.guild, interaction.channel, {
                        creatorId: interaction.user.id,
                        title,
                        question,
                        options: choiceResult.choices,
                        allowMultiple: parsePollBoolean(style.multiple),
                        color: style.color || "#5865F2",
                        footer: style.footer || null,
                        thumbnail: style.thumbnail || null,
                        image: style.image || null,
                        timestamp: String(style.timestamp || "").toLowerCase() !== "off",
                        endAt
                    });
                    if (!poll) return interaction.reply({ content: "❌ Impossible de créer le sondage dans ce salon.", ephemeral: true });
                    return interaction.reply({ content: "✅ Sondage créé" + (endAt ? " — fin : <t:" + Math.floor(endAt / 1000) + ":F>" : ""), ephemeral: true });
                }

                if (modalType === "hirosaki_dm_config" || modalType === "hirosaki_welcome_config") {
                    const config = ensureGuild(interaction.guild.id);
                    const target = modalType === "hirosaki_dm_config" ? config.dmSanctions : config.welcome;
                    const defaultColor = modalType === "hirosaki_dm_config" ? "#ED4245" : "#5865F2";
                    const title = interaction.fields.getTextInputValue("title").trim();
                    const messageText = interaction.fields.getTextInputValue("message").trim();
                    const colorText = interaction.fields.getTextInputValue("color").trim();
                    const footer = interaction.fields.getTextInputValue("footer").trim();
                    const image = interaction.fields.getTextInputValue("image").trim();
                    if (!title || !messageText) return interaction.reply({ content: "❌ Le titre et le message sont obligatoires.", ephemeral: true });
                    if (colorText && parseEmbedColor(colorText, null) === null) return interaction.reply({ content: "❌ Couleur invalide. Utilise un nom intégré ou un code comme #5865F2.", ephemeral: true });
                    if (image && !isValidEmbedUrl(image)) return interaction.reply({ content: "❌ L'URL de l'image est invalide.", ephemeral: true });
                    target.title = title;
                    target.message = messageText;
                    target.color = colorText || defaultColor;
                    target.footer = footer || "{server}";
                    target.image = image || null;
                    saveDatabase();
                    return interaction.reply({ content: "✅ Configuration enregistrée. Utilise +" + (modalType === "hirosaki_dm_config" ? "dm test" : "welcome test") + " pour voir le rendu.", ephemeral: true });
                }

                if (modalType === "hirosaki_giveaway_config") {
                    const prize = interaction.fields.getTextInputValue("prize").trim();
                    const winners = Number(interaction.fields.getTextInputValue("winners").trim());
                    const durationInput = interaction.fields.getTextInputValue("duration").trim();
                    const endInput = interaction.fields.getTextInputValue("endAt").trim();
                    const styleInput = interaction.fields.getTextInputValue("style").trim();
                    const endAt = endInput ? parseGiveawayEndAt(endInput) : parseGiveawayEndAt(durationInput);
                    const options = parsePipeOptions(styleInput.split(";").map(part => part.trim()));
                    if (!prize || !winners || winners < 1 || !endAt) return interaction.reply({ content: "❌ Renseigne un prix, un nombre de gagnants et une durée ou une date de fin valide.", ephemeral: true });
                    const optionError = giveawayOptionError(options);
                    if (optionError) return interaction.reply({ content: "❌ " + optionError, ephemeral: true });
                    const giveaway = await createGiveaway(interaction.guild, interaction.channel, { prize, winners, endAt, options });
                    if (!giveaway) return interaction.reply({ content: "❌ Impossible de créer le giveaway dans ce salon.", ephemeral: true });
                    return interaction.reply({ content: "✅ Giveaway créé. ID : " + giveaway.id + " — fin : <t:" + Math.floor(endAt / 1000) + ":F>", ephemeral: true });
                }
            } catch (error) {
                console.error("Erreur formulaire de configuration :", error);
                if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "❌ Impossible d'enregistrer cette configuration.", ephemeral: true }).catch(() => {});
            }
            return;
        }

        if (!interaction.isButton()) return;

        try {
            if (interaction.customId.startsWith("hirosaki_open_dm_form:") || interaction.customId.startsWith("hirosaki_open_welcome_form:")) {
                const [buttonType, userId] = interaction.customId.split(":");
                if (userId !== interaction.user.id) return interaction.reply({ content: "❌ Ce formulaire appartient à une autre personne.", ephemeral: true });
                const type = buttonType.includes("dm") ? "dm" : "welcome";
                return showTemplateConfigModal(interaction, type, ensureGuild(interaction.guild.id));
            }

            if (interaction.customId.startsWith("hirosaki_open_poll_form:")) {
                const userId = interaction.customId.split(":")[1];
                if (userId !== interaction.user.id) return interaction.reply({ content: "❌ Ce formulaire appartient à une autre personne.", ephemeral: true });
                return showPollModal(interaction);
            }

            if (interaction.customId.startsWith("hirosaki_open_giveaway_form:")) {
                const userId = interaction.customId.split(":")[1];
                if (userId !== interaction.user.id) return interaction.reply({ content: "❌ Ce formulaire appartient à une autre personne.", ephemeral: true });
                return showGiveawayModal(interaction);
            }

            if (interaction.customId === "hirosaki_ticket_create") {
                await createTicketForMember(interaction);
                return;
            }

            if (interaction.customId.startsWith("hirosaki_poll_end:")) {
                const pollId = interaction.customId.split(":")[1];
                const poll = ensurePolls(interaction.guild.id)[pollId];
                if (!poll || poll.ended) return interaction.reply({ content: "❌ Ce sondage est déjà terminé ou introuvable.", ephemeral: true });
                if (poll.creatorId !== interaction.user.id && !hasPermission(interaction.member, 4)) return interaction.reply({ content: "❌ Seul le créateur du sondage ou un responsable staff peut le clôturer.", ephemeral: true });
                await finishPoll(interaction.guild, pollId, interaction.message);
                return interaction.reply({ content: "🔒 Sondage clôturé.", ephemeral: true });
            }

            if (interaction.customId.startsWith("hirosaki_poll_vote:")) {
                const parts = interaction.customId.split(":");
                const pollId = parts[1];
                const optionIndex = Number(parts[2]);
                const poll = ensurePolls(interaction.guild.id)[pollId];
                if (!poll || poll.ended) return interaction.reply({ content: "❌ Ce sondage est terminé ou introuvable.", ephemeral: true });
                if (poll.endAt && poll.endAt <= Date.now()) {
                    await finishPoll(interaction.guild, pollId, interaction.message);
                    return interaction.reply({ content: "❌ Ce sondage vient de se terminer.", ephemeral: true });
                }
                if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) return interaction.reply({ content: "❌ Choix invalide.", ephemeral: true });
                if (!poll.votes || typeof poll.votes !== "object") poll.votes = {};
                const current = Array.isArray(poll.votes[interaction.user.id]) ? poll.votes[interaction.user.id] : [];
                let selected;
                if (poll.allowMultiple) {
                    selected = current.includes(optionIndex) ? current.filter(index => index !== optionIndex) : current.concat(optionIndex);
                    if (!selected.length) delete poll.votes[interaction.user.id];
                    else poll.votes[interaction.user.id] = selected;
                } else {
                    selected = current.length === 1 && current[0] === optionIndex ? [] : [optionIndex];
                    if (!selected.length) delete poll.votes[interaction.user.id];
                    else poll.votes[interaction.user.id] = selected;
                }
                saveDatabase();
                await interaction.message.edit({ embeds: [buildPollEmbed(interaction.guild, poll)], components: buildPollComponents(poll) }).catch(() => {});
                return interaction.reply({ content: selected.length ? "✅ Vote enregistré pour : " + poll.options[optionIndex] : "↩️ Vote retiré.", ephemeral: true });
            }

            if (interaction.customId.startsWith("hirosaki_giveaway_count:")) {
                const giveawayId = interaction.customId.split(":")[1];
                const giveaway = ensureGiveaways(interaction.guild.id)[giveawayId];
                if (!giveaway) return interaction.reply({ embeds: [errorEmbed("❌ Ce giveaway est introuvable.")], ephemeral: true });
                const participantCount = getGiveawayEntries(giveaway).length;
                return interaction.reply({
                    content: "👥 Ce giveaway compte actuellement **" + participantCount + " participant" + (participantCount > 1 ? "s" : "") + "**.",
                    ephemeral: true
                });
            }

            if (interaction.customId.startsWith("hirosaki_giveaway_join:")) {
                const giveawayId = interaction.customId.split(":")[1];
                const giveaways = ensureGiveaways(interaction.guild.id);
                const giveaway = giveaways[giveawayId];
                if (!giveaway || giveaway.ended) return interaction.reply({ embeds: [errorEmbed("❌ Ce giveaway est terminé ou introuvable.")], ephemeral: true });
                if (giveaway.endAt <= Date.now()) {
                    await finishGiveaway(interaction.guild, giveawayId);
                    return interaction.reply({ embeds: [errorEmbed("❌ Ce giveaway vient de se terminer.")], ephemeral: true });
                }
                const entries = getGiveawayEntries(giveaway);
                const index = entries.indexOf(interaction.user.id);
                if (index !== -1) {
                    entries.splice(index, 1);
                    giveaway.entries = entries;
                    saveDatabase();
                    await interaction.message.edit({ components: buildGiveawayComponents(giveaway) }).catch(() => {});
                    return interaction.reply({ embeds: [infoEmbed("↩️ Tu as été retiré du giveaway.")], ephemeral: true });
                }
                entries.push(interaction.user.id);
                giveaway.entries = entries;
                saveDatabase();
                await interaction.message.edit({ components: buildGiveawayComponents(giveaway) }).catch(() => {});
                return interaction.reply({ embeds: [successEmbed("🎉 Tu participes maintenant au giveaway !")], ephemeral: true });
            }
        } catch (error) {
            console.error("Erreur interaction partie 5 :", error);
            if (!interaction.replied && !interaction.deferred) await interaction.reply({ embeds: [errorEmbed("❌ Une erreur est survenue.")], ephemeral: true }).catch(() => {});
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

function replaceWelcomeVariables(text, member) {
    const guild = member.guild;
    const online = guild.members.cache.filter(m => m.presence && m.presence.status !== "offline").size;
    return replaceTemplateVariables(text, { user: member, username: member.user.username, "member.count": guild.memberCount, server: guild.name, "server.name": guild.name, "server.id": guild.id, "member.id": member.id, "member.tag": member.user.tag, online });
}

function buildWelcomeEmbed(member, settings) {
    const guild = member.guild;
    return createEmbed({ title: replaceWelcomeVariables(settings.title || "👋 Bienvenue !", member), description: replaceWelcomeVariables(settings.message || "Bienvenue {user} sur **{server}** !", member), color: parseEmbedColor(settings.color, COLORS.primary), thumbnail: resolveEmbedImage(settings.thumbnail || "member", guild, member, member.user.displayAvatarURL({ extension: "png", size: 512 })), image: resolveEmbedImage(settings.image, guild, member, null), footer: replaceWelcomeVariables(settings.footer || "{server}", member), timestamp: settings.timestamp !== false });
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

            if (!config.welcome.enabled || !config.welcome.channelId) return;
            const channel = member.guild.channels.cache.get(config.welcome.channelId);
            if (!channel?.isTextBased()) return;
            await channel.send({ embeds: [buildWelcomeEmbed(member, config.welcome)] }).catch(() => {});
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
