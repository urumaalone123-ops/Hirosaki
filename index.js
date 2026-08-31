const {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");

// ============================================================
// CONFIGURATION
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;
const DB_FILE = "./bot-data.json";

const PREFIX = "+";

// ============================================================
// CLIENT DISCORD
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

// ============================================================
// BASE DE DONNÉES
// ============================================================

const defaultDB = {
    warnings: {},
    sanctions: {},
    snipe: {},
    config: {},
    giveaways: {},
    tickets: {}
};

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(defaultDB, null, 2)
    );
}

function loadDB() {
    try {
        const data = JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );

        return {
            ...defaultDB,
            ...data,
            warnings: data.warnings || {},
            sanctions: data.sanctions || {},
            snipe: data.snipe || {},
            config: data.config || {},
            giveaways: data.giveaways || {},
            tickets: data.tickets || {}
        };
    } catch {
        return JSON.parse(
            JSON.stringify(defaultDB)
        );
    }
}

function saveDB(data) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(data, null, 2)
    );
}

let db = loadDB();

// ============================================================
// CONFIGURATION SERVEUR
// ============================================================

function guildConfig(guildId) {

    if (!db.config[guildId]) {

        db.config[guildId] = {
            statChannelId: null,
            statHour: "23:00",
            statLastRun: null,

            welcomeChannelId: null,
            welcomeMessage:
                "Bienvenue {user} sur **{server}** !",
            welcomeTitle:
                "Bienvenue !",
            welcomeColor:
                "#5865F2",
            welcomeImage: null,
            welcomeThumbnail: true,
            welcomeFooter: null,

            logsChannelId: null,

            autoRoleId: null,

            ticketCategoryId: null,
            ticketTitle:
                "🎫 Ticket",
            ticketDescription:
                "Explique ta demande ici. Un membre du staff viendra te répondre.",
            ticketImage: null
        };

        saveDB(db);
    }

    return db.config[guildId];
}

// ============================================================
// HIÉRARCHIE HIROSAKI
// ============================================================
//
// Perm 0 = Gestion ticket
// Perm 1 = Modérateur test
// Perm 2 = Modérateur
// Perm 3 = Staff confirmé
// Perm 4 = Responsable staff
// Perm 5 = Co-owner
//
// Crown = Owner
// Crown possède tous les accès.
//
// IMPORTANT :
// Les rôles sont recherchés par leur nom exact.
// ============================================================

const STAFF_ROLES = {
    1: "Perm 1",
    2: "Perm 2",
    3: "Perm 3",
    4: "Perm 4",
    5: "Perm 5"
};

const OWNER_ROLE = "Crown";
const TICKET_ROLE = "Gestion ticket";

// ============================================================
// OBTENIR LE NIVEAU STAFF
// ============================================================

function getStaffLevel(member) {

    if (!member) {
        return 0;
    }

    // Crown = accès total
    if (
        member.roles.cache.some(
            role =>
                role.name === OWNER_ROLE
        )
    ) {
        return 999;
    }

    let level = 0;

    for (let i = 1; i <= 5; i++) {

        const roleName =
            STAFF_ROLES[i];

        if (
            member.roles.cache.some(
                role =>
                    role.name === roleName
            )
        ) {
            level = Math.max(
                level,
                i
            );
        }
    }

    return level;
}

// ============================================================
// GESTION TICKETS
// ============================================================

function isTicketManager(member) {

    if (!member) {
        return false;
    }

    // Crown possède les permissions tickets
    if (
        member.roles.cache.some(
            role =>
                role.name === OWNER_ROLE
        )
    ) {
        return true;
    }

    // Gestion ticket = Perm 0
    return member.roles.cache.some(
        role =>
            role.name === TICKET_ROLE
    );
}

// ============================================================
// VÉRIFICATION PERMISSION HIÉRARCHIQUE
// ============================================================

async function requireLevel(
    message,
    minimumLevel
) {

    const level =
        getStaffLevel(
            message.member
        );

    if (level === 999) {
        return true;
    }

    if (level >= minimumLevel) {
        return true;
    }

    await message.reply(
        `❌ Cette commande nécessite **Perm ${minimumLevel}** ou supérieur.`
    ).catch(() => {});

    return false;
}

// ============================================================
// VÉRIFICATION CROWN
// ============================================================

async function requireCrown(message) {

    const isOwner =
        message.member?.roles.cache.some(
            role =>
                role.name === OWNER_ROLE
        );

    if (isOwner) {
        return true;
    }

    await message.reply(
        "❌ Cette commande est réservée au rôle **Crown**."
    ).catch(() => {});

    return false;
}

// ============================================================
// VÉRIFICATION TICKETS
// ============================================================

async function requireTicketPermission(message) {

    if (
        isTicketManager(
            message.member
        )
    ) {
        return true;
    }

    await message.reply(
        "❌ Tu n'as pas la permission de gestion des tickets."
    ).catch(() => {});

    return false;
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

    if (!db.sanctions[guildId]) {
        db.sanctions[guildId] = {};
    }

    if (
        !db.sanctions[guildId][userId]
    ) {
        db.sanctions[guildId][userId] = [];
    }

    db.sanctions[guildId][userId].push({

        type,
        moderatorId,
        reason,
        date: Date.now()

    });

    saveDB(db);
}

// ============================================================
// LOGS
// ============================================================

async function sendLog(
    guild,
    title,
    description
) {

    const config =
        guildConfig(
            guild.id
        );

    if (
        !config.logsChannelId
    ) {
        return;
    }

    const channel =
        guild.channels.cache.get(
            config.logsChannelId
        );

    if (!channel) {
        return;
    }

    const embed =
        new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor("#5865F2")
            .setTimestamp();

    await channel.send({
        embeds: [
            embed
        ]
    }).catch(() => {});
}

// ============================================================
// VARIABLES PERSONNALISÉES
// ============================================================
//
// Variables disponibles dans le système de bienvenue :
//
// {member}
// {member.id}
// {member.tag}
//
// {user}
// {user.id}
// {user.tag}
//
// {server}
// {server.id}
// {membercount}
//
// {avatar}
//
// {date}
// {time}
//
// ============================================================

function replaceVariables(
    text,
    member
) {

    if (!text) {
        return text;
    }

    const guild =
        member.guild;

    const user =
        member.user;

    const now =
        new Date();

    return text

        // ----------------------------------------------------
        // MEMBRE
        // ----------------------------------------------------

        .replaceAll(
            "{member}",
            `<@${member.id}>`
        )

        .replaceAll(
            "{member.id}",
            member.id
        )

        .replaceAll(
            "{member.tag}",
            user.tag
        )

        // ----------------------------------------------------
        // USER
        // ----------------------------------------------------

        .replaceAll(
            "{user}",
            `<@${user.id}>`
        )

        .replaceAll(
            "{user.id}",
            user.id
        )

        .replaceAll(
            "{user.tag}",
            user.tag
        )

        // ----------------------------------------------------
        // SERVEUR
        // ----------------------------------------------------

        .replaceAll(
            "{server}",
            guild.name
        )

        .replaceAll(
            "{server.id}",
            guild.id
        )

        .replaceAll(
            "{membercount}",
            String(
                guild.memberCount
            )
        )

        // ----------------------------------------------------
        // AVATAR
        // ----------------------------------------------------

        .replaceAll(
            "{avatar}",
            user.displayAvatarURL({
                dynamic: true,
                size: 512
            })
        )

        // ----------------------------------------------------
        // DATE
        // ----------------------------------------------------

        .replaceAll(
            "{date}",
            now.toLocaleDateString(
                "fr-FR"
            )
        )

        // ----------------------------------------------------
        // HEURE
        // ----------------------------------------------------

        .replaceAll(
            "{time}",
            now.toLocaleTimeString(
                "fr-FR",
                {
                    hour: "2-digit",
                    minute: "2-digit"
                }
            )
        );
}

// ============================================================
// EMBED DES STATISTIQUES
// ============================================================

function statisticsEmbed(guild) {

    const membres =
        guild.memberCount;

    const enLigne =
        guild.members.cache.filter(
            member =>
                member.presence &&
                member.presence.status !==
                    "offline"
        ).size;

    const enVocal =
        guild.members.cache.filter(
            member =>
                member.voice &&
                member.voice.channel
        ).size;

    const boosts =
        guild.premiumSubscriptionCount ||
        0;

    const enStream =
        guild.members.cache.filter(
            member =>
                member.voice &&
                member.voice.streaming
        ).size;

    const embed =
        new EmbedBuilder()

            .setTitle(
                "Hirosaki 🎆 Statistiques !"
            )

            .setDescription(
                `Membre : **${membres}**\n` +
                `En ligne : **${enLigne}**\n` +
                `En vocal : **${enVocal}**\n` +
                `Boost : **${boosts}**\n` +
                `En stream : **${enStream}**`
            )

            .setColor(
                "#5865F2"
            )

            .setTimestamp();

    const icon =
        guild.iconURL({
            dynamic: true,
            size: 512
        });

    if (icon) {
        embed.setThumbnail(
            icon
        );
    }

    return embed;
}

// ============================================================
// ENVOYER UN NOUVEAU MESSAGE STAT
// ============================================================
//
// IMPORTANT :
// On ne modifie JAMAIS l'ancien message.
//
// Chaque exécution crée un nouveau message.
// ============================================================

async function sendStatistics(
    guild
) {

    const config =
        guildConfig(
            guild.id
        );

    if (
        !config.statChannelId
    ) {
        return false;
    }

    const channel =
        guild.channels.cache.get(
            config.statChannelId
        );

    if (!channel) {
        return false;
    }

    await channel.send({
        embeds: [
            statisticsEmbed(
                guild
            )
        ]
    });

    return true;
}

// ============================================================
// TICKET : UTILITAIRES
// ============================================================

function isTicketChannel(
    channel
) {

    if (!channel) {
        return false;
    }

    return (
        channel.type ===
            ChannelType.GuildText &&
        typeof channel.topic ===
            "string" &&
        channel.topic.startsWith(
            "ticket:"
        )
    );
}

function getTicketOwnerId(
    channel
) {

    if (
        !isTicketChannel(
            channel
        )
    ) {
        return null;
    }

    return channel.topic
        .replace(
            "ticket:",
            ""
        )
        .split(":")[0];
}

// ============================================================
// FIN PARTIE 1/8
// ============================================================
// ============================================================
// PARTIE 2/8 — COMMANDES DE MODÉRATION
// ============================================================

