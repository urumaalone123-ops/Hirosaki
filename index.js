const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionsBitField,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const {
    joinVoiceChannel,
    getVoiceConnection
} = require("@discordjs/voice");

// ============================================================
// CONFIGURATION
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = "+";

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN est introuvable.");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
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
// BASE DE DONNÉES
// ============================================================

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "hirosaki.json");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaultDB = {
    guilds: {},
    messages: {},
    votes: {},
    voice: {},
    duo: {},
    warnings: {},
    snipe: {},
    tickets: {},
    giveaways: {}
};

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(defaultDB, null, 2)
        );

        return JSON.parse(JSON.stringify(defaultDB));
    }

    try {
        const data = JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );

        for (const key of Object.keys(defaultDB)) {
            if (!data[key]) {
                data[key] = {};
            }
        }

        return data;
    } catch (error) {
        console.error("❌ Erreur de lecture de la DB :", error);

        return JSON.parse(JSON.stringify(defaultDB));
    }
}

let db = loadDatabase();

let saveTimeout;

function saveDatabase() {
    clearTimeout(saveTimeout);

    saveTimeout = setTimeout(() => {
        try {
            fs.writeFileSync(
                DB_FILE,
                JSON.stringify(db, null, 2)
            );
        } catch (error) {
            console.error("❌ Erreur sauvegarde DB :", error);
        }
    }, 250);
}

// ============================================================
// CONFIGURATION SERVEUR
// ============================================================

function ensureGuild(guildId) {
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = {
            roles: {
                perm1: "Modérateur test",
                perm2: "Modérateur",
                perm3: "Staff confirmé",
                perm4: "Responsable staff",
                perm5: "Co-owner",
                crown: "Crown",
                ticket: "Gestion ticket"
            },

            welcome: {
                enabled: false,
                channelId: null,
                message:
                    "Bienvenue {user} sur **{server}** !"
            },

            autorole: {
                enabled: false,
                roleId: null
            },

            logs: {
                enabled: false,
                channelId: null
            },

            ticket: {
                enabled: false,
                categoryId: null,
                panelChannelId: null
            }
        };
    }

    const keys = [
        "messages",
        "votes",
        "voice",
        "duo",
        "warnings",
        "snipe",
        "tickets",
        "giveaways"
    ];

    for (const key of keys) {
        if (!db[key][guildId]) {
            db[key][guildId] = {};
        }
    }

    return db.guilds[guildId];
}

// ============================================================
// EMBEDS
// ============================================================

function embed(title, description, color = 0x5865f2) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
}

function success(text) {
    return embed(
        "✅ Hirosaki",
        text,
        0x57f287
    );
}

function errorEmbed(text) {
    return embed(
        "❌ Hirosaki",
        text,
        0xed4245
    );
}

function information(text) {
    return embed(
        "ℹ️ Hirosaki",
        text,
        0x5865f2
    );
}

// ============================================================
// OUTILS
// ============================================================

function formatNumber(number) {
    return Number(number || 0)
        .toLocaleString("fr-FR");
}

function formatDuration(milliseconds) {
    if (!milliseconds || milliseconds <= 0) {
        return "0s";
    }

    let seconds = Math.floor(milliseconds / 1000);

    const days = Math.floor(seconds / 86400);
    seconds %= 86400;

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    const parts = [];

    if (days) parts.push(`${days}j`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds || parts.length === 0) {
        parts.push(`${seconds}s`);
    }

    return parts.join(" ");
}

function parseDuration(value) {
    if (!value) return null;

    const match = String(value)
        .toLowerCase()
        .match(/^(\d+)(s|m|h|d|w)$/);

    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2];

    const units = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000
    };

    return amount * units[unit];
}

async function reply(message, content) {
    try {
        return await message.reply({
            embeds: [content],
            allowedMentions: {
                repliedUser: false
            }
        });
    } catch (error) {
        console.error("❌ Erreur réponse :", error);
        return null;
    }
}

// ============================================================
// RECHERCHE MEMBRE
// ============================================================

async function getMember(message, value) {
    if (!message.guild || !value) {
        return null;
    }

    const mention = value.match(/^<@!?(\d+)>$/);

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

    const search = value.toLowerCase();

    return message.guild.members.cache.find(member =>
        member.user.username.toLowerCase() === search ||
        member.displayName.toLowerCase() === search
    ) || null;
}

// ============================================================
// RECHERCHE RÔLE
// ============================================================

function getRole(guild, value) {
    if (!guild || !value) {
        return null;
    }

    const mention = value.match(/^<@&(\d+)>$/);

    if (mention) {
        return guild.roles.cache.get(mention[1]) || null;
    }

    if (/^\d{17,20}$/.test(value)) {
        return guild.roles.cache.get(value) || null;
    }

    const search = value.toLowerCase();

    return guild.roles.cache.find(role =>
        role.name.toLowerCase() === search
    ) || null;
}

// ============================================================
// RECHERCHE SALON
// ============================================================