// ============================================================
// CRÉER UN WARN
// Perm 1+
// ============================================================

async function commandWarn(message, args) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à avertir."
        );
    }

    if (member.id === message.author.id) {
        return message.reply(
            "❌ Tu ne peux pas t'avertir toi-même."
        );
    }

    const reason =
        args.slice(2).join(" ") ||
        "Aucune raison indiquée.";

    addSanction(
        message.guild.id,
        member.id,
        "warn",
        message.author.id,
        reason
    );

    await message.reply(
        `⚠️ ${member} a reçu un avertissement.\n` +
        `**Raison :** ${reason}`
    );

    await sendLog(
        message.guild,
        "Avertissement",
        `**Membre :** ${member}\n` +
        `**Modérateur :** ${message.author}\n` +
        `**Raison :** ${reason}`
    );
}

// ============================================================
// LISTE DES WARNS
// Perm 1+
// ============================================================

async function commandWarnings(message, args) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    const guildSanctions =
        db.sanctions[
            message.guild.id
        ] || {};

    const sanctions =
        guildSanctions[
            member.id
        ] || [];

    const warns =
        sanctions.filter(
            sanction =>
                sanction.type === "warn"
        );

    if (!warns.length) {
        return message.reply(
            `✅ ${member} n'a aucun avertissement.`
        );
    }

    const description =
        warns
            .map(
                (warn, index) =>
                    `**${index + 1}.** ${warn.reason}\n` +
                    `<@${warn.moderatorId}> • ` +
                    `<t:${Math.floor(
                        warn.date / 1000
                    )}:R>`
            )
            .join("\n\n");

    const embed =
        new EmbedBuilder()
            .setTitle(
                `Avertissements de ${member.user.tag}`
            )
            .setDescription(
                description
            )
            .setColor(
                "#FEE75C"
            );

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// RETIRER UN WARN
// Perm 2+
// ============================================================

async function commandUnwarn(message, args) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    const guildSanctions =
        db.sanctions[
            message.guild.id
        ];

    if (
        !guildSanctions ||
        !guildSanctions[member.id]
    ) {
        return message.reply(
            "❌ Ce membre n'a aucun avertissement."
        );
    }

    const index =
        guildSanctions[
            member.id
        ].findIndex(
            sanction =>
                sanction.type === "warn"
        );

    if (index === -1) {
        return message.reply(
            "❌ Ce membre n'a aucun avertissement."
        );
    }

    guildSanctions[
        member.id
    ].splice(
        index,
        1
    );

    saveDB(db);

    await message.reply(
        `✅ Un avertissement de ${member} a été retiré.`
    );
}

// ============================================================
// KICK
// Perm 2+
// ============================================================

async function commandKick(message, args) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à expulser."
        );
    }

    if (
        member.id ===
        message.author.id
    ) {
        return message.reply(
            "❌ Tu ne peux pas t'expulser toi-même."
        );
    }

    if (
        member.roles.highest.position >=
        message.member.roles.highest.position &&
        !message.member.roles.cache.some(
            role =>
                role.name === OWNER_ROLE
        )
    ) {
        return message.reply(
            "❌ Tu ne peux pas sanctionner un membre ayant un rôle supérieur ou égal au tien."
        );
    }

    const reason =
        args.slice(2).join(" ") ||
        "Aucune raison indiquée.";

    await member.kick(
        reason
    ).catch(
        () => null
    );

    addSanction(
        message.guild.id,
        member.id,
        "kick",
        message.author.id,
        reason
    );

    await message.reply(
        `👢 ${member.user.tag} a été expulsé.\n` +
        `**Raison :** ${reason}`
    );

    await sendLog(
        message.guild,
        "Membre expulsé",
        `**Membre :** ${member.user.tag}\n` +
        `**Modérateur :** ${message.author}\n` +
        `**Raison :** ${reason}`
    );
}

// ============================================================
// BAN
// Perm 3+
// ============================================================

async function commandBan(message, args) {

    if (!(await requireLevel(message, 3))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à bannir."
        );
    }

    if (
        member.id ===
        message.author.id
    ) {
        return message.reply(
            "❌ Tu ne peux pas te bannir toi-même."
        );
    }

    if (
        member.roles.highest.position >=
        message.member.roles.highest.position &&
        !message.member.roles.cache.some(
            role =>
                role.name === OWNER_ROLE
        )
    ) {
        return message.reply(
            "❌ Tu ne peux pas bannir un membre ayant un rôle supérieur ou égal au tien."
        );
    }

    const reason =
        args.slice(2).join(" ") ||
        "Aucune raison indiquée.";

    const success =
        await member.ban({
            reason
        }).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Je n'ai pas réussi à bannir ce membre."
        );
    }

    addSanction(
        message.guild.id,
        member.id,
        "ban",
        message.author.id,
        reason
    );

    await message.reply(
        `🔨 ${member.user.tag} a été banni.\n` +
        `**Raison :** ${reason}`
    );

    await sendLog(
        message.guild,
        "Membre banni",
        `**Membre :** ${member.user.tag}\n` +
        `**Modérateur :** ${message.author}\n` +
        `**Raison :** ${reason}`
    );
}

// ============================================================
// UNBAN
// Perm 4+
// ============================================================

async function commandUnban(message, args) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const userId =
        args[1];

    if (!userId) {
        return message.reply(
            "❌ Indique l'ID du membre à débannir."
        );
    }

    const success =
        await message.guild.bans.remove(
            userId
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de débannir cet utilisateur."
        );
    }

    await message.reply(
        `✅ <@${userId}> a été débanni.`
    );

    await sendLog(
        message.guild,
        "Membre débanni",
        `**Utilisateur :** <@${userId}>\n` +
        `**Responsable :** ${message.author}`
    );
}

// ============================================================
// MUTE
// Perm 2+
// ============================================================

async function commandMute(message, args) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    const duration =
        parseInt(args[2]);

    if (
        !duration ||
        duration < 1
    ) {
        return message.reply(
            "❌ Indique une durée en minutes.\n" +
            "Exemple : `+mute @membre 10 raison`"
        );
    }

    const reason =
        args.slice(3).join(" ") ||
        "Aucune raison indiquée.";

    const until =
        Date.now() +
        duration * 60 * 1000;

    const success =
        await member.timeout(
            duration * 60 * 1000,
            reason
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de mute ce membre."
        );
    }

    addSanction(
        message.guild.id,
        member.id,
        "mute",
        message.author.id,
        reason
    );

    await message.reply(
        `🔇 ${member} a été mute pendant **${duration} minute(s)**.\n` +
        `**Raison :** ${reason}`
    );

    await sendLog(
        message.guild,
        "Membre mute",
        `**Membre :** ${member}\n` +
        `**Durée :** ${duration} minute(s)\n` +
        `**Modérateur :** ${message.author}\n` +
        `**Raison :** ${reason}`
    );
}

// ============================================================
// UNMUTE
// Perm 2+
// ============================================================

async function commandUnmute(message) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    const success =
        await member.timeout(
            null
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de retirer le mute."
        );
    }

    await message.reply(
        `🔊 Le mute de ${member} a été retiré.`
    );

    await sendLog(
        message.guild,
        "Mute retiré",
        `**Membre :** ${member}\n` +
        `**Modérateur :** ${message.author}`
    );
}

// ============================================================
// TIMEOUT
// Perm 2+
// ============================================================

async function commandTimeout(message, args) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    const duration =
        parseInt(args[2]);

    if (
        !duration ||
        duration < 1
    ) {
        return message.reply(
            "❌ Indique une durée en minutes."
        );
    }

    const reason =
        args.slice(3).join(" ") ||
        "Aucune raison indiquée.";

    const success =
        await member.timeout(
            duration * 60 * 1000,
            reason
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible d'appliquer le timeout."
        );
    }

    addSanction(
        message.guild.id,
        member.id,
        "timeout",
        message.author.id,
        reason
    );

    await message.reply(
        `⏱️ ${member} a reçu un timeout de **${duration} minute(s)**.`
    );
}

// ============================================================
// UNTIMEOUT
// Perm 2+
// ============================================================

async function commandUntimeout(message) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    const success =
        await member.timeout(
            null
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de retirer le timeout."
        );
    }

    await message.reply(
        `✅ Le timeout de ${member} a été retiré.`
    );
}

// ============================================================
// CLEAR
// Perm 2+
// ============================================================

async function commandClear(message, args) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const amount =
        parseInt(args[1]);

    if (
        !amount ||
        amount < 1 ||
        amount > 100
    ) {
        return message.reply(
            "❌ Indique un nombre entre **1 et 100**."
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
        return message.reply(
            "❌ Impossible de supprimer les messages."
        );
    }

    const confirmation =
        await message.channel.send(
            `🧹 **${deleted.size}** message(s) supprimé(s).`
        );

    setTimeout(
        () => {
            confirmation.delete().catch(
                () => {}
            );
        },
        3000
    );
}

// ============================================================
// PURGE
// Perm 3+
// ============================================================

async function commandPurge(message, args) {

    if (!(await requireLevel(message, 3))) {
        return;
    }

    const amount =
        parseInt(args[1]);

    if (
        !amount ||
        amount < 1 ||
        amount > 100
    ) {
        return message.reply(
            "❌ Indique un nombre entre **1 et 100**."
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
        return message.reply(
            "❌ Impossible de supprimer les messages."
        );
    }

    await message.channel.send(
        `🧹 **${deleted.size}** message(s) supprimé(s).`
    ).then(
        msg => {
            setTimeout(
                () => {
                    msg.delete().catch(
                        () => {}
                    );
                },
                3000
            );
        }
    );
}

// ============================================================
// LOCK
// Perm 3+
// ============================================================

async function commandLock(message) {

    if (!(await requireLevel(message, 3))) {
        return;
    }

    await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
            SendMessages: false
        }
    ).catch(
        () => {}
    );

    await message.reply(
        "🔒 Ce salon est maintenant verrouillé."
    );
}

// ============================================================
// UNLOCK
// Perm 3+
// ============================================================

async function commandUnlock(message) {

    if (!(await requireLevel(message, 3))) {
        return;
    }

    await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
            SendMessages: null
        }
    ).catch(
        () => {}
    );

    await message.reply(
        "🔓 Ce salon est maintenant déverrouillé."
    );
}

// ============================================================
// SLOWMODE
// Perm 3+
// ============================================================

async function commandSlowmode(message, args) {

    if (!(await requireLevel(message, 3))) {
        return;
    }

    const seconds =
        parseInt(args[1]);

    if (
        isNaN(seconds) ||
        seconds < 0 ||
        seconds > 21600
    ) {
        return message.reply(
            "❌ Indique une durée entre **0 et 21600 secondes**."
        );
    }

    await message.channel.setRateLimitPerUser(
        seconds
    ).catch(
        () => {}
    );

    await message.reply(
        seconds === 0
            ? "✅ Le slowmode a été désactivé."
            : `🐌 Slowmode réglé sur **${seconds} seconde(s)**.`
    );
}

// ============================================================
// FIN PARTIE 2/8
// ============================================================
// ============================================================
// PARTIE 3/8 — RÔLES / INFOS / SNIPE
// ============================================================

// ============================================================
// NICKNAME
// Perm 2+
// ============================================================

async function commandNickname(message, args) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    const newNickname =
        args.slice(2).join(" ");

    if (!newNickname) {
        return message.reply(
            "❌ Indique le nouveau pseudo."
        );
    }

    const success =
        await member.setNickname(
            newNickname
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de modifier le pseudo de ce membre."
        );
    }

    await message.reply(
        `✅ Le pseudo de ${member} est maintenant **${newNickname}**.`
    );

    await sendLog(
        message.guild,
        "Pseudo modifié",
        `**Membre :** ${member}\n` +
        `**Nouveau pseudo :** ${newNickname}\n` +
        `**Modérateur :** ${message.author}`
    );
}

// ============================================================
// ROLE ADD
// Perm 3+
// ============================================================

async function commandRoleAdd(message, args) {

    if (!(await requireLevel(message, 3))) {
        return;
    }

    const member =
        message.mentions.members.first();

    const role =
        message.mentions.roles.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    if (!role) {
        return message.reply(
            "❌ Mentionne le rôle."
        );
    }

    if (
        role.managed ||
        role.position >=
            message.guild.members.me.roles.highest.position
    ) {
        return message.reply(
            "❌ Je ne peux pas attribuer ce rôle."
        );
    }

    if (
        role.position >=
            message.member.roles.highest.position &&
        !message.member.roles.cache.some(
            r =>
                r.name === OWNER_ROLE
        )
    ) {
        return message.reply(
            "❌ Tu ne peux pas gérer un rôle supérieur ou égal au tien."
        );
    }

    const success =
        await member.roles.add(
            role
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible d'ajouter ce rôle."
        );
    }

    await message.reply(
        `✅ ${role} a été ajouté à ${member}.`
    );
}

// ============================================================
// ROLE REMOVE
// Perm 3+
// ============================================================

async function commandRoleRemove(message, args) {

    if (!(await requireLevel(message, 3))) {
        return;
    }

    const member =
        message.mentions.members.first();

    const role =
        message.mentions.roles.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    if (!role) {
        return message.reply(
            "❌ Mentionne le rôle."
        );
    }

    if (
        role.managed ||
        role.position >=
            message.guild.members.me.roles.highest.position
    ) {
        return message.reply(
            "❌ Je ne peux pas retirer ce rôle."
        );
    }

    const success =
        await member.roles.remove(
            role
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de retirer ce rôle."
        );
    }

    await message.reply(
        `✅ ${role} a été retiré de ${member}.`
    );
}

// ============================================================
// ROLE
// +role @membre @role
// Perm 3+
// ============================================================

async function commandRole(message, args) {

    if (!(await requireLevel(message, 3))) {
        return;
    }

    const member =
        message.mentions.members.first();

    const role =
        message.mentions.roles.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    if (!role) {
        return message.reply(
            "❌ Mentionne le rôle."
        );
    }

    if (
        member.roles.cache.has(
            role.id
        )
    ) {

        return commandRoleRemove(
            message,
            args
        );
    }

    return commandRoleAdd(
        message,
        args
    );
}

// ============================================================
// RANK
// Perm 4+
// ============================================================

async function commandRank(message, args) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const member =
        message.mentions.members.first();

    const role =
        message.mentions.roles.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    if (!role) {
        return message.reply(
            "❌ Mentionne le rôle."
        );
    }

    if (
        role.position >=
            message.member.roles.highest.position &&
        !message.member.roles.cache.some(
            r =>
                r.name === OWNER_ROLE
        )
    ) {
        return message.reply(
            "❌ Tu ne peux pas donner un rôle supérieur ou égal au tien."
        );
    }

    const success =
        await member.roles.add(
            role
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de donner ce rôle."
        );
    }

    await message.reply(
        `⬆️ ${role} a été donné à ${member}.`
    );
}

// ============================================================
// DERANK
// Perm 4+
// ============================================================

async function commandDerank(message, args) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const member =
        message.mentions.members.first();

    const role =
        message.mentions.roles.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    if (!role) {
        return message.reply(
            "❌ Mentionne le rôle."
        );
    }

    const success =
        await member.roles.remove(
            role
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de retirer ce rôle."
        );
    }

    await message.reply(
        `⬇️ ${role} a été retiré de ${member}.`
    );
}

// ============================================================
// SNIPE
// Perm 1+
// ============================================================

async function commandSnipe(message) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const data =
        db.snipe[
            message.channel.id
        ];

    if (!data) {
        return message.reply(
            "❌ Aucun message supprimé récemment dans ce salon."
        );
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                "Message supprimé"
            )
            .setDescription(
                data.content ||
                "*Message sans texte*"
            )
            .addFields(
                {
                    name: "Auteur",
                    value:
                        `<@${data.authorId}>`
                },
                {
                    name: "Date",
                    value:
                        `<t:${Math.floor(
                            data.date / 1000
                        )}:R>`
                }
            )
            .setColor(
                "#5865F2"
            );

    if (data.avatar) {
        embed.setThumbnail(
            data.avatar
        );
    }

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// USERINFO
// Perm 1+
// ============================================================

async function commandUserinfo(message) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const member =
        message.mentions.members.first() ||
        message.member;

    const user =
        member.user;

    const roles =
        member.roles.cache
            .filter(
                role =>
                    role.id !==
                    message.guild.id
            )
            .map(
                role =>
                    `${role}`
            )
            .join(", ") ||
        "Aucun";

    const embed =
        new EmbedBuilder()
            .setTitle(
                `Informations — ${user.tag}`
            )
            .setThumbnail(
                user.displayAvatarURL({
                    dynamic: true,
                    size: 512
                })
            )
            .addFields(
                {
                    name: "Utilisateur",
                    value:
                        `${member}`
                },
                {
                    name: "ID",
                    value:
                        user.id
                },
                {
                    name: "Compte créé",
                    value:
                        `<t:${Math.floor(
                            user.createdTimestamp /
                            1000
                        )}:F>`
                },
                {
                    name: "Arrivée",
                    value:
                        member.joinedTimestamp
                            ? `<t:${Math.floor(
                                member.joinedTimestamp /
                                1000
                            )}:F>`
                            : "Inconnue"
                },
                {
                    name: "Rôles",
                    value:
                        roles
                }
            )
            .setColor(
                "#5865F2"
            );

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// SERVERINFO
// Perm 1+
// ============================================================

async function commandServerinfo(message) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const guild =
        message.guild;

    const embed =
        new EmbedBuilder()
            .setTitle(
                `Informations — ${guild.name}`
            )
            .setThumbnail(
                guild.iconURL({
                    dynamic: true,
                    size: 512
                })
            )
            .addFields(
                {
                    name: "Membres",
                    value:
                        String(
                            guild.memberCount
                        ),
                    inline: true
                },
                {
                    name: "Salons",
                    value:
                        String(
                            guild.channels.cache.size
                        ),
                    inline: true
                },
                {
                    name: "Rôles",
                    value:
                        String(
                            guild.roles.cache.size
                        ),
                    inline: true
                },
                {
                    name: "Boosts",
                    value:
                        String(
                            guild.premiumSubscriptionCount ||
                            0
                        ),
                    inline: true
                },
                {
                    name: "Propriétaire",
                    value:
                        `<@${guild.ownerId}>`,
                    inline: true
                },
                {
                    name: "ID",
                    value:
                        guild.id,
                    inline: true
                }
            )
            .setColor(
                "#5865F2"
            );

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// FIN PARTIE 3/8
// ============================================================
// ============================================================
// PARTIE 4/8 — MODÉRATION
// ============================================================

// ============================================================
// KICK
// Perm 1+
// ============================================================

async function commandKick(message, args) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à expulser."
        );
    }

    if (member.id === message.author.id) {
        return message.reply(
            "❌ Tu ne peux pas t'expulser toi-même."
        );
    }

    if (
        member.roles.highest.position >=
        message.member.roles.highest.position &&
        !message.member.roles.cache.some(
            role => role.name === OWNER_ROLE
        )
    ) {
        return message.reply(
            "❌ Tu ne peux pas sanctionner ce membre."
        );
    }

    const reason =
        args.slice(1).join(" ") ||
        "Aucune raison fournie";

    const success =
        await member.kick(
            reason
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible d'expulser ce membre."
        );
    }

    addSanction(
        message.guild.id,
        member.id,
        "kick",
        message.author.id,
        reason
    );

    await message.reply(
        `👢 **${member.user.tag}** a été expulsé.\n**Raison :** ${reason}`
    );

    await sendLog(
        message.guild,
        "Membre expulsé",
        `**Membre :** ${member.user.tag}\n` +
        `**Modérateur :** ${message.author}\n` +
        `**Raison :** ${reason}`
    );
}

// ============================================================
// BAN
// Perm 2+
// ============================================================

async function commandBan(message, args) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à bannir."
        );
    }

    if (member.id === message.author.id) {
        return message.reply(
            "❌ Tu ne peux pas te bannir toi-même."
        );
    }

    if (
        member.roles.highest.position >=
        message.member.roles.highest.position &&
        !message.member.roles.cache.some(
            role => role.name === OWNER_ROLE
        )
    ) {
        return message.reply(
            "❌ Tu ne peux pas sanctionner ce membre."
        );
    }

    const reason =
        args.slice(1).join(" ") ||
        "Aucune raison fournie";

    const success =
        await member.ban({
            reason
        }).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de bannir ce membre."
        );
    }

    addSanction(
        message.guild.id,
        member.id,
        "ban",
        message.author.id,
        reason
    );

    await message.reply(
        `🔨 **${member.user.tag}** a été banni.\n**Raison :** ${reason}`
    );

    await sendLog(
        message.guild,
        "Membre banni",
        `**Membre :** ${member.user.tag}\n` +
        `**Modérateur :** ${message.author}\n` +
        `**Raison :** ${reason}`
    );
}