function getChannel(guild, value) {
    if (!guild || !value) {
        return null;
    }

    const mention = value.match(/^<#(\d+)>$/);

    if (mention) {
        return guild.channels.cache.get(mention[1]) || null;
    }

    if (/^\d{17,20}$/.test(value)) {
        return guild.channels.cache.get(value) || null;
    }

    return guild.channels.cache.find(channel =>
        channel.name.toLowerCase() === value.toLowerCase()
    ) || null;
}

// ============================================================
// PERMISSIONS HIROSAKI
// ============================================================

const PERMISSIONS = {
    1: "Modérateur test",
    2: "Modérateur",
    3: "Staff confirmé",
    4: "Responsable staff",
    5: "Co-owner"
};

function isCrown(member) {
    if (!member) return false;

    return member.roles.cache.some(
        role => role.name === "Crown"
    );
}

function getPermission(member) {
    if (!member) return 0;

    if (isCrown(member)) {
        return 999;
    }

    let level = 0;

    for (const [number, roleName] of Object.entries(PERMISSIONS)) {
        if (
            member.roles.cache.some(
                role => role.name === roleName
            )
        ) {
            level = Math.max(
                level,
                Number(number)
            );
        }
    }

    return level;
}

function hasPermission(member, level) {
    return getPermission(member) >= level;
}

function hasTicketPermission(member) {
    if (!member) return false;

    if (isCrown(member)) {
        return true;
    }

    if (member.roles.cache.some(
        role => role.name === "Gestion ticket"
    )) {
        return true;
    }

    return getPermission(member) >= 4;
}

function checkPermission(message, level) {
    if (
        !message.guild ||
        !hasPermission(message.member, level)
    ) {
        reply(
            message,
            errorEmbed(
                `Tu n'as pas la permission nécessaire.\n` +
                `Permission requise : **Perm ${level}**.`
            )
        );

        return false;
    }

    return true;
}

function checkCrown(message) {
    if (
        !message.guild ||
        !isCrown(message.member)
    ) {
        reply(
            message,
            errorEmbed(
                "Cette commande est réservée à **Crown**."
            )
        );

        return false;
    }

    return true;
}

// ============================================================
// COMMANDES
// ============================================================

const commands = new Map();

function command(name, options) {
    commands.set(name.toLowerCase(), {
        name,
        ...options
    });

    if (options.aliases) {
        for (const alias of options.aliases) {
            commands.set(alias.toLowerCase(), {
                name,
                ...options
            });
        }
    }
}
// ============================================================
// +HELP
// ============================================================

const helpPages = [
    {
        title: "📖 Hirosaki — Commandes générales",
        description: [
            "`+help` — Afficher les commandes",
            "`+stat [@membre]` — Voir les statistiques",
            "`+leaderboard` — Classement messages / votes / duo",
            "`+snipe` — Voir le dernier message supprimé"
        ].join("\n")
    },
    {
        title: "🛡️ Hirosaki — Modération",
        description: [
            "`+warn @membre [raison]`",
            "`+warnings @membre`",
            "`+unwarn @membre [id]`",
            "`+kick @membre [raison]`",
            "`+ban @membre [raison]`",
            "`+unban ID`",
            "`+timeout @membre durée [raison]`",
            "`+untimeout @membre`",
            "`+clear nombre`",
            "`+lock`",
            "`+unlock`",
            "`+slowmode secondes`"
        ].join("\n")
    },
    {
        title: "👑 Hirosaki — Gestion des rôles",
        description: [
            "`+rank @membre 1-5` — Crown uniquement",
            "`+derank @membre` — Crown uniquement",
            "`+L @membre @role`",
            "`+role-remove @membre @role`"
        ].join("\n")
    },
    {
        title: "🎫 Hirosaki — Tickets",
        description: [
            "`+ticketpanel` — Créer le panneau",
            "`+ticket-close` — Fermer un ticket",
            "`+ticket-add @membre` — Ajouter un membre",
            "`+ticket-remove @membre` — Retirer un membre"
        ].join("\n")
    },
    {
        title: "⚙️ Hirosaki — Configuration",
        description: [
            "`+welcome #salon on/off`",
            "`+welcome-message texte`",
            "`+autorole @role on/off`",
            "`+logs #salon`",
            "`+join` — Rejoindre ton vocal",
            "`+leave` — Quitter le vocal"
        ].join("\n")
    },
    {
        title: "🎉 Hirosaki — Animation",
        description: [
            "`+giveaway durée gagnants récompense`",
            "`+giveaway-end ID`",
            "`+autoroll #salon minutes`"
        ].join("\n")
    }
];

function createHelpEmbed(page) {
    return new EmbedBuilder()
        .setTitle(helpPages[page].title)
        .setDescription(helpPages[page].description)
        .setColor(0x5865f2)
        .setFooter({
            text: `Hirosaki • Page ${page + 1}/${helpPages.length}`
        });
}

function createHelpButtons(page) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("help_previous")
            .setLabel("◀")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),

        new ButtonBuilder()
            .setCustomId("help_next")
            .setLabel("▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === helpPages.length - 1)
    );
}

command("help", {
    level: 0,

    execute: async message => {
        let page = 0;

        const sent = await message.reply({
            embeds: [createHelpEmbed(page)],
            components: [createHelpButtons(page)]
        });

        const collector =
            sent.createMessageComponentCollector({
                time: 120000
            });

        collector.on("collect", async interaction => {
            if (
                interaction.user.id !==
                message.author.id
            ) {
                return interaction.reply({
                    content:
                        "❌ Ce menu n'est pas le tien.",
                    ephemeral: true
                });
            }

            if (
                interaction.customId ===
                "help_previous"
            ) {
                page--;
            }

            if (
                interaction.customId ===
                "help_next"
            ) {
                page++;
            }

            await interaction.update({
                embeds: [
                    createHelpEmbed(page)
                ],
                components: [
                    createHelpButtons(page)
                ]
            });
        });
    }
});

// ============================================================
// +RANK
// ============================================================

command("rank", {
    crownOnly: true,

    execute: async (message, args) => {
        if (!checkCrown(message)) return;

        const member =
            await getMember(message, args[0]);

        const level =
            Number(args[1]);

        if (
            !member ||
            !Number.isInteger(level) ||
            level < 1 ||
            level > 5
        ) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}rank @membre 1-5\``
                )
            );
        }

        if (isCrown(member)) {
            return reply(
                message,
                errorEmbed(
                    "❌ Impossible de modifier Crown."
                )
            );
        }

        const roleName =
            PERMISSIONS[level];

        const role =
            message.guild.roles.cache.find(
                r => r.name === roleName
            );

        if (!role) {
            return reply(
                message,
                errorEmbed(
                    `Le rôle **${roleName}** n'existe pas.`
                )
            );
        }

        const botMember =
            message.guild.members.me;

        if (
            !botMember ||
            role.position >=
            botMember.roles.highest.position
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Mon rôle est trop bas pour gérer ce rôle."
                )
            );
        }

        // Retire les anciens Perm.
        for (
            const oldRoleName
            of Object.values(PERMISSIONS)
        ) {
            const oldRole =
                message.guild.roles.cache.find(
                    r => r.name === oldRoleName
                );

            if (
                oldRole &&
                member.roles.cache.has(oldRole.id)
            ) {
                await member.roles
                    .remove(oldRole)
                    .catch(() => {});
            }
        }

        await member.roles.add(
            role,
            `Rank Perm ${level} par ${message.author.tag}`
        );

        return reply(
            message,
            success(
                `${member} est maintenant **${roleName}**.`
            )
        );
    }
});

// ============================================================
// +DERANK
// ============================================================

command("derank", {
    crownOnly: true,

    execute: async (message, args) => {
        if (!checkCrown(message)) return;

        const member =
            await getMember(message, args[0]);

        if (!member) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}derank @membre\``
                )
            );
        }

        if (isCrown(member)) {
            return reply(
                message,
                errorEmbed(
                    "❌ Impossible de derank Crown."
                )
            );
        }

        let removed = false;

        for (
            const roleName
            of Object.values(PERMISSIONS)
        ) {
            const role =
                message.guild.roles.cache.find(
                    r => r.name === roleName
                );

            if (
                role &&
                member.roles.cache.has(role.id)
            ) {
                await member.roles
                    .remove(role)
                    .catch(() => {});

                removed = true;
            }
        }

        return reply(
            message,
            success(
                removed
                    ? `${member} a été **derank**.`
                    : `${member} n'avait aucun rôle de permission.`
            )
        );
    }
});