// ============================================================
// UNBAN
// Perm 4+
// ============================================================

async function commandUnban(message, args) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const userId =
        args[1];

    if (!userId) {
        return message.reply(
            "❌ Indique l'ID du membre à débannir."
        );
    }

    const success =
        await message.guild.members.unban(
            userId
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de débannir cet utilisateur."
        );
    }

    await message.reply(
        `✅ L'utilisateur \`${userId}\` a été débanni.`
    );

    await sendLog(
        message.guild,
        "Membre débanni",
        `**Utilisateur :** \`${userId}\`\n` +
        `**Modérateur :** ${message.author}`
    );
}

// ============================================================
// TIMEOUT
// Perm 2+
// ============================================================

async function commandTimeout(message, args) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    const duration =
        Number(args[1]);

    if (
        !duration ||
        duration <= 0
    ) {
        return message.reply(
            "❌ Indique une durée en minutes.\nExemple : `+timeout @membre 10 raison`"
        );
    }

    if (
        duration > 40320
    ) {
        return message.reply(
            "❌ La durée maximale est de 28 jours."
        );
    }

    if (
        member.roles.highest.position >=
        message.member.roles.highest.position &&
        !message.member.roles.cache.some(
            role => role.name === OWNER_ROLE
        )
    ) {
        return message.reply(
            "❌ Tu ne peux pas sanctionner ce membre."
        );
    }

    const reason =
        args.slice(2).join(" ") ||
        "Aucune raison fournie";

    const success =
        await member.timeout(
            duration * 60 * 1000,
            reason
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de mettre ce membre en timeout."
        );
    }

    addSanction(
        message.guild.id,
        member.id,
        "timeout",
        message.author.id,
        reason
    );

    await message.reply(
        `⏱️ **${member.user.tag}** a été timeout pendant **${duration} minute(s)**.\n` +
        `**Raison :** ${reason}`
    );

    await sendLog(
        message.guild,
        "Timeout",
        `**Membre :** ${member.user.tag}\n` +
        `**Durée :** ${duration} minute(s)\n` +
        `**Modérateur :** ${message.author}\n` +
        `**Raison :** ${reason}`
    );
}

// ============================================================
// UNTIMEOUT
// Perm 2+
// ============================================================

async function commandUntimeout(message) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    const success =
        await member.timeout(
            null
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de retirer le timeout."
        );
    }

    await message.reply(
        `✅ Le timeout de **${member.user.tag}** a été retiré.`
    );
}

// ============================================================
// WARN
// Perm 1+
// ============================================================

async function commandWarn(message, args) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à avertir."
        );
    }

    if (member.id === message.author.id) {
        return message.reply(
            "❌ Tu ne peux pas te warn toi-même."
        );
    }

    if (
        member.roles.highest.position >=
        message.member.roles.highest.position &&
        !message.member.roles.cache.some(
            role => role.name === OWNER_ROLE
        )
    ) {
        return message.reply(
            "❌ Tu ne peux pas sanctionner ce membre."
        );
    }

    const reason =
        args.slice(1).join(" ") ||
        "Aucune raison fournie";

    addSanction(
        message.guild.id,
        member.id,
        "warn",
        message.author.id,
        reason
    );

    await message.reply(
        `⚠️ **${member.user.tag}** a reçu un avertissement.\n` +
        `**Raison :** ${reason}`
    );

    try {

        await member.send(
            `⚠️ Tu as reçu un avertissement sur **${message.guild.name}**.\n` +
            `**Raison :** ${reason}`
        );

    } catch {}

    await sendLog(
        message.guild,
        "Avertissement",
        `**Membre :** ${member.user.tag}\n` +
        `**Modérateur :** ${message.author}\n` +
        `**Raison :** ${reason}`
    );
}

// ============================================================
// WARNINGS
// Perm 1+
// ============================================================

async function commandWarnings(message) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    const sanctions =
        db.sanctions[
            message.guild.id
        ]?.[member.id] || [];

    const warns =
        sanctions.filter(
            sanction =>
                sanction.type === "warn"
        );

    if (!warns.length) {
        return message.reply(
            `✅ **${member.user.tag}** n'a aucun avertissement.`
        );
    }

    const description =
        warns
            .map(
                (warn, index) =>
                    `**#${index + 1}** — ${warn.reason}\n` +
                    `Modérateur : <@${warn.moderatorId}>\n` +
                    `<t:${Math.floor(
                        warn.date / 1000
                    )}:R>`
            )
            .join("\n\n");

    const embed =
        new EmbedBuilder()
            .setTitle(
                `Avertissements — ${member.user.tag}`
            )
            .setDescription(
                description
            )
            .setColor(
                "#5865F2"
            );

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// CLEAR WARNS
// Perm 4+
// ============================================================

async function commandClearWarns(message) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre."
        );
    }

    if (
        db.sanctions[
            message.guild.id
        ]?.[member.id]
    ) {

        db.sanctions[
            message.guild.id
        ][member.id] =
            db.sanctions[
                message.guild.id
            ][member.id].filter(
                sanction =>
                    sanction.type !== "warn"
            );

        saveDB(db);
    }

    await message.reply(
        `✅ Les avertissements de **${member.user.tag}** ont été supprimés.`
    );
}

// ============================================================
// CLEAR
// Perm 1+
// ============================================================

async function commandClear(message, args) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const amount =
        Number(args[1]);

    if (
        !amount ||
        amount < 1 ||
        amount > 100
    ) {
        return message.reply(
            "❌ Indique un nombre entre **1 et 100**."
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
        return message.reply(
            "❌ Impossible de supprimer les messages."
        );
    }

    const confirmation =
        await message.channel.send(
            `🧹 **${deleted.size}** message(s) supprimé(s).`
        );

    setTimeout(
        () => {
            confirmation.delete().catch(
                () => {}
            );
        },
        3000
    );

    await sendLog(
        message.guild,
        "Messages supprimés",
        `**Salon :** ${message.channel}\n` +
        `**Nombre :** ${deleted.size}\n` +
        `**Modérateur :** ${message.author}`
    );
}

// ============================================================
// LOCK
// Perm 2+
// ============================================================

async function commandLock(message) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const channel =
        message.channel;

    const everyone =
        message.guild.roles.everyone;

    const success =
        await channel.permissionOverwrites.edit(
            everyone,
            {
                SendMessages: false
            }
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "❌ Impossible de verrouiller ce salon."
        );
    }

    await message.reply(
        "🔒 Salon verrouillé."
    );
}

// ============================================================
// UNLOCK
// Perm 2+
// ============================================================

async function commandUnlock(message) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const channel =
        message.channel;

    const everyone =
        message.guild.roles.everyone;

    const success =
        await channel.permissionOverwrites.edit(
            everyone,
            {
                SendMessages: null
            }
        ).then(
            () => true
        ).catch(
            () => false
        );

    if (!success) {
        return message.reply(
            "🔓 Salon déverrouillé."
        );
    }

    await message.reply(
        "🔓 Salon déverrouillé."
    );
}

// ============================================================
// FIN PARTIE 4/8
// ============================================================
// ============================================================
// PARTIE 5/8 — SYSTÈME DE TICKETS
// ============================================================

// ============================================================
// CRÉER UN TICKET
// Accessible à tous
// ============================================================

async function commandTicket(message) {

    const config =
        guildConfig(
            message.guild.id
        );

    // Vérifier si le membre possède déjà un ticket
    const existingTicket =
        message.guild.channels.cache.find(
            channel =>
                isTicketChannel(channel) &&
                getTicketOwnerId(channel) ===
                message.author.id
        );

    if (existingTicket) {
        return message.reply(
            `❌ Tu as déjà un ticket ouvert : ${existingTicket}`
        );
    }

    const category =
        config.ticketCategoryId
            ? message.guild.channels.cache.get(
                config.ticketCategoryId
            )
            : null;

    const permissionOverwrites = [
        {
            id:
                message.guild.roles.everyone.id,

            deny: [
                PermissionFlagsBits.ViewChannel
            ]
        },

        {
            id:
                message.author.id,

            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles
            ]
        }
    ];

    // Le rôle Gestion ticket peut voir les tickets
    const ticketRole =
        message.guild.roles.cache.find(
            role =>
                role.name === TICKET_ROLE
        );

    if (ticketRole) {

        permissionOverwrites.push({
            id: ticketRole.id,

            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles
            ]
        });
    }

    // Crown peut voir les tickets
    const ownerRole =
        message.guild.roles.cache.find(
            role =>
                role.name === OWNER_ROLE
        );

    if (ownerRole) {

        permissionOverwrites.push({
            id: ownerRole.id,

            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels
            ]
        });
    }

    const channel =
        await message.guild.channels.create({

            name:
                `ticket-${message.author.username}`
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "")
                    .slice(0, 80),

            type:
                ChannelType.GuildText,

            parent:
                category?.type ===
                ChannelType.GuildCategory
                    ? category.id
                    : null,

            topic:
                `ticket:${message.author.id}:${Date.now()}`,

            permissionOverwrites

        }).catch(
            () => null
        );

    if (!channel) {
        return message.reply(
            "❌ Impossible de créer le ticket."
        );
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                config.ticketTitle ||
                "🎫 Ticket"
            )
            .setDescription(
                config.ticketDescription ||
                "Explique ta demande ici. Un membre du staff viendra te répondre."
            )
            .addFields({
                name: "Créé par",
                value:
                    `${message.author}`
            })
            .setColor(
                "#5865F2"
            )
            .setTimestamp();

    if (config.ticketImage) {

        embed.setImage(
            replaceVariables(
                config.ticketImage,
                message.member
            )
        );
    }

    const buttons =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        "ticket_claim"
                    )
                    .setLabel(
                        "Claim"
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "ticket_close"
                    )
                    .setLabel(
                        "Fermer"
                    )
                    .setStyle(
                        ButtonStyle.Danger
                    )
            );

    await channel.send({
        content:
            `${message.author} <@&${ticketRole?.id || ""}>`,

        embeds: [
            embed
        ],

        components: [
            buttons
        ]
    });

    await message.reply(
        `✅ Ton ticket a été créé : ${channel}`
    );

    await sendLog(
        message.guild,
        "Ticket créé",
        `**Ticket :** ${channel}\n` +
        `**Membre :** ${message.author}`
    );
}

// ============================================================
// TICKET ADD
// Gestion ticket + Crown uniquement
// ============================================================

async function commandTicketAdd(message, args) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {
        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à ajouter."
        );
    }

    await message.channel.permissionOverwrites.edit(
        member.id,
        {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true
        }
    ).catch(
        () => null
    );

    await message.reply(
        `✅ ${member} a été ajouté au ticket.`
    );

    await sendLog(
        message.guild,
        "Membre ajouté au ticket",
        `**Ticket :** ${message.channel}\n` +
        `**Membre ajouté :** ${member}\n` +
        `**Staff :** ${message.author}`
    );
}

// ============================================================
// TICKET REMOVE
// Gestion ticket + Crown uniquement
// ============================================================

async function commandTicketRemove(message) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {
        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à retirer."
        );
    }

    const ownerId =
        getTicketOwnerId(
            message.channel
        );

    if (member.id === ownerId) {
        return message.reply(
            "❌ Tu ne peux pas retirer le créateur du ticket."
        );
    }

    await message.channel.permissionOverwrites.delete(
        member.id
    ).catch(
        () => null
    );

    await message.reply(
        `✅ ${member} a été retiré du ticket.`
    );
}

// ============================================================
// TICKET CLAIM
// Gestion ticket + Crown uniquement
// ============================================================

async function commandTicketClaim(message) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {
        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const topic =
        message.channel.topic || "";

    const parts =
        topic
            .replace("ticket:", "")
            .split(":");

    const ownerId =
        parts[0];

    const claimedBy =
        parts[1];

    if (claimedBy) {
        return message.reply(
            `❌ Ce ticket est déjà pris en charge par <@${claimedBy}>.`
        );
    }

    await message.channel.setTopic(
        `ticket:${ownerId}:${message.author.id}`
    ).catch(
        () => null
    );

    await message.reply(
        `✅ ${message.author} prend maintenant en charge ce ticket.`
    );

    await sendLog(
        message.guild,
        "Ticket réclamé",
        `**Ticket :** ${message.channel}\n` +
        `**Staff :** ${message.author}`
    );
}

// ============================================================
// TICKET UNCLAIM
// Gestion ticket + Crown uniquement
// ============================================================

async function commandTicketUnclaim(message) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {
        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const topic =
        message.channel.topic || "";

    const parts =
        topic
            .replace("ticket:", "")
            .split(":");

    const ownerId =
        parts[0];

    const claimedBy =
        parts[1];

    if (!claimedBy) {
        return message.reply(
            "❌ Ce ticket n'est actuellement pris en charge par personne."
        );
    }

    await message.channel.setTopic(
        `ticket:${ownerId}`
    ).catch(
        () => null
    );

    await message.reply(
        "✅ Le ticket n'est plus pris en charge."
    );
}

// ============================================================
// TICKET CLOSE
// Gestion ticket + Crown uniquement
// ============================================================

async function commandTicketClose(message) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {
        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const channel =
        message.channel;

    await message.reply(
        "🔒 Fermeture du ticket dans **5 secondes**..."
    );

    await sendLog(
        message.guild,
        "Ticket fermé",
        `**Ticket :** ${channel.name}\n` +
        `**Fermé par :** ${message.author}`
    );

    setTimeout(
        () => {
            channel.delete().catch(
                () => {}
            );
        },
        5000
    );
}

// ============================================================
// TICKET INFO
// Gestion ticket + Crown uniquement
// ============================================================

async function commandTicketInfo(message) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {
        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const ownerId =
        getTicketOwnerId(
            message.channel
        );

    const topic =
        message.channel.topic || "";

    const claimedBy =
        topic
            .replace(
                `ticket:${ownerId}`,
                ""
            )
            .replace(
                ":",
                ""
            );

    const embed =
        new EmbedBuilder()
            .setTitle(
                "Informations du ticket"
            )
            .addFields(
                {
                    name: "Créateur",
                    value:
                        ownerId
                            ? `<@${ownerId}>`
                            : "Inconnu"
                },
                {
                    name: "Pris en charge par",
                    value:
                        claimedBy
                            ? `<@${claimedBy}>`
                            : "Personne"
                },
                {
                    name: "Salon",
                    value:
                        `${message.channel}`
                }
            )
            .setColor(
                "#5865F2"
            );

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// TICKET PANEL
// Gestion ticket + Crown uniquement
// ============================================================

async function commandTicketPanel(message) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    const config =
        guildConfig(
            message.guild.id
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                config.ticketTitle ||
                "🎫 Ticket"
            )
            .setDescription(
                config.ticketDescription ||
                "Clique sur le bouton ci-dessous pour ouvrir un ticket."
            )
            .setColor(
                "#5865F2"
            );

    if (config.ticketImage) {
        embed.setImage(
            config.ticketImage
        );
    }

    const row =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        "ticket_create"
                    )
                    .setLabel(
                        "Créer un ticket"
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );

    await message.channel.send({
        embeds: [
            embed
        ],
        components: [
            row
        ]
    });

    await message.reply({
        content:
            "✅ Panel ticket envoyé.",
        ephemeral: true
    }).catch(
        () => {}
    );
}

// ============================================================
// FIN PARTIE 5/8
// ============================================================
// ============================================================
// PARTIE 6/8 — STATISTIQUES + BIENVENUE
// ============================================================

// ============================================================
// +stat
// Perm 1+
// Envoie TOUJOURS un nouveau message
// ============================================================

async function commandStat(message) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    await message.channel.send({
        embeds: [
            statisticsEmbed(
                message.guild
            )
        ]
    });
}

// ============================================================
// +stat send
// Perm 1+
// Envoie les statistiques dans le salon configuré
// ============================================================

async function commandStatSend(message) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const success =
        await sendStatistics(
            message.guild
        );

    if (!success) {
        return message.reply(
            "❌ Aucun salon de statistiques n'est configuré."
        );
    }

    await message.reply(
        "✅ Les statistiques ont été envoyées."
    );
}

// ============================================================
// +statconfig
// Perm 4+
// Configure le salon automatique
// ============================================================

async function commandStatConfig(message, args) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const channel =
        message.mentions.channels.first();

    if (!channel) {
        return message.reply(
            "❌ Mentionne le salon où envoyer les statistiques."
        );
    }

    const config =
        guildConfig(
            message.guild.id
        );

    config.statChannelId =
        channel.id;

    saveDB(db);

    await message.reply(
        `✅ Le salon des statistiques est maintenant ${channel}.`
    );
}

// ============================================================
// +stathour
// Perm 4+
// Exemple : +stathour 23:00
// ============================================================

async function commandStatHour(message, args) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const hour =
        args[1];

    if (
        !hour ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(hour)
    ) {
        return message.reply(
            "❌ Format invalide.\nExemple : `+stathour 23:00`"
        );
    }

    const config =
        guildConfig(
            message.guild.id
        );

    config.statHour =
        hour;

    config.statLastRun =
        null;

    saveDB(db);

    await message.reply(
        `✅ Les statistiques automatiques seront envoyées chaque jour à **${hour}**.`
    );
}

// ============================================================
// VARIABLES DE BIENVENUE
// ============================================================

function getWelcomeVariables() {

    return [
        {
            variable: "{member}",
            description: "Mention du nouveau membre"
        },
        {
            variable: "{member.id}",
            description: "ID du membre"
        },
        {
            variable: "{member.tag}",
            description: "Tag du membre"
        },
        {
            variable: "{user}",
            description: "Mention de l'utilisateur"
        },
        {
            variable: "{user.id}",
            description: "ID de l'utilisateur"
        },
        {
            variable: "{user.tag}",
            description: "Tag de l'utilisateur"
        },
        {
            variable: "{server}",
            description: "Nom du serveur"
        },
        {
            variable: "{server.id}",
            description: "ID du serveur"
        },
        {
            variable: "{membercount}",
            description: "Nombre total de membres"
        },
        {
            variable: "{avatar}",
            description: "Avatar du membre"
        },
        {
            variable: "{date}",
            description: "Date actuelle"
        },
        {
            variable: "{time}",
            description: "Heure actuelle"
        }
    ];
}

// ============================================================
// +welcome
// Perm 4+
// Affiche la configuration actuelle
// ============================================================

async function commandWelcome(message) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const config =
        guildConfig(
            message.guild.id
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                "Configuration bienvenue"
            )
            .addFields(
                {
                    name: "Salon",
                    value:
                        config.welcomeChannelId
                            ? `<#${config.welcomeChannelId}>`
                            : "Non configuré"
                },
                {
                    name: "Message",
                    value:
                        config.welcomeMessage ||
                        "Non configuré"
                },
                {
                    name: "Image",
                    value:
                        config.welcomeImage ||
                        "Aucune"
                }
            )
            .setColor(
                "#5865F2"
            );

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// +welcome channel
// Perm 4+
// Exemple : +welcome channel #bienvenue
// ============================================================

async function commandWelcomeChannel(
    message
) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const channel =
        message.mentions.channels.first();

    if (!channel) {
        return message.reply(
            "❌ Mentionne le salon de bienvenue."
        );
    }

    const config =
        guildConfig(
            message.guild.id
        );

    config.welcomeChannelId =
        channel.id;

    saveDB(db);

    await message.reply(
        `✅ Le salon de bienvenue est maintenant ${channel}.`
    );
}

// ============================================================
// +welcome message
// Perm 4+
// ============================================================

async function commandWelcomeMessage(
    message,
    args
) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const messageText =
        args.slice(2).join(" ");

    if (!messageText) {
        return message.reply(
            "❌ Indique le message de bienvenue."
        );
    }

    const config =
        guildConfig(
            message.guild.id
        );

    config.welcomeMessage =
        messageText;

    saveDB(db);

    await message.reply(
        "✅ Le message de bienvenue a été modifié."
    );
}

// ============================================================
// +welcome image
// Perm 4+
// ============================================================

async function commandWelcomeImage(
    message,
    args
) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const image =
        args.slice(2).join(" ");

    if (!image) {
        return message.reply(
            "❌ Indique l'URL de l'image."
        );
    }

    const config =
        guildConfig(
            message.guild.id
        );

    config.welcomeImage =
        image;

    saveDB(db);

    await message.reply(
        "✅ L'image de bienvenue a été configurée."
    );
}

// ============================================================
// +welcome reset
// Perm 4+
// ============================================================

async function commandWelcomeReset(
    message
) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const config =
        guildConfig(
            message.guild.id
        );

    config.welcomeChannelId =
        null;

    config.welcomeMessage =
        "Bienvenue {member} sur **{server}** !";

    config.welcomeImage =
        null;

    saveDB(db);

    await message.reply(
        "✅ La configuration de bienvenue a été réinitialisée."
    );
}