// ============================================================
// +L
// ============================================================

command("l", {
    aliases: ["L"],
    level: 4,

    execute: async (message, args) => {
        if (!checkPermission(message, 4)) {
            return;
        }

        const member =
            await getMember(message, args[0]);

        const role =
            getRole(
                message.guild,
                args.slice(1).join(" ")
            );

        if (!member || !role) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}L @membre @role\``
                )
            );
        }

        if (role.name === "Crown") {
            return reply(
                message,
                errorEmbed(
                    "❌ Le rôle Crown ne peut pas être attribué avec cette commande."
                )
            );
        }

        const botMember =
            message.guild.members.me;

        if (
            !botMember ||
            role.position >=
            botMember.roles.highest.position
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Je ne peux pas gérer ce rôle."
                )
            );
        }

        if (
            !isCrown(message.member) &&
            role.position >=
            message.member.roles.highest.position
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Tu ne peux pas gérer un rôle supérieur ou égal au tien."
                )
            );
        }

        await member.roles.add(
            role,
            `+L par ${message.author.tag}`
        );

        return reply(
            message,
            success(
                `${role} a été ajouté à ${member}.`
            )
        );
    }
});

// ============================================================
// +ROLE-REMOVE
// ============================================================

command("role-remove", {
    level: 4,

    execute: async (message, args) => {
        if (!checkPermission(message, 4)) {
            return;
        }

        const member =
            await getMember(message, args[0]);

        const role =
            getRole(
                message.guild,
                args.slice(1).join(" ")
            );

        if (!member || !role) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}role-remove @membre @role\``
                )
            );
        }

        await member.roles.remove(
            role,
            `Retrait par ${message.author.tag}`
        );

        return reply(
            message,
            success(
                `${role} a été retiré de ${member}.`
            )
        );
    }
});

// ============================================================
// WARN
// ============================================================

command("warn", {
    level: 2,

    execute: async (message, args) => {
        if (!checkPermission(message, 2)) {
            return;
        }

        const member =
            await getMember(message, args[0]);

        if (
            !member ||
            member.id === message.author.id
        ) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}warn @membre [raison]\``
                )
            );
        }

        if (
            !isCrown(message.member) &&
            getPermission(member) >=
            getPermission(message.member)
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Tu ne peux pas sanctionner ce membre."
                )
            );
        }

        const reason =
            args.slice(1).join(" ") ||
            "Aucune raison";

        ensureGuild(message.guild.id);

        if (
            !db.warnings[message.guild.id][member.id]
        ) {
            db.warnings[
                message.guild.id
            ][member.id] = [];
        }

        const warning = {
            id: Date.now().toString(),
            reason,
            moderator: message.author.id,
            timestamp: Date.now()
        };

        db.warnings[
            message.guild.id
        ][member.id].push(warning);

        saveDatabase();

        const warningEmbed = new EmbedBuilder()
            .setTitle("⚠️ Avertissement")
            .setDescription(
                `Tu as reçu un avertissement sur **${message.guild.name}**.\n\n` +
                `**Raison :** ${reason}`
            )
            .setColor(0xfee75c)
            .setTimestamp();

        await member.send({
            embeds: [warningEmbed]
        }).catch(() => {});

        return reply(
            message,
            success(
                `${member} a reçu un avertissement.\n\n` +
                `**Raison :** ${reason}\n` +
                `**ID :** \`${warning.id}\``
            )
        );
    }
});

// ============================================================
// WARNINGS
// ============================================================

command("warnings", {
    aliases: ["warns"],
    level: 1,

    execute: async (message, args) => {
        if (!checkPermission(message, 1)) {
            return;
        }

        const member =
            await getMember(message, args[0]);

        if (!member) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}warnings @membre\``
                )
            );
        }

        ensureGuild(message.guild.id);

        const list =
            db.warnings[
                message.guild.id
            ][member.id] || [];

        if (!list.length) {
            return reply(
                message,
                information(
                    `${member} n'a aucun avertissement.`
                )
            );
        }

        const text = list
            .slice(-15)
            .reverse()
            .map((warning, index) =>
                `**${index + 1}.** \`${warning.id}\`\n` +
                `> ${warning.reason}\n` +
                `> <@${warning.moderator}> • <t:${Math.floor(warning.timestamp / 1000)}:R>`
            )
            .join("\n\n");

        const result = new EmbedBuilder()
            .setTitle(
                `⚠️ Warnings — ${member.user.tag}`
            )
            .setDescription(text)
            .setColor(0xfee75c)
            .setThumbnail(
                member.displayAvatarURL({
                    extension: "png"
                })
            );

        return reply(message, result);
    }
});

// ============================================================
// UNWARN
// ============================================================

command("unwarn", {
    level: 2,

    execute: async (message, args) => {
        if (!checkPermission(message, 2)) {
            return;
        }

        const member =
            await getMember(message, args[0]);

        if (!member) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}unwarn @membre [id]\``
                )
            );
        }

        ensureGuild(message.guild.id);

        const list =
            db.warnings[
                message.guild.id
            ][member.id] || [];

        if (!list.length) {
            return reply(
                message,
                information(
                    `${member} n'a aucun avertissement.`
                )
            );
        }

        if (args[1]) {
            const index =
                list.findIndex(
                    warning =>
                        warning.id === args[1]
                );

            if (index === -1) {
                return reply(
                    message,
                    errorEmbed(
                        "❌ ID de warning introuvable."
                    )
                );
            }

            list.splice(index, 1);
        } else {
            list.pop();
        }

        saveDatabase();

        return reply(
            message,
            success(
                `L'avertissement de ${member} a été retiré.`
            )
        );
    }
});

// ============================================================
// KICK
// ============================================================

command("kick", {
    level: 2,

    execute: async (message, args) => {
        if (!checkPermission(message, 2)) {
            return;
        }

        const member =
            await getMember(message, args[0]);

        if (
            !member ||
            !member.kickable
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Je ne peux pas expulser ce membre."
                )
            );
        }

        if (
            !isCrown(message.member) &&
            getPermission(member) >=
            getPermission(message.member)
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Tu ne peux pas expulser ce membre."
                )
            );
        }

        const reason =
            args.slice(1).join(" ") ||
            "Aucune raison";

        await member.send({
            embeds: [
                embed(
                    "👢 Expulsion",
                    `Tu as été expulsé de **${message.guild.name}**.\n\n` +
                    `**Raison :** ${reason}`,
                    0xed4245
                )
            ]
        }).catch(() => {});

        await member.kick(reason);

        return reply(
            message,
            success(
                `**${member.user.tag}** a été expulsé.\n` +
                `**Raison :** ${reason}`
            )
        );
    }
});

// ============================================================
// BAN
// ============================================================

command("ban", {
    level: 3,

    execute: async (message, args) => {
        if (!checkPermission(message, 3)) {
            return;
        }

        const member =
            await getMember(message, args[0]);

        if (
            !member ||
            !member.bannable
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Je ne peux pas bannir ce membre."
                )
            );
        }

        if (
            !isCrown(message.member) &&
            getPermission(member) >=
            getPermission(message.member)
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Tu ne peux pas bannir ce membre."
                )
            );
        }

        const reason =
            args.slice(1).join(" ") ||
            "Aucune raison";

        await member.send({
            embeds: [
                embed(
                    "🔨 Bannissement",
                    `Tu as été banni de **${message.guild.name}**.\n\n` +
                    `**Raison :** ${reason}`,
                    0xed4245
                )
            ]
        }).catch(() => {});

        await member.ban({
            reason,
            deleteMessageSeconds: 86400
        });

        return reply(
            message,
            success(
                `**${member.user.tag}** a été banni.\n` +
                `**Raison :** ${reason}`
            )
        );
    }
});

// ============================================================
// UNBAN
// ============================================================

command("unban", {
    level: 4,

    execute: async (message, args) => {
        if (!checkPermission(message, 4)) {
            return;
        }

        const userId = args[0];

        if (
            !userId ||
            !/^\d{17,20}$/.test(userId)
        ) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}unban ID\``
                )
            );
        }

        try {
            await message.guild.members.unban(
                userId
            );

            return reply(
                message,
                success(
                    `L'utilisateur \`${userId}\` a été débanni.`
                )
            );
        } catch {
            return reply(
                message,
                errorEmbed(
                    "❌ Utilisateur introuvable dans les bannissements."
                )
            );
        }
    }
});

// ============================================================
// TIMEOUT
// ============================================================

command("timeout", {
    level: 2,

    execute: async (message, args) => {
        if (!checkPermission(message, 2)) {
            return;
        }

        const member =
            await getMember(message, args[0]);

        const duration =
            parseDuration(args[1]);

        if (!member || !duration) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}timeout @membre 10m [raison]\``
                )
            );
        }

        if (
            !isCrown(message.member) &&
            getPermission(member) >=
            getPermission(message.member)
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Tu ne peux pas timeout ce membre."
                )
            );
        }

        if (!member.moderatable) {
            return reply(
                message,
                errorEmbed(
                    "❌ Je ne peux pas timeout ce membre."
                )
            );
        }

        const reason =
            args.slice(2).join(" ") ||
            "Aucune raison";

        await member.timeout(
            duration,
            reason
        );

        return reply(
            message,
            success(
                `${member} a été timeout pendant **${formatDuration(duration)}**.\n` +
                `**Raison :** ${reason}`
            )
        );
    }
});

// ============================================================
// UNTIMEOUT
// ============================================================

command("untimeout", {
    level: 2,

    execute: async (message, args) => {
        if (!checkPermission(message, 2)) {
            return;
        }

        const member =
            await getMember(message, args[0]);

        if (!member) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}untimeout @membre\``
                )
            );
        }

        await member.timeout(
            null,
            `Timeout retiré par ${message.author.tag}`
        );

        return reply(
            message,
            success(
                `Le timeout de ${member} a été retiré.`
            )
        );
    }
});
// ============================================================
// CLEAR
// ============================================================

command("clear", {
    aliases: ["purge"],
    level: 2,

    execute: async (message, args) => {
        if (!checkPermission(message, 2)) return;

        const amount = Number(args[0]);

        if (
            !Number.isInteger(amount) ||
            amount < 1 ||
            amount > 100
        ) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}clear 1-100\``
                )
            );
        }

        const deleted =
            await message.channel.bulkDelete(
                amount + 1,
                true
            ).catch(() => null);

        if (!deleted) {
            return reply(
                message,
                errorEmbed(
                    "❌ Impossible de supprimer les messages."
                )
            );
        }

        const confirmation =
            await message.channel.send({
                embeds: [
                    success(
                        `🧹 **${deleted.size - 1}** message(s) supprimé(s).`
                    )
                ]
            });

        setTimeout(() => {
            confirmation.delete().catch(() => {});
        }, 4000);
    }
});

// ============================================================
// LOCK
// ============================================================

command("lock", {
    level: 3,

    execute: async message => {
        if (!checkPermission(message, 3)) return;

        const everyone =
            message.guild.roles.everyone;

        await message.channel.permissionOverwrites.edit(
            everyone,
            {
                SendMessages: false
            }
        );

        return reply(
            message,
            success(
                `🔒 ${message.channel} a été verrouillé.`
            )
        );
    }
});

// ============================================================
// UNLOCK
// ============================================================

command("unlock", {
    level: 3,

    execute: async message => {
        if (!checkPermission(message, 3)) return;

        const everyone =
            message.guild.roles.everyone;

        await message.channel.permissionOverwrites.edit(
            everyone,
            {
                SendMessages: null
            }
        );

        return reply(
            message,
            success(
                `🔓 ${message.channel} a été déverrouillé.`
            )
        );
    }
});

// ============================================================
// SLOWMODE
// ============================================================

command("slowmode", {
    aliases: ["slow"],
    level: 3,

    execute: async (message, args) => {
        if (!checkPermission(message, 3)) return;

        const seconds = Number(args[0]);

        if (
            !Number.isInteger(seconds) ||
            seconds < 0 ||
            seconds > 21600
        ) {
            return reply(
                message,
                errorEmbed(
                    "Le slowmode doit être compris entre **0 et 21600 secondes**."
                )
            );
        }

        await message.channel.setRateLimitPerUser(
            seconds
        );

        return reply(
            message,
            success(
                seconds === 0
                    ? "🐌 Slowmode désactivé."
                    : `🐌 Slowmode réglé sur **${seconds}s**.`
            )
        );
    }
});

// ============================================================
// STATISTIQUES
// ============================================================

function getUserStats(guildId, userId) {
    ensureGuild(guildId);

    const messages =
        db.messages[guildId][userId] || 0;

    const votes =
        db.votes[guildId][userId] || 0;

    const voice =
        db.voice[guildId][userId] || 0;

    let duoCount = 0;

    const duos =
        db.duo[guildId] || {};

    for (const duo of Object.values(duos)) {
        if (
            duo.users &&
            duo.users.includes(userId)
        ) {
            duoCount += Number(duo.count || 0);
        }
    }

    return {
        messages,
        votes,
        voice,
        duo: duoCount
    };
}