// ============================================================
// +variables
// Perm 1+
// Affiche toutes les variables disponibles
// ============================================================

async function commandVariables(message) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const variables =
        getWelcomeVariables();

    const description =
        variables
            .map(
                item =>
                    `\`${item.variable}\` — ${item.description}`
            )
            .join("\n");

    const embed =
        new EmbedBuilder()
            .setTitle(
                "Variables disponibles"
            )
            .setDescription(
                description
            )
            .setColor(
                "#5865F2"
            );

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// +welcometest
// Perm 4+
// Teste le message avec le membre qui lance la commande
// ============================================================

async function commandWelcomeTest(
    message
) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const config =
        guildConfig(
            message.guild.id
        );

    const text =
        replaceVariables(
            config.welcomeMessage ||
            "Bienvenue {member} sur **{server}** !",
            message.member
        );

    const embed =
        new EmbedBuilder()
            .setDescription(
                text
            )
            .setThumbnail(
                message.member.user.displayAvatarURL({
                    dynamic: true,
                    size: 512
                })
            )
            .setColor(
                "#5865F2"
            )
            .setTimestamp();

    if (config.welcomeImage) {

        embed.setImage(
            replaceVariables(
                config.welcomeImage,
                message.member
            )
        );
    }

    await message.channel.send({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// FIN PARTIE 6/8
// ============================================================
// ============================================================
// PARTIE 7/8 — SYSTÈME DE TICKETS
// ============================================================

// ============================================================
// CRÉER LE BOUTON DE TICKET
// ============================================================

function ticketButtonRow() {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setCustomId("ticket_create")
                .setLabel("Créer un ticket")
                .setStyle(ButtonStyle.Primary)
        );
}

// ============================================================
// +ticket panel
// Perm 0 — Gestion ticket
// Crown — accès total
// ============================================================

async function commandTicketPanel(message) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    const config =
        guildConfig(
            message.guild.id
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                config.ticketTitle ||
                "🎫 Ticket"
            )
            .setDescription(
                config.ticketDescription ||
                "Explique ta demande ici. Un membre du staff viendra te répondre."
            )
            .setColor(
                "#5865F2"
            );

    if (config.ticketImage) {
        embed.setImage(
            config.ticketImage
        );
    }

    await message.channel.send({
        embeds: [
            embed
        ],
        components: [
            ticketButtonRow()
        ]
    });

    await message.reply({
        content: "✅ Panel ticket envoyé.",
        ephemeral: true
    }).catch(() => {});
}

// ============================================================
// +ticket config
// Perm 4+
// Configure la catégorie
// ============================================================

async function commandTicketConfig(
    message
) {

    if (!(await requireLevel(message, 4))) {
        return;
    }

    const category =
        message.mentions.channels.first();

    if (
        !category ||
        category.type !== ChannelType.GuildCategory
    ) {
        return message.reply(
            "❌ Mentionne une catégorie Discord."
        );
    }

    const config =
        guildConfig(
            message.guild.id
        );

    config.ticketCategoryId =
        category.id;

    saveDB(db);

    await message.reply(
        `✅ Catégorie des tickets configurée sur **${category.name}**.`
    );
}

// ============================================================
// CRÉATION D'UN TICKET
// ============================================================

async function createTicket(
    interaction
) {

    const guild =
        interaction.guild;

    const member =
        interaction.member;

    const config =
        guildConfig(
            guild.id
        );

    // Vérifie si le membre possède déjà un ticket
    const existing =
        guild.channels.cache.find(
            channel =>
                isTicketChannel(channel) &&
                getTicketOwnerId(channel) === member.id
        );

    if (existing) {

        return interaction.reply({
            content:
                `❌ Tu as déjà un ticket ouvert : ${existing}`,
            ephemeral: true
        });
    }

    const ticketName =
        `ticket-${member.user.username}`
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, "-")
            .slice(0, 90);

    const permissionOverwrites = [

        {
            id: guild.roles.everyone.id,
            deny: [
                PermissionFlagsBits.ViewChannel
            ]
        },

        {
            id: member.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles
            ]
        }
    ];

    // Autorise Gestion ticket
    const ticketRole =
        guild.roles.cache.find(
            role =>
                role.name === TICKET_ROLE
        );

    if (ticketRole) {

        permissionOverwrites.push({
            id: ticketRole.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages
            ]
        });
    }

    // Autorise Crown
    const ownerRole =
        guild.roles.cache.find(
            role =>
                role.name === OWNER_ROLE
        );

    if (ownerRole) {

        permissionOverwrites.push({
            id: ownerRole.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages
            ]
        });
    }

    const options = {

        name: ticketName,

        type: ChannelType.GuildText,

        permissionOverwrites,

        topic:
            `ticket:${member.id}:open`
    };

    if (config.ticketCategoryId) {

        const category =
            guild.channels.cache.get(
                config.ticketCategoryId
            );

        if (
            category &&
            category.type === ChannelType.GuildCategory
        ) {
            options.parent =
                category.id;
        }
    }

    const channel =
        await guild.channels.create(
            options
        );

    db.tickets[guild.id] ??= {};

    db.tickets[guild.id][channel.id] = {

        ownerId:
            member.id,

        claimedBy:
            null,

        addedMembers:
            [],

        createdAt:
            Date.now(),

        closed:
            false
    };

    saveDB(db);

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎫 Ticket"
            )
            .setDescription(
                `Bienvenue ${member} !\n\n` +
                `Explique ta demande ici.\n` +
                `Un membre de la gestion des tickets va venir t'aider.`
            )
            .setColor(
                "#5865F2"
            )
            .setFooter({
                text:
                    "Gestion des tickets Hirosaki"
            });

    const buttons =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId("ticket_claim")
                    .setLabel("Claim")
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId("ticket_close")
                    .setLabel("Fermer")
                    .setStyle(ButtonStyle.Danger)
            );

    await channel.send({
        content:
            `${member}`,
        embeds: [
            embed
        ],
        components: [
            buttons
        ]
    });

    await interaction.reply({
        content:
            `✅ Ton ticket a été créé : ${channel}`,
        ephemeral: true
    });

    await sendLog(
        guild,
        "Ticket créé",
        `**Ticket :** ${channel}\n` +
        `**Membre :** ${member}\n` +
        `**ID :** ${member.id}`
    );
}

// ============================================================
// +ticket add @membre
// Perm 0 — Gestion ticket
// Crown
// ============================================================

async function commandTicketAdd(
    message
) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {

        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à ajouter."
        );
    }

    await message.channel.permissionOverwrites.edit(
        member.id,
        {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true
        }
    );

    const ticket =
        db.tickets[message.guild.id]?.[
            message.channel.id
        ];

    if (ticket) {

        if (!ticket.addedMembers.includes(member.id)) {

            ticket.addedMembers.push(
                member.id
            );

            saveDB(db);
        }
    }

    await message.channel.send(
        `✅ ${member} a été ajouté au ticket.`
    );

    await sendLog(
        message.guild,
        "Membre ajouté à un ticket",
        `**Ticket :** ${message.channel}\n` +
        `**Membre :** ${member}\n` +
        `**Ajouté par :** ${message.author}`
    );
}

// ============================================================
// +ticket remove @membre
// Perm 0 — Gestion ticket
// Crown
// ============================================================

async function commandTicketRemove(
    message
) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {

        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à retirer."
        );
    }

    const ownerId =
        getTicketOwnerId(
            message.channel
        );

    if (member.id === ownerId) {

        return message.reply(
            "❌ Impossible de retirer le créateur du ticket."
        );
    }

    await message.channel.permissionOverwrites.delete(
        member.id
    ).catch(() => {});

    const ticket =
        db.tickets[message.guild.id]?.[
            message.channel.id
        ];

    if (ticket) {

        ticket.addedMembers =
            ticket.addedMembers.filter(
                id => id !== member.id
            );

        saveDB(db);
    }

    await message.channel.send(
        `✅ ${member} a été retiré du ticket.`
    );
}

// ============================================================
// +ticket claim
// Perm 0 — Gestion ticket
// Crown
// ============================================================

async function commandTicketClaim(
    message
) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {

        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const ticket =
        db.tickets[message.guild.id]?.[
            message.channel.id
        ];

    if (!ticket) {
        return message.reply(
            "❌ Impossible de trouver les informations du ticket."
        );
    }

    if (ticket.claimedBy) {

        return message.reply(
            `❌ Ce ticket est déjà claim par <@${ticket.claimedBy}>.`
        );
    }

    ticket.claimedBy =
        message.author.id;

    saveDB(db);

    await message.channel.send(
        `✅ ${message.author} a pris en charge ce ticket.`
    );

    await sendLog(
        message.guild,
        "Ticket claim",
        `**Ticket :** ${message.channel}\n` +
        `**Staff :** ${message.author}`
    );
}

// ============================================================
// +ticket unclaim
// Perm 0 — Gestion ticket
// Crown
// ============================================================

async function commandTicketUnclaim(
    message
) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {

        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const ticket =
        db.tickets[message.guild.id]?.[
            message.channel.id
        ];

    if (!ticket) {
        return message.reply(
            "❌ Ticket introuvable."
        );
    }

    if (
        ticket.claimedBy &&
        ticket.claimedBy !== message.author.id &&
        !message.member.roles.cache.some(
            role => role.name === OWNER_ROLE
        )
    ) {

        return message.reply(
            "❌ Seul le staff ayant claim le ticket ou le Crown peut le retirer."
        );
    }

    ticket.claimedBy =
        null;

    saveDB(db);

    await message.channel.send(
        "✅ Le ticket n'est plus claim."
    );
}

// ============================================================
// +ticket close
// Perm 0 — Gestion ticket
// Crown
// ============================================================

async function commandTicketClose(
    message
) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {

        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const ticket =
        db.tickets[message.guild.id]?.[
            message.channel.id
        ];

    if (ticket) {

        ticket.closed =
            true;

        ticket.closedAt =
            Date.now();

        ticket.closedBy =
            message.author.id;

        saveDB(db);
    }

    await message.channel.send(
        "🔒 Ticket fermé. Suppression du salon dans 5 secondes..."
    );

    await sendLog(
        message.guild,
        "Ticket fermé",
        `**Ticket :** ${message.channel.name}\n` +
        `**Fermé par :** ${message.author}`
    );

    setTimeout(
        () => {

            message.channel
                .delete()
                .catch(() => {});

        },
        5000
    );
}