command("stat", {
    aliases: ["stats"],

    execute: async (message, args) => {
        const member =
            args[0]
                ? await getMember(message, args[0])
                : message.member;

        if (!member) {
            return reply(
                message,
                errorEmbed(
                    "❌ Membre introuvable."
                )
            );
        }

        const stats =
            getUserStats(
                message.guild.id,
                member.id
            );

        const rank =
            getPermission(member);

        const rankText =
            rank === 999
                ? "👑 Crown"
                : rank > 0
                    ? `Perm ${rank}`
                    : "Membre";

        const statEmbed =
            new EmbedBuilder()
                .setAuthor({
                    name:
                        `Statistiques de ${member.user.tag}`,
                    iconURL:
                        member.displayAvatarURL({
                            extension: "png",
                            size: 128
                        })
                })
                .setThumbnail(
                    message.guild.iconURL({
                        extension: "png",
                        size: 256
                    })
                )
                .setColor(0x5865f2)
                .addFields(
                    {
                        name: "💬 Messages",
                        value:
                            `**${formatNumber(stats.messages)}**`,
                        inline: true
                    },
                    {
                        name: "❤️ Votes",
                        value:
                            `**${formatNumber(stats.votes)}**`,
                        inline: true
                    },
                    {
                        name: "👥 Duo",
                        value:
                            `**${formatNumber(stats.duo)}**`,
                        inline: true
                    },
                    {
                        name: "🎙️ Vocal",
                        value:
                            `**${formatDuration(stats.voice)}**`,
                        inline: true
                    },
                    {
                        name: "🛡️ Permission",
                        value: rankText,
                        inline: true
                    }
                )
                .setFooter({
                    text:
                        `Hirosaki • ${message.guild.name}`
                })
                .setTimestamp();

        return message.reply({
            embeds: [statEmbed]
        });
    }
});

// ============================================================
// LEADERBOARD — UN SEUL EMBED
// ============================================================

function getTopUsers(guild, type, limit = 10) {
    ensureGuild(guild.id);

    let source = {};

    if (type === "messages") {
        source = db.messages[guild.id];
    }

    if (type === "votes") {
        source = db.votes[guild.id];
    }

    const entries =
        Object.entries(source || {})
            .map(([userId, value]) => ({
                userId,
                value: Number(value || 0)
            }))
            .filter(entry => entry.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, limit);

    return entries;
}

function getTopDuos(guild, limit = 10) {
    ensureGuild(guild.id);

    return Object.entries(
        db.duo[guild.id] || {}
    )
        .map(([key, duo]) => ({
            key,
            users: duo.users || [],
            count: Number(duo.count || 0)
        }))
        .filter(duo => duo.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

function formatLeaderboardUsers(
    guild,
    entries
) {
    if (!entries.length) {
        return "Aucune donnée.";
    }

    return entries
        .map((entry, index) => {
            const member =
                guild.members.cache.get(
                    entry.userId
                );

            const name =
                member
                    ? member.user.tag
                    : `<@${entry.userId}>`;

            const medal =
                index === 0
                    ? "🥇"
                    : index === 1
                        ? "🥈"
                        : index === 2
                            ? "🥉"
                            : `**${index + 1}.**`;

            return `${medal} ${name} — **${formatNumber(entry.value)}**`;
        })
        .join("\n");
}

function formatLeaderboardDuos(
    guild,
    entries
) {
    if (!entries.length) {
        return "Aucune donnée.";
    }

    return entries
        .map((entry, index) => {
            const names =
                entry.users
                    .map(id => {
                        const member =
                            guild.members.cache.get(id);

                        return member
                            ? member.user.tag
                            : `<@${id}>`;
                    })
                    .join(" × ");

            const medal =
                index === 0
                    ? "🥇"
                    : index === 1
                        ? "🥈"
                        : index === 2
                            ? "🥉"
                            : `**${index + 1}.**`;

            return `${medal} ${names || "Duo inconnu"} — **${formatNumber(entry.count)}**`;
        })
        .join("\n");
}

command("leaderboard", {
    aliases: ["lb", "top"],

    execute: async message => {
        const guild =
            message.guild;

        const topMessages =
            getTopUsers(
                guild,
                "messages"
            );

        const topVotes =
            getTopUsers(
                guild,
                "votes"
            );

        const topDuos =
            getTopDuos(guild);

        // IMPORTANT :
        // Les trois classements sont dans
        // UN SEUL EMBED.

        const leaderboardEmbed =
            new EmbedBuilder()
                .setTitle(
                    "🏆 Leaderboard Hirosaki"
                )
                .setThumbnail(
                    guild.iconURL({
                        extension: "png",
                        size: 256
                    })
                )
                .setColor(0xf1c40f)
                .addFields(
                    {
                        name: "💬 Top messages",
                        value:
                            formatLeaderboardUsers(
                                guild,
                                topMessages
                            ),
                        inline: false
                    },
                    {
                        name: "❤️ Top votes",
                        value:
                            formatLeaderboardUsers(
                                guild,
                                topVotes
                            ),
                        inline: false
                    },
                    {
                        name: "👥 Top duo",
                        value:
                            formatLeaderboardDuos(
                                guild,
                                topDuos
                            ),
                        inline: false
                    }
                )
                .setFooter({
                    text:
                        `${guild.name} • Hirosaki`
                })
                .setTimestamp();

        return message.reply({
            embeds: [leaderboardEmbed]
        });
    }
});

// ============================================================
// TICKETS — CONFIGURATION
// ============================================================

function isTicketChannel(channel) {
    if (!channel) return false;

    return (
        channel.name.startsWith("ticket-") ||
        channel.topic?.includes("HIROSAKI_TICKET")
    );
}

function getTicketOwner(channel) {
    if (!channel?.topic) return null;

    const match =
        channel.topic.match(
            /HIROSAKI_TICKET:(\d+)/
        );

    return match
        ? match[1]
        : null;
}

function ticketButtons() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("ticket_create")
                .setLabel("Créer un ticket")
                .setEmoji("🎫")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setCustomId("ticket_close")
                .setLabel("Fermer")
                .setEmoji("🔒")
                .setStyle(ButtonStyle.Danger)
        );
}

// ============================================================
// +TICKETPANEL
// ============================================================

command("ticketpanel", {
    level: 4,

    execute: async message => {
        if (!checkPermission(message, 4)) {
            return;
        }

        const config =
            ensureGuild(
                message.guild.id
            );

        const category =
            message.guild.channels.cache.find(
                channel =>
                    channel.type ===
                        ChannelType.GuildCategory &&
                    channel.name.toLowerCase() ===
                        "tickets"
            );

        config.ticket.enabled = true;
        config.ticket.categoryId =
            category?.id || null;
        config.ticket.panelChannelId =
            message.channel.id;

        saveDatabase();

        const ticketEmbed =
            new EmbedBuilder()
                .setTitle("🎫 Support Hirosaki")
                .setDescription(
                    "Besoin d'aide ?\n\n" +
                    "Clique sur **Créer un ticket** pour ouvrir un salon privé avec le staff.\n\n" +
                    "🔒 Un seul ticket peut être ouvert par membre."
                )
                .setColor(0x5865f2)
                .setThumbnail(
                    message.guild.iconURL({
                        extension: "png"
                    })
                )
                .setFooter({
                    text:
                        "Hirosaki • Support"
                });

        await message.channel.send({
            embeds: [ticketEmbed],
            components: [ticketButtons()]
        });

        return reply(
            message,
            success(
                "✅ Le panneau de tickets a été créé."
            )
        );
    }
});

// ============================================================
// CRÉATION D'UN TICKET
// ============================================================

async function createTicket(guild, member) {
    ensureGuild(guild.id);

    const existing =
        guild.channels.cache.find(
            channel =>
                isTicketChannel(channel) &&
                getTicketOwner(channel) ===
                    member.id
        );

    if (existing) {
        return {
            error: true,
            channel: existing
        };
    }

    const config =
        db.guilds[guild.id];

    let category =
        config.ticket.categoryId
            ? guild.channels.cache.get(
                config.ticket.categoryId
            )
            : null;

    if (
        !category ||
        category.type !==
            ChannelType.GuildCategory
    ) {
        category =
            guild.channels.cache.find(
                channel =>
                    channel.type ===
                        ChannelType.GuildCategory &&
                    channel.name.toLowerCase() ===
                        "tickets"
            );
    }

    if (!category) {
        category =
            await guild.channels.create({
                name: "Tickets",
                type: ChannelType.GuildCategory
            });

        config.ticket.categoryId =
            category.id;
    }

    const role =
        guild.roles.cache.find(
            r =>
                r.name === "Gestion ticket"
        );

    const permissionOverwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [
                PermissionsBitField.Flags.ViewChannel
            ]
        },
        {
            id: member.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
            ]
        }
    ];

    if (role) {
        permissionOverwrites.push({
            id: role.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels
            ]
        });
    }

    if (guild.members.me) {
        permissionOverwrites.push({
            id: guild.members.me.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageChannels
            ]
        });
    }

    const channel =
        await guild.channels.create({
            name:
                `ticket-${member.user.username}`
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "")
                    .slice(0, 80),

            type: ChannelType.GuildText,

            parent: category.id,

            topic:
                `HIROSAKI_TICKET:${member.id}`,

            permissionOverwrites
        });

    db.tickets[guild.id][channel.id] = {
        ownerId: member.id,
        createdAt: Date.now(),
        closed: false
    };

    saveDatabase();

    return {
        error: false,
        channel
    };
}

// ============================================================
// FERMETURE D'UN TICKET
// ============================================================

async function closeTicket(channel, closedBy) {
    if (!isTicketChannel(channel)) {
        return false;
    }

    const ownerId =
        getTicketOwner(channel);

    if (
        db.tickets[channel.guild.id] &&
        db.tickets[channel.guild.id][channel.id]
    ) {
        db.tickets[
            channel.guild.id
        ][channel.id].closed = true;

        db.tickets[
            channel.guild.id
        ][channel.id].closedAt =
            Date.now();

        db.tickets[
            channel.guild.id
        ][channel.id].closedBy =
            closedBy.id;
    }

    saveDatabase();

    await channel.send({
        embeds: [
            embed(
                "🔒 Ticket fermé",
                `Ticket fermé par ${closedBy}.\n\n` +
                "Le salon sera supprimé dans **5 secondes**.",
                0xed4245
            )
        ]
    }).catch(() => {});

    setTimeout(() => {
        channel.delete(
            `Ticket fermé par ${closedBy.tag}`
        ).catch(() => {});
    }, 5000);

    return true;
}
// ============================================================
// BOUTONS
// ============================================================

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    if (
        interaction.customId ===
        "ticket_create"
    ) {
        if (!interaction.guild) return;

        const result =
            await createTicket(
                interaction.guild,
                interaction.member
            );

        if (result.error) {
            return interaction.reply({
                content:
                    `❌ Tu as déjà un ticket ouvert : ${result.channel}`,
                ephemeral: true
            });
        }

        await interaction.reply({
            content:
                `🎫 Ton ticket a été créé : ${result.channel}`,
            ephemeral: true
        });

        await result.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎫 Nouveau ticket")
                    .setDescription(
                        `Bienvenue ${interaction.member} !\n\n` +
                        "Explique ton problème avec le plus de détails possible.\n" +
                        "Un membre du staff viendra t'aider."
                    )
                    .setColor(0x5865f2)
                    .setThumbnail(
                        interaction.guild.iconURL({
                            extension: "png"
                        })
                    )
                    .setFooter({
                        text:
                            "Hirosaki • Support"
                    })
                    .setTimestamp()
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                "ticket_close"
                            )
                            .setLabel("Fermer le ticket")
                            .setEmoji("🔒")
                            .setStyle(
                                ButtonStyle.Danger
                            )
                    )
            ]
        });

        return;
    }

    if (
        interaction.customId ===
        "ticket_close"
    ) {
        if (!interaction.guild) return;

        const channel =
            interaction.channel;

        if (!isTicketChannel(channel)) {
            return interaction.reply({
                content:
                    "❌ Ce salon n'est pas un ticket.",
                ephemeral: true
            });
        }

        const ownerId =
            getTicketOwner(channel);

        const allowed =
            interaction.user.id === ownerId ||
            hasTicketPermission(
                interaction.member
            );

        if (!allowed) {
            return interaction.reply({
                content:
                    "❌ Tu n'as pas la permission de fermer ce ticket.",
                ephemeral: true
            });
        }

        await interaction.reply({
            embeds: [
                embed(
                    "🔒 Fermeture",
                    "Fermeture du ticket en cours...",
                    0xed4245
                )
            ]
        });

        await closeTicket(
            channel,
            interaction.user
        );
    }
});

// ============================================================
// +TICKET-CLOSE
// ============================================================

command("ticket-close", {
    execute: async message => {
        if (!isTicketChannel(message.channel)) {
            return reply(
                message,
                errorEmbed(
                    "❌ Cette commande doit être utilisée dans un ticket."
                )
            );
        }

        const ownerId =
            getTicketOwner(
                message.channel
            );

        const allowed =
            message.author.id === ownerId ||
            hasTicketPermission(
                message.member
            );

        if (!allowed) {
            return reply(
                message,
                errorEmbed(
                    "❌ Tu n'as pas la permission de fermer ce ticket."
                )
            );
        }

        await reply(
            message,
            embed(
                "🔒 Fermeture",
                "Le ticket va être fermé dans **5 secondes**.",
                0xed4245
            )
        );

        await closeTicket(
            message.channel,
            message.author
        );
    }
});

// ============================================================
// +TICKET-ADD
// ============================================================