// ============================================================
// +ticket rename nouveau-nom
// Perm 0 — Gestion ticket
// Crown
// ============================================================

async function commandTicketRename(
    message,
    args
) {

    if (!(await requireTicketPermission(message))) {
        return;
    }

    if (!isTicketChannel(message.channel)) {

        return message.reply(
            "❌ Cette commande doit être utilisée dans un ticket."
        );
    }

    const newName =
        args.slice(2)
            .join("-")
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, "-")
            .slice(0, 90);

    if (!newName) {
        return message.reply(
            "❌ Indique un nouveau nom."
        );
    }

    await message.channel.setName(
        newName
    );

    await message.channel.send(
        `✅ Le ticket a été renommé en **${newName}**.`
    );
}

// ============================================================
// FIN PARTIE 7/8
// ============================================================
// ============================================================
// PARTIE 8/8 — COMMANDES + / BOUTONS / LOGIN
// ============================================================

// ============================================================
// EMBED DES PERMISSIONS STAFF
// ============================================================

function staffPermissionsEmbed(page) {

    const pages = [

        new EmbedBuilder()
            .setTitle("Hirosaki 🎆 — Permissions staff")
            .setDescription(
                "**Page 1/6 — Hiérarchie**\n\n" +
                "**Perm 1** → Modérateur test\n" +
                "**Perm 2** → Modérateur\n" +
                "**Perm 3** → Staff confirmé\n" +
                "**Perm 4** → Responsable staff\n" +
                "**Perm 5** → Co-owner\n\n" +
                "**Crown** → Owner — accès total\n\n" +
                "Les permissions sont cumulatives : une Perm supérieure possède également les commandes des niveaux inférieurs."
            )
            .setColor("#5865F2"),

        new EmbedBuilder()
            .setTitle("Hirosaki 🎆 — Permissions staff")
            .setDescription(
                "**Page 2/6 — Perm 1**\n\n" +
                "**Modérateur test**\n\n" +
                "Commandes de base :\n" +
                "`+warn`\n" +
                "`+warnings`\n" +
                "`+snipe`\n" +
                "`+stat`\n" +
                "`+variables`\n" +
                "`+userinfo`\n" +
                "`+serverinfo`"
            )
            .setColor("#5865F2"),

        new EmbedBuilder()
            .setTitle("Hirosaki 🎆 — Permissions staff")
            .setDescription(
                "**Page 3/6 — Perm 2**\n\n" +
                "**Modérateur**\n\n" +
                "Commandes Perm 1 + :\n" +
                "`+kick`\n" +
                "`+timeout`\n" +
                "`+untimeout`\n" +
                "`+clear`\n" +
                "`+mute`\n" +
                "`+unmute`"
            )
            .setColor("#5865F2"),

        new EmbedBuilder()
            .setTitle("Hirosaki 🎆 — Permissions staff")
            .setDescription(
                "**Page 4/6 — Perm 3**\n\n" +
                "**Staff confirmé**\n\n" +
                "Commandes Perm 2 + :\n" +
                "`+ban`\n" +
                "`+unban`\n" +
                "`+history`\n" +
                "`+sanctions`\n" +
                "`+lock`\n" +
                "`+unlock`"
            )
            .setColor("#5865F2"),

        new EmbedBuilder()
            .setTitle("Hirosaki 🎆 — Permissions staff")
            .setDescription(
                "**Page 5/6 — Perm 4**\n\n" +
                "**Responsable staff**\n\n" +
                "Commandes Perm 3 + :\n" +
                "`+welcome`\n" +
                "`+welcome channel`\n" +
                "`+welcome message`\n" +
                "`+welcome image`\n" +
                "`+welcome reset`\n" +
                "`+statconfig`\n" +
                "`+stathour`\n" +
                "`+ticket config`"
            )
            .setColor("#5865F2"),

        new EmbedBuilder()
            .setTitle("Hirosaki 🎆 — Permissions staff")
            .setDescription(
                "**Page 6/6 — Perm 5 / Crown / Tickets**\n\n" +
                "**Perm 5 — Co-owner**\n" +
                "Accès aux commandes de gestion avancée.\n\n" +
                "**Crown — Owner**\n" +
                "Accès total au bot.\n\n" +
                "**Gestion ticket — Perm 0**\n" +
                "`+ticket panel`\n" +
                "`+ticket add`\n" +
                "`+ticket remove`\n" +
                "`+ticket claim`\n" +
                "`+ticket unclaim`\n" +
                "`+ticket close`\n" +
                "`+ticket rename`\n\n" +
                "Ces commandes tickets sont accessibles uniquement à **Gestion ticket** et **Crown**."
            )
            .setColor("#5865F2")
    ];

    return pages[page] || pages[0];
}

// ============================================================
// BOUTONS DE NAVIGATION DES PERMISSIONS
// ============================================================

function staffPermissionsButtons(page) {

    const row =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        "staff_perm_prev"
                    )
                    .setLabel("◀")
                    .setStyle(
                        ButtonStyle.Secondary
                    )
                    .setDisabled(
                        page <= 0
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "staff_perm_next"
                    )
                    .setLabel("▶")
                    .setStyle(
                        ButtonStyle.Secondary
                    )
                    .setDisabled(
                        page >= 5
                    )
            );

    return row;
}

// ============================================================
// +perms
// Perm 1+
// ============================================================

async function commandPerms(message) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const page = 0;

    await message.channel.send({

        embeds: [
            staffPermissionsEmbed(page)
        ],

        components: [
            staffPermissionsButtons(page)
        ]
    });
}

// ============================================================
// COMMANDES MODÉRATION
// ============================================================

// +warn @membre raison
async function commandWarn(message, args) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à avertir."
        );
    }

    if (
        member.id === message.author.id
    ) {
        return message.reply(
            "❌ Tu ne peux pas te sanctionner toi-même."
        );
    }

    const reason =
        args
            .slice(2)
            .join(" ") ||
        "Aucune raison indiquée.";

    addSanction(
        message.guild.id,
        member.id,
        "warn",
        message.author.id,
        reason
    );

    await message.reply(
        `✅ ${member} a reçu un avertissement.\n**Raison :** ${reason}`
    );

    await sendLog(
        message.guild,
        "Avertissement",
        `**Membre :** ${member}\n` +
        `**Modérateur :** ${message.author}\n` +
        `**Raison :** ${reason}`
    );
}

// ============================================================
// +warnings @membre
// ============================================================

async function commandWarnings(
    message
) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne un membre."
        );
    }

    const sanctions =
        db.sanctions[
            message.guild.id
        ]?.[
            member.id
        ] || [];

    const warns =
        sanctions.filter(
            sanction =>
                sanction.type === "warn"
        );

    if (!warns.length) {

        return message.reply(
            `✅ ${member} n'a aucun avertissement.`
        );
    }

    const description =
        warns
            .map(
                (warn, index) =>
                    `**${index + 1}.** ${warn.reason}\n` +
                    `Modérateur : <@${warn.moderatorId}>`
            )
            .join("\n\n");

    const embed =
        new EmbedBuilder()
            .setTitle(
                `Avertissements de ${member.user.tag}`
            )
            .setDescription(
                description
            )
            .setColor(
                "#5865F2"
            );

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// +kick @membre raison
// Perm 2
// ============================================================

async function commandKick(message, args) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à expulser."
        );
    }

    const reason =
        args.slice(2).join(" ") ||
        "Aucune raison indiquée.";

    await member.kick(
        reason
    ).catch(
        () => null
    );

    addSanction(
        message.guild.id,
        member.id,
        "kick",
        message.author.id,
        reason
    );

    await message.reply(
        `✅ ${member.user.tag} a été expulsé.`
    );

    await sendLog(
        message.guild,
        "Membre expulsé",
        `**Membre :** ${member.user.tag}\n` +
        `**Modérateur :** ${message.author}\n` +
        `**Raison :** ${reason}`
    );
}

// ============================================================
// +ban @membre raison
// Perm 3
// ============================================================

async function commandBan(message, args) {

    if (!(await requireLevel(message, 3))) {
        return;
    }

    const member =
        message.mentions.members.first();

    if (!member) {
        return message.reply(
            "❌ Mentionne le membre à bannir."
        );
    }

    const reason =
        args.slice(2).join(" ") ||
        "Aucune raison indiquée.";

    await member.ban({
        reason
    }).catch(
        () => null
    );

    addSanction(
        message.guild.id,
        member.id,
        "ban",
        message.author.id,
        reason
    );

    await message.reply(
        `✅ ${member.user.tag} a été banni.`
    );

    await sendLog(
        message.guild,
        "Membre banni",
        `**Membre :** ${member.user.tag}\n` +
        `**Modérateur :** ${message.author}\n` +
        `**Raison :** ${reason}`
    );
}

// ============================================================
// +clear nombre
// Perm 2
// ============================================================