command("ticket-add", {
    execute: async (message, args) => {
        if (
            !isTicketChannel(
                message.channel
            )
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Cette commande doit être utilisée dans un ticket."
                )
            );
        }

        if (
            !hasTicketPermission(
                message.member
            )
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Tu n'as pas la permission de gérer ce ticket."
                )
            );
        }

        const member =
            await getMember(
                message,
                args[0]
            );

        if (!member) {
            return reply(
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
                ReadMessageHistory: true
            }
        );

        return reply(
            message,
            success(
                `${member} a été ajouté au ticket.`
            )
        );
    }
});

// ============================================================
// +TICKET-REMOVE
// ============================================================

command("ticket-remove", {
    execute: async (message, args) => {
        if (
            !isTicketChannel(
                message.channel
            )
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Cette commande doit être utilisée dans un ticket."
                )
            );
        }

        if (
            !hasTicketPermission(
                message.member
            )
        ) {
            return reply(
                message,
                errorEmbed(
                    "❌ Tu n'as pas la permission de gérer ce ticket."
                )
            );
        }

        const member =
            await getMember(
                message,
                args[0]
            );

        if (!member) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}ticket-remove @membre\``
                )
            );
        }

        const ownerId =
            getTicketOwner(
                message.channel
            );

        if (member.id === ownerId) {
            return reply(
                message,
                errorEmbed(
                    "❌ Impossible de retirer le créateur du ticket."
                )
            );
        }

        await message.channel.permissionOverwrites.delete(
            member.id
        ).catch(() => {});

        return reply(
            message,
            success(
                `${member} a été retiré du ticket.`
            )
        );
    }
});

// ============================================================
// +WELCOME
// ============================================================

command("welcome", {
    level: 4,

    execute: async (message, args) => {
        if (!checkPermission(message, 4)) {
            return;
        }

        const config =
            ensureGuild(
                message.guild.id
            );

        if (
            args[0] === "on" ||
            args[0] === "off"
        ) {
            config.welcome.enabled =
                args[0] === "on";

            if (args[1]) {
                const channel =
                    getChannel(
                        message.guild,
                        args[1]
                    );

                if (channel) {
                    config.welcome.channelId =
                        channel.id;
                }
            }

            saveDatabase();

            return reply(
                message,
                success(
                    `Bienvenue automatique : **${config.welcome.enabled ? "activée" : "désactivée"}**.`
                )
            );
        }

        const channel =
            getChannel(
                message.guild,
                args[0]
            );

        if (!channel) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}welcome #salon on/off\``
                )
            );
        }

        config.welcome.channelId =
            channel.id;

        config.welcome.enabled = true;

        saveDatabase();

        return reply(
            message,
            success(
                `Les messages de bienvenue seront envoyés dans ${channel}.`
            )
        );
    }
});

// ============================================================
// +WELCOME-MESSAGE
// ============================================================

command("welcome-message", {
    level: 4,

    execute: async (message, args) => {
        if (!checkPermission(message, 4)) {
            return;
        }

        const text =
            args.join(" ");

        if (!text) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}welcome-message ton message\``
                )
            );
        }

        const config =
            ensureGuild(
                message.guild.id
            );

        config.welcome.message =
            text;

        saveDatabase();

        return reply(
            message,
            success(
                "✅ Message de bienvenue enregistré.\n\n" +
                "**Variables disponibles :**\n" +
                "`{user}` → membre\n" +
                "`{server}` → serveur"
            )
        );
    }
});

// ============================================================
// +AUTOROLE
// ============================================================

command("autorole", {
    level: 4,

    execute: async (message, args) => {
        if (!checkPermission(message, 4)) {
            return;
        }

        const config =
            ensureGuild(
                message.guild.id
            );

        if (
            args[0] === "off"
        ) {
            config.autorole.enabled =
                false;

            saveDatabase();

            return reply(
                message,
                success(
                    "✅ Autorole désactivé."
                )
            );
        }

        const role =
            getRole(
                message.guild,
                args[0]
            );

        if (!role) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}autorole @role\` ou \`${PREFIX}autorole off\``
                )
            );
        }

        config.autorole.roleId =
            role.id;

        config.autorole.enabled =
            true;

        saveDatabase();

        return reply(
            message,
            success(
                `✅ L'autorole est maintenant ${role}.`
            )
        );
    }
});

// ============================================================
// +LOGS
// ============================================================

command("logs", {
    level: 4,

    execute: async (message, args) => {
        if (!checkPermission(message, 4)) {
            return;
        }

        const config =
            ensureGuild(
                message.guild.id
            );

        if (
            args[0] === "off"
        ) {
            config.logs.enabled =
                false;

            saveDatabase();

            return reply(
                message,
                success(
                    "✅ Logs désactivés."
                )
            );
        }

        const channel =
            getChannel(
                message.guild,
                args[0]
            );

        if (!channel) {
            return reply(
                message,
                errorEmbed(
                    `Utilisation : \`${PREFIX}logs #salon\``
                )
            );
        }

        config.logs.enabled =
            true;

        config.logs.channelId =
            channel.id;

        saveDatabase();

        return reply(
            message,
            success(
                `✅ Les logs seront envoyés dans ${channel}.`
            )
        );
    }
});

// ============================================================
// +JOIN
// ============================================================

command("join", {
    level: 3,

    execute: async message => {
        if (!checkPermission(message, 3)) {
            return;
        }

        const channel =
            message.member.voice.channel;

        if (!channel) {
            return reply(
                message,
                errorEmbed(
                    "❌ Tu dois être dans un salon vocal."
                )
            );
        }

        try {
            joinVoiceChannel({
                channelId: channel.id,
                guildId: message.guild.id,
                adapterCreator:
                    message.guild.voiceAdapterCreator,
                selfDeaf: true
            });

            return reply(
                message,
                success(
                    `🎙️ Je viens de rejoindre ${channel}.`
                )
            );
        } catch (error) {
            console.error(error);

            return reply(
                message,
                errorEmbed(
                    "❌ Impossible de rejoindre le vocal."
                )
            );
        }
    }
});

// ============================================================
// +LEAVE
// ============================================================

command("leave", {
    level: 3,

    execute: async message => {
        if (!checkPermission(message, 3)) {
            return;
        }

        const connection =
            getVoiceConnection(
                message.guild.id
            );

        if (!connection) {
            return reply(
                message,
                information(
                    "Je ne suis actuellement dans aucun vocal."
                )
            );
        }

        connection.destroy();

        return reply(
            message,
            success(
                "👋 J'ai quitté le vocal."
            )
        );
    }
});

// ============================================================
// SUIVI DES MESSAGES
// ============================================================

client.on(
    "messageCreate",
    async message => {
        if (!message.guild) return;
        if (message.author.bot) return;

        ensureGuild(
            message.guild.id
        );

        // ----------------------------
        // COMPTEUR DE MESSAGES
        // ----------------------------

        if (
            !db.messages[
                message.guild.id
            ][message.author.id]
        ) {
            db.messages[
                message.guild.id
            ][message.author.id] = 0;
        }

        db.messages[
            message.guild.id
        ][message.author.id]++;

        saveDatabase();

        // ----------------------------
        // COMMANDES
        // ----------------------------

        if (
            !message.content.startsWith(
                PREFIX
            )
        ) {
            return;
        }

        const raw =
            message.content.slice(
                PREFIX.length
            ).trim();

        if (!raw) return;

        const args =
            raw.split(/\s+/);

        const commandName =
            args.shift()
                .toLowerCase();

        const cmd =
            commands.get(
                commandName
            );

        if (!cmd) {
            return;
        }

        if (
            cmd.crownOnly &&
            !isCrown(message.member)
        ) {
            return reply(
                message,
                errorEmbed(
                    "Cette commande est réservée à **Crown**."
                )
            );
        }

        if (
            cmd.level &&
            !hasPermission(
                message.member,
                cmd.level
            )
        ) {
            return reply(
                message,
                errorEmbed(
                    `Permission insuffisante.\n` +
                    `Permission requise : **Perm ${cmd.level}**.`
                )
            );
        }

        try {
            await cmd.execute(
                message,
                args
            );
        } catch (error) {
            console.error(
                `Erreur commande +${commandName}:`,
                error
            );

            await reply(
                message,
                errorEmbed(
                    "❌ Une erreur est survenue pendant l'exécution de la commande."
                )
            ).catch(() => {});
        }
    }
);

// ============================================================
// SUIVI VOCAL
// ============================================================

const voiceSessions = new Map();

client.on(
    "voiceStateUpdate",
    (oldState, newState) => {
        if (!newState.guild) return;

        const userId =
            newState.id;

        // Entrée dans un vocal
        if (
            !oldState.channelId &&
            newState.channelId
        ) {
            voiceSessions.set(
                `${newState.guild.id}:${userId}`,
                Date.now()
            );
        }

        // Sortie du vocal
        if (
            oldState.channelId &&
            !newState.channelId
        ) {
            const key =
                `${newState.guild.id}:${userId}`;

            const started =
                voiceSessions.get(key);

            if (started) {
                const duration =
                    Date.now() - started;

                ensureGuild(
                    newState.guild.id
                );

                db.voice[
                    newState.guild.id
                ][userId] =
                    (
                        db.voice[
                            newState.guild.id
                        ][userId] || 0
                    ) + duration;

                voiceSessions.delete(key);

                saveDatabase();
            }
        }

        // Changement de salon vocal :
        // on conserve la session.
        if (
            oldState.channelId &&
            newState.channelId &&
            oldState.channelId !==
                newState.channelId
        ) {
            const key =
                `${newState.guild.id}:${userId}`;

            if (
                !voiceSessions.has(key)
            ) {
                voiceSessions.set(
                    key,
                    Date.now()
                );
            }
        }
    }
);

// ============================================================
// MEMBRE REJOINT
// ============================================================

client.on(
    "guildMemberAdd",
    async member => {
        const config =
            ensureGuild(
                member.guild.id
            );

        // Autorole
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
                member.guild.members.me &&
                role.position <
                    member.guild.members.me.roles
                        .highest.position
            ) {
                await member.roles.add(
                    role,
                    "Hirosaki Autorole"
                ).catch(() => {});
            }
        }

        // Bienvenue
        if (
            config.welcome.enabled &&
            config.welcome.channelId
        ) {
            const channel =
                member.guild.channels.cache.get(
                    config.welcome.channelId
                );

            if (
                channel &&
                channel.isTextBased()
            ) {
                const text =
                    config.welcome.message
                        .replace(
                            /\{user\}/g,
                            `${member}`
                        )
                        .replace(
                            /\{server\}/g,
                            member.guild.name
                        );

                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "👋 Bienvenue !"
                            )
                            .setDescription(
                                text
                            )
                            .setThumbnail(
                                member.displayAvatarURL({
                                    extension: "png"
                                })
                            )
                            .setColor(
                                0x57f287
                            )
                            .setTimestamp()
                    ]
                }).catch(() => {});
            }
        }
    }
);

// ============================================================
// SNIPE — MESSAGE SUPPRIMÉ
// ============================================================

client.on(
    "messageDelete",
    message => {
        if (
            !message.guild ||
            message.author?.bot
        ) {
            return;
        }

        db.snipe[
            message.guild.id
        ] = {
            authorId:
                message.author.id,

            authorTag:
                message.author.tag,

            content:
                message.content ||
                "*Message sans contenu texte*",

            channelId:
                message.channel.id,

            timestamp:
                Date.now()
        };

        saveDatabase();
    }
);

command("snipe", {
    level: 1,

    execute: async message => {
        if (!checkPermission(message, 1)) {
            return;
        }

        const data =
            db.snipe[
                message.guild.id
            ];

        if (!data) {
            return reply(
                message,
                information(
                    "Aucun message supprimé disponible."
                )
            );
        }

        const snipeEmbed =
            new EmbedBuilder()
                .setTitle(
                    "🕵️ Dernier message supprimé"
                )
                .setDescription(
                    data.content
                )
                .addFields(
                    {
                        name: "Auteur",
                        value:
                            `<@${data.authorId}>`,
                        inline: true
                    },
                    {
                        name: "Salon",
                        value:
                            `<#${data.channelId}>`,
                        inline: true
                    }
                )
                .setColor(0x5865f2)
                .setFooter({
                    text:
                        `Supprimé <t:${Math.floor(data.timestamp / 1000)}:R>`
                });

        return reply(
            message,
            snipeEmbed
        );
    }
});

// ============================================================
// READY
// ============================================================

client.once(
    "ready",
    () => {
        console.log(
            `✅ ${client.user.tag} est connecté !`
        );

        console.log(
            `📌 Préfixe : ${PREFIX}`
        );

        console.log(
            `📌 Commandes chargées : ${commands.size}`
        );

        client.user.setPresence({
            activities: [
                {
                    name:
                        `${PREFIX}help`,
                    type: 0
                }
            ],
            status: "online"
        });
    }
);

// ============================================================
// ERREURS
// ============================================================

process.on(
    "unhandledRejection",
    error => {
        console.error(
            "❌ Unhandled rejection :",
            error
        );
    }
);

process.on(
    "uncaughtException",
    error => {
        console.error(
            "❌ Uncaught exception :",
            error
        );
    }
);

// ============================================================
// CONNEXION
// ============================================================

client.login(TOKEN);