async function commandClear(
    message,
    args
) {

    if (!(await requireLevel(message, 2))) {
        return;
    }

    const amount =
        parseInt(args[1]);

    if (
        isNaN(amount) ||
        amount < 1 ||
        amount > 100
    ) {
        return message.reply(
            "❌ Indique un nombre entre 1 et 100."
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
        return message.reply(
            "❌ Impossible de supprimer les messages."
        );
    }

    const confirmation =
        await message.channel.send(
            `✅ **${deleted.size}** message(s) supprimé(s).`
        );

    setTimeout(
        () => {
            confirmation.delete().catch(
                () => {}
            );
        },
        3000
    );
}

// ============================================================
// +snipe
// Perm 1
// ============================================================

async function commandSnipe(message) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const data =
        db.snipe[
            message.channel.id
        ];

    if (!data) {
        return message.reply(
            "❌ Aucun message supprimé trouvé."
        );
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                "Message supprimé"
            )
            .setDescription(
                data.content
            )
            .setAuthor({
                name:
                    data.authorTag,
                iconURL:
                    data.avatar
            })
            .setTimestamp(
                data.date
            )
            .setColor(
                "#5865F2"
            );

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// +userinfo @membre
// Perm 1
// ============================================================

async function commandUserInfo(message) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const member =
        message.mentions.members.first() ||
        message.member;

    const embed =
        new EmbedBuilder()
            .setTitle(
                `Informations — ${member.user.tag}`
            )
            .setThumbnail(
                member.user.displayAvatarURL({
                    dynamic: true,
                    size: 512
                })
            )
            .addFields(
                {
                    name: "Utilisateur",
                    value: `${member}`,
                    inline: true
                },
                {
                    name: "ID",
                    value: member.id,
                    inline: true
                },
                {
                    name: "Compte créé",
                    value:
                        `<t:${Math.floor(
                            member.user.createdTimestamp / 1000
                        )}:F>`,
                    inline: false
                },
                {
                    name: "A rejoint",
                    value:
                        member.joinedTimestamp
                            ? `<t:${Math.floor(
                                member.joinedTimestamp / 1000
                            )}:F>`
                            : "Inconnu",
                    inline: false
                }
            )
            .setColor(
                "#5865F2"
            );

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// +serverinfo
// Perm 1
// ============================================================

async function commandServerInfo(message) {

    if (!(await requireLevel(message, 1))) {
        return;
    }

    const guild =
        message.guild;

    const embed =
        new EmbedBuilder()
            .setTitle(
                guild.name
            )
            .setThumbnail(
                guild.iconURL({
                    dynamic: true
                })
            )
            .addFields(
                {
                    name: "Membres",
                    value:
                        String(
                            guild.memberCount
                        ),
                    inline: true
                },
                {
                    name: "Salons",
                    value:
                        String(
                            guild.channels.cache.size
                        ),
                    inline: true
                },
                {
                    name: "Rôles",
                    value:
                        String(
                            guild.roles.cache.size
                        ),
                    inline: true
                }
            )
            .setColor(
                "#5865F2"
            );

    await message.reply({
        embeds: [
            embed
        ]
    });
}

// ============================================================
// BOUTONS
// ============================================================

client.on(
    "interactionCreate",
    async interaction => {

        if (!interaction.isButton()) {
            return;
        }

        // ----------------------------------------------------
        // CRÉATION TICKET
        // ----------------------------------------------------

        if (
            interaction.customId ===
            "ticket_create"
        ) {

            await createTicket(
                interaction
            );

            return;
        }

        // ----------------------------------------------------
        // CLAIM TICKET
        // ----------------------------------------------------

        if (
            interaction.customId ===
            "ticket_claim"
        ) {

            if (
                !isTicketManager(
                    interaction.member
                )
            ) {

                return interaction.reply({
                    content:
                        "❌ Tu n'as pas la permission de gestion des tickets.",
                    ephemeral: true
                });
            }

            if (
                !isTicketChannel(
                    interaction.channel
                )
            ) {

                return interaction.reply({
                    content:
                        "❌ Ce bouton doit être utilisé dans un ticket.",
                    ephemeral: true
                });
            }

            const ticket =
                db.tickets[
                    interaction.guild.id
                ]?.[
                    interaction.channel.id
                ];

            if (!ticket) {

                return interaction.reply({
                    content:
                        "❌ Ticket introuvable.",
                    ephemeral: true
                });
            }

            if (ticket.claimedBy) {

                return interaction.reply({
                    content:
                        `❌ Ce ticket est déjà claim par <@${ticket.claimedBy}>.`,
                    ephemeral: true
                });
            }

            ticket.claimedBy =
                interaction.user.id;

            saveDB(db);

            await interaction.reply(
                `✅ ${interaction.user} a pris en charge le ticket.`
            );

            return;
        }

        // ----------------------------------------------------
        // FERMETURE TICKET
        // ----------------------------------------------------

        if (
            interaction.customId ===
            "ticket_close"
        ) {

            if (
                !isTicketManager(
                    interaction.member
                )
            ) {

                return interaction.reply({
                    content:
                        "❌ Tu n'as pas la permission de gestion des tickets.",
                    ephemeral: true
                });
            }

            if (
                !isTicketChannel(
                    interaction.channel
                )
            ) {

                return interaction.reply({
                    content:
                        "❌ Ce bouton doit être utilisé dans un ticket.",
                    ephemeral: true
                });
            }

            const ticket =
                db.tickets[
                    interaction.guild.id
                ]?.[
                    interaction.channel.id
                ];

            if (ticket) {

                ticket.closed =
                    true;

                ticket.closedAt =
                    Date.now();

                ticket.closedBy =
                    interaction.user.id;

                saveDB(db);
            }

            await interaction.reply(
                "🔒 Ticket fermé. Suppression dans 5 secondes..."
            );

            await sendLog(
                interaction.guild,
                "Ticket fermé",
                `**Ticket :** ${interaction.channel.name}\n` +
                `**Fermé par :** ${interaction.user}`
            );

            setTimeout(
                () => {
                    interaction.channel
                        .delete()
                        .catch(
                            () => {}
                        );
                },
                5000
            );

            return;
        }

        // ----------------------------------------------------
        // NAVIGATION PERMISSIONS
        // ----------------------------------------------------

        if (
            interaction.customId ===
            "staff_perm_prev" ||
            interaction.customId ===
            "staff_perm_next"
        ) {

            if (
                !isTicketManager(
                    interaction.member
                ) &&
                getStaffLevel(
                    interaction.member
                ) < 1
            ) {

                return interaction.reply({
                    content:
                        "❌ Tu n'as pas accès à cette page.",
                    ephemeral: true
                });
            }

            const current =
                interaction.message.embeds[0];

            const currentTitle =
                current?.title || "";

            let page = 0;

            if (
                currentTitle.includes(
                    "Page 2"
                )
            ) page = 1;

            if (
                currentTitle.includes(
                    "Page 3"
                )
            ) page = 2;

            if (
                currentTitle.includes(
                    "Page 4"
                )
            ) page = 3;

            if (
                currentTitle.includes(
                    "Page 5"
                )
            ) page = 4;

            if (
                currentTitle.includes(
                    "Page 6"
                )
            ) page = 5;

            if (
                interaction.customId ===
                "staff_perm_prev"
            ) {
                page--;
            } else {
                page++;
            }

            page =
                Math.max(
                    0,
                    Math.min(
                        5,
                        page
                    )
                );

            await interaction.update({
                embeds: [
                    staffPermissionsEmbed(page)
                ],
                components: [
                    staffPermissionsButtons(page)
                ]
            });
        }
    }
);

// ============================================================
// GESTION DES COMMANDES PREFIX +
//
// IMPORTANT : toutes les commandes utilisent +
// au lieu de /
// ============================================================

client.on(
    "messageCreate",
    async message => {

        if (
            message.author.bot ||
            !message.guild ||
            !message.content.startsWith(PREFIX)
        ) {
            return;
        }

        const args =
            message.content
                .slice(PREFIX.length)
                .trim()
                .split(/\s+/);

        const command =
            args.shift()
                ?.toLowerCase();

        if (!command) {
            return;
        }

        try {

            // ------------------------------------------------
            // STATISTIQUES
            // ------------------------------------------------

            if (
                command === "stat"
            ) {
                return commandStat(
                    message
                );
            }

            if (
                command === "statconfig"
            ) {
                return commandStatConfig(
                    message,
                    args
                );
            }

            if (
                command === "stathour"
            ) {
                return commandStatHour(
                    message,
                    args
                );
            }

            // ------------------------------------------------
            // PERMISSIONS
            // ------------------------------------------------

            if (
                command === "perms" ||
                command === "permissions"
            ) {
                return commandPerms(
                    message
                );
            }

            // ------------------------------------------------
            // VARIABLES
            // ------------------------------------------------

            if (
                command === "variables"
            ) {
                return commandVariables(
                    message
                );
            }

            // ------------------------------------------------
            // BIENVENUE
            // ------------------------------------------------

            if (
                command === "welcome"
            ) {

                const sub =
                    args[0]?.toLowerCase();

                if (
                    sub === "channel"
                ) {
                    return commandWelcomeChannel(
                        message
                    );
                }

                if (
                    sub === "message"
                ) {
                    return commandWelcomeMessage(
                        message,
                        args
                    );
                }

                if (
                    sub === "image"
                ) {
                    return commandWelcomeImage(
                        message,
                        args
                    );
                }

                if (
                    sub === "reset"
                ) {
                    return commandWelcomeReset(
                        message
                    );
                }

                if (
                    sub === "test"
                ) {
                    return commandWelcomeTest(
                        message
                    );
                }

                return commandWelcome(
                    message
                );
            }

            // ------------------------------------------------
            // TICKETS
            // ------------------------------------------------

            if (
                command === "ticket"
            ) {

                const sub =
                    args[0]?.toLowerCase();

                if (
                    sub === "panel"
                ) {
                    return commandTicketPanel(
                        message
                    );
                }

                if (
                    sub === "config"
                ) {
                    return commandTicketConfig(
                        message
                    );
                }

                if (
                    sub === "add"
                ) {
                    return commandTicketAdd(
                        message
                    );
                }

                if (
                    sub === "remove"
                ) {
                    return commandTicketRemove(
                        message
                    );
                }

                if (
                    sub === "claim"
                ) {
                    return commandTicketClaim(
                        message
                    );
                }

                if (
                    sub === "unclaim"
                ) {
                    return commandTicketUnclaim(
                        message
                    );
                }

                if (
                    sub === "close"
                ) {
                    return commandTicketClose(
                        message
                    );
                }

                if (
                    sub === "rename"
                ) {
                    return commandTicketRename(
                        message,
                        args
                    );
                }

                return message.reply(
                    "❌ Sous-commande ticket inconnue."
                );
            }

            // ------------------------------------------------
            // MODÉRATION
            // ------------------------------------------------

            if (
                command === "warn"
            ) {
                return commandWarn(
                    message,
                    args
                );
            }

            if (
                command === "warnings"
            ) {
                return commandWarnings(
                    message
                );
            }

            if (
                command === "kick"
            ) {
                return commandKick(
                    message,
                    args
                );
            }

            if (
                command === "ban"
            ) {
                return commandBan(
                    message,
                    args
                );
            }

            if (
                command === "clear"
            ) {
                return commandClear(
                    message,
                    args
                );
            }

            if (
                command === "snipe"
            ) {
                return commandSnipe(
                    message
                );
            }

            if (
                command === "userinfo"
            ) {
                return commandUserInfo(
                    message
                );
            }

            if (
                command === "serverinfo"
            ) {
                return commandServerInfo(
                    message
                );
            }

        } catch (error) {

            console.error(
                error
            );

            await message.reply(
                "❌ Une erreur est survenue pendant l'exécution de la commande."
            ).catch(
                () => {}
            );
        }
    }
);

// ============================================================
// CONNEXION
// ============================================================

client.login(
    TOKEN
);