npm install discord.js
const {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    SlashCommandBuilder,
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
    config: {}
};

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(defaultDB, null, 2)
    );
}

function loadDB() {
    try {
        return JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );
    } catch {
        return JSON.parse(
            JSON.stringify(defaultDB)
        );
    }
}

function saveDB(db) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(db, null, 2)
    );
}

let db = loadDB();

// ============================================================
// CONFIGURATION D'UN SERVEUR
// ============================================================

function guildConfig(guildId) {
    if (!db.config[guildId]) {
        db.config[guildId] = {};
        saveDB(db);
    }

    return db.config[guildId];
}

// ============================================================
// HISTORIQUE DES SANCTIONS
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

    if (!db.sanctions[guildId][userId]) {
        db.sanctions[guildId][userId] = [];
    }

    db.sanctions[guildId][userId].push({
        type: type,
        moderatorId: moderatorId,
        reason: reason,
        date: Date.now()
    });

    saveDB(db);
}

// ============================================================
// COMMANDES SLASH
// ============================================================

const commands = [

    // -------------------------
    // MODÉRATION
    // -------------------------

    new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Bannir un membre")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre à bannir")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("raison")
                .setDescription("Raison du bannissement")
        ),

    new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Expulser un membre")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre à expulser")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("raison")
                .setDescription("Raison")
        ),

    new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Avertir un membre")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("raison")
                .setDescription("Raison")
        ),

    new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("Voir les avertissements d'un membre")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("unwarn")
        .setDescription("Retirer un avertissement")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("numero")
                .setDescription("Numéro du warn")
                .setRequired(true)
                .setMinValue(1)
        ),

    new SlashCommandBuilder()
        .setName("mute")
        .setDescription("Mute un membre")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("minutes")
                .setDescription("Durée en minutes")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(40320)
        )
        .addStringOption(option =>
            option
                .setName("raison")
                .setDescription("Raison")
        ),

    new SlashCommandBuilder()
        .setName("unmute")
        .setDescription("Retirer le mute")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout un membre")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName("minutes")
                .setDescription("Durée en minutes")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(40320)
        )
        .addStringOption(option =>
            option
                .setName("raison")
                .setDescription("Raison")
        ),

    new SlashCommandBuilder()
        .setName("untimeout")
        .setDescription("Retirer le timeout")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Supprimer des messages")
        .addIntegerOption(option =>
            option
                .setName("nombre")
                .setDescription("Nombre de messages")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),

    new SlashCommandBuilder()
        .setName("purge")
        .setDescription("Supprimer plusieurs messages")
        .addIntegerOption(option =>
            option
                .setName("nombre")
                .setDescription("Nombre")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),

    new SlashCommandBuilder()
        .setName("lock")
        .setDescription("Verrouiller le salon"),

    new SlashCommandBuilder()
        .setName("unlock")
        .setDescription("Déverrouiller le salon"),

    new SlashCommandBuilder()
        .setName("slowmode")
        .setDescription("Modifier le slowmode")
        .addIntegerOption(option =>
            option
                .setName("secondes")
                .setDescription("Durée en secondes")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(21600)
        ),

    new SlashCommandBuilder()
        .setName("unban")
        .setDescription("Débannir un utilisateur")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("ID Discord")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("nickname")
        .setDescription("Modifier le pseudo")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("pseudo")
                .setDescription("Nouveau pseudo")
        ),

    // -------------------------
    // RÔLES
    // -------------------------

    new SlashCommandBuilder()
        .setName("role")
        .setDescription("Gérer les rôles")
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Ajouter un rôle")
                .addUserOption(option =>
                    option
                        .setName("membre")
                        .setDescription("Membre")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Rôle")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Retirer un rôle")
                .addUserOption(option =>
                    option
                        .setName("membre")
                        .setDescription("Membre")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Rôle")
                        .setRequired(true)
                )
        ),

    new SlashCommandBuilder()
        .setName("rank")
        .setDescription("Monter un membre au rôle supérieur")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName("derank")
        .setDescription("Descendre un membre au rôle inférieur")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        ),

    // -------------------------
    // UTILITAIRES
    // -------------------------

    new SlashCommandBuilder()
        .setName("snipe")
        .setDescription("Voir le dernier message supprimé"),

    new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("Voir les informations d'un membre")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
        ),

    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("Voir les informations du serveur"),

    // -------------------------
    // STATISTIQUES
    // -------------------------

    new SlashCommandBuilder()
        .setName("stat")
        .setDescription("Voir les statistiques du serveur")
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Configurer le salon automatique")
                .addChannelOption(option =>
                    option
                        .setName("salon")
                        .setDescription("Salon des statistiques")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("heure")
                .setDescription("Modifier l'heure automatique")
                .addStringOption(option =>
                    option
                        .setName("heure")
                        .setDescription("Format HH:MM, exemple 23:00")
                        .setRequired(true)
                )
        ),

    // -------------------------
    // TICKETS
    // -------------------------

    new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Gestion des tickets")
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Créer le panneau de tickets")
                .addChannelOption(option =>
                    option
                        .setName("salon")
                        .setDescription("Salon où envoyer le panneau")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("titre")
                        .setDescription("Titre du panneau")
                )
                .addStringOption(option =>
                    option
                        .setName("description")
                        .setDescription("Description du panneau")
                )
                .addStringOption(option =>
                    option
                        .setName("image")
                        .setDescription("URL de l'image")
                )
        ),

    // -------------------------
    // JDEMBED
    // -------------------------

    new SlashCommandBuilder()
        .setName("jembed")
        .setDescription("Créer un embed personnalisé"),

    // -------------------------
    // GIVEAWAY
    // -------------------------

    new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Gestion des giveaways")
        .addSubcommand(subcommand =>
            subcommand
                .setName("start")
                .setDescription("Créer un giveaway")
                .addIntegerOption(option =>
                    option
                        .setName("minutes")
                        .setDescription("Durée en minutes")
                        .setRequired(true)
                        .setMinValue(1)
                )
                .addIntegerOption(option =>
                    option
                        .setName("gagnants")
                        .setDescription("Nombre de gagnants")
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(50)
                )
                .addStringOption(option =>
                    option
                        .setName("prix")
                        .setDescription("Prix du giveaway")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("end")
                .setDescription("Terminer un giveaway")
                .addStringOption(option =>
                    option
                        .setName("message_id")
                        .setDescription("ID du message")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("reroll")
                .setDescription("Relancer le tirage")
                .addStringOption(option =>
                    option
                        .setName("message_id")
                        .setDescription("ID du message")
                        .setRequired(true)
                )
        ),

    // -------------------------
    // AUTOROLE
    // -------------------------

    new SlashCommandBuilder()
        .setName("autorole")
        .setDescription("Configurer l'auto-rôle")
        .addRoleOption(option =>
            option
                .setName("role")
                .setDescription("Rôle automatique")
                .setRequired(true)
        ),

    // -------------------------
    // BIENVENUE
    // -------------------------

    new SlashCommandBuilder()
        .setName("welcome")
        .setDescription("Configurer le système de bienvenue")
        .addChannelOption(option =>
            option
                .setName("salon")
                .setDescription("Salon de bienvenue")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("message")
                .setDescription("Message de bienvenue")
        )
        .addStringOption(option =>
            option
                .setName("image")
                .setDescription("URL de l'image")
        ),

    // -------------------------
    // LOGS
    // -------------------------

    new SlashCommandBuilder()
        .setName("logs")
        .setDescription("Configurer les logs")
        .addChannelOption(option =>
            option
                .setName("salon")
                .setDescription("Salon des logs")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        ),

    // -------------------------
    // SANCTIONS
    // -------------------------

    new SlashCommandBuilder()
        .setName("sanctions")
        .setDescription("Voir l'historique des sanctions")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        )

].map(command => command.toJSON());

// ============================================================
// FIN DE LA PARTIE 1
// ============================================================
// ============================================================
// OUTILS
// ============================================================

function hasPermission(interaction, permission) {
    return interaction.member.permissions.has(permission);
}

async function requirePermission(interaction, permission) {
    if (!hasPermission(interaction, permission)) {
        await interaction.reply({
            content: "❌ Tu n'as pas la permission nécessaire.",
            ephemeral: true
        });

        return false;
    }

    return true;
}

// ============================================================
// LOGS
// ============================================================

async function sendLog(guild, title, description) {
    const config = guildConfig(guild.id);

    if (!config.logsChannelId) return;

    const channel = guild.channels.cache.get(
        config.logsChannelId
    );

    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor("#5865F2")
        .setTimestamp();

    await channel.send({
        embeds: [embed]
    }).catch(() => {});
}

// ============================================================
// EMBED DES STATISTIQUES
// ============================================================

function statisticsEmbed(guild) {

    const membres = guild.memberCount;

    const enLigne = guild.members.cache.filter(
        member =>
            member.presence &&
            member.presence.status !== "offline"
    ).size;

    const enVocal = guild.members.cache.filter(
        member =>
            member.voice &&
            member.voice.channel
    ).size;

    const boosts =
        guild.premiumSubscriptionCount || 0;

    const enStream = guild.members.cache.filter(
        member =>
            member.voice &&
            member.voice.streaming
    ).size;

    const embed = new EmbedBuilder()
        .setTitle("Hirosaki 🎆 Statistiques !")
        .setDescription(
            `Membre : **${membres}**\n` +
            `En ligne : **${enLigne}**\n` +
            `En vocal : **${enVocal}**\n` +
            `Boost : **${boosts}**\n` +
            `En stream : **${enStream}**`
        )
        .setColor("#5865F2")
        .setTimestamp();

    const icon = guild.iconURL({
        dynamic: true,
        size: 512
    });

    if (icon) {
        embed.setThumbnail(icon);
    }

    return embed;
}

// ============================================================
// STATISTIQUES AUTOMATIQUES
// ============================================================

async function updateAutomaticStats(guild) {

    const config = guildConfig(guild.id);

    if (!config.statChannelId) {
        return;
    }

    const channel =
        guild.channels.cache.get(
            config.statChannelId
        );

    if (!channel) {
        return;
    }

    const embed =
        statisticsEmbed(guild);

    // Si le message existe déjà,
    // on le modifie.
    if (config.statMessageId) {

        try {

            const message =
                await channel.messages.fetch(
                    config.statMessageId
                );

            await message.edit({
                embeds: [embed]
            });

            return;

        } catch {
            // Le message n'existe plus.
        }
    }

    // Sinon, on crée un nouveau message.
    const message =
        await channel.send({
            embeds: [embed]
        });

    config.statMessageId =
        message.id;

    saveDB(db);
}

// ============================================================
// READY
// ============================================================

client.once("ready", async () => {

    console.log(
        `✅ ${client.user.tag} est connecté !`
    );

    try {

        await client.application.commands.set(
            commands
        );

        console.log(
            "✅ Commandes slash enregistrées !"
        );

    } catch (error) {

        console.error(
            "❌ Erreur lors de l'enregistrement des commandes :",
            error
        );
    }

    client.user.setActivity(
        "Gestion du serveur",
        {
            type: 3
        }
    );

    // ========================================================
    // HORLOGE DES STATISTIQUES
    // ========================================================

    setInterval(async () => {

        const now = new Date();

        const heureActuelle =
            `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

        for (
            const guild
            of client.guilds.cache.values()
        ) {

            const config =
                guildConfig(guild.id);

            // 23:00 par défaut.
            const heure =
                config.statHour || "23:00";

            if (
                heureActuelle === heure &&
                config.statLastRun !==
                    now.toISOString().slice(0, 10)
            ) {

                config.statLastRun =
                    now.toISOString().slice(0, 10);

                saveDB(db);

                await updateAutomaticStats(
                    guild
                ).catch(console.error);
            }
        }

    }, 60 * 1000);
});

// ============================================================
// NOUVEAUX MEMBRES
// ============================================================

client.on(
    "guildMemberAdd",
    async member => {

        const config =
            guildConfig(member.guild.id);

        // ====================================================
        // AUTOROLE
        // ====================================================

        if (config.autoRoleId) {

            const role =
                member.guild.roles.cache.get(
                    config.autoRoleId
                );

            const botMember =
                member.guild.members.me;

            if (
                role &&
                botMember &&
                !role.managed &&
                role.position <
                    botMember.roles.highest.position
            ) {

                await member.roles
                    .add(role)
                    .catch(() => {});
            }
        }

        // ====================================================
        // BIENVENUE
        // ====================================================

        if (config.welcomeChannelId) {

            const channel =
                member.guild.channels.cache.get(
                    config.welcomeChannelId
                );

            if (channel) {

                let message =
                    config.welcomeMessage ||
                    "Bienvenue {user} sur **{server}** !";

                message =
                    message
                        .replaceAll(
                            "{user}",
                            `<@${member.id}>`
                        )
                        .replaceAll(
                            "{server}",
                            member.guild.name
                        );

                const embed =
                    new EmbedBuilder()
                        .setDescription(message)
                        .setThumbnail(
                            member.user
                                .displayAvatarURL({
                                    dynamic: true,
                                    size: 512
                                })
                        )
                        .setColor("#5865F2")
                        .setTimestamp();

                if (
                    config.welcomeImage
                ) {
                    embed.setImage(
                        config.welcomeImage
                    );
                }

                await channel.send({
                    embeds: [embed]
                }).catch(() => {});
            }
        }

        // ====================================================
        // LOG
        // ====================================================

        await sendLog(
            member.guild,
            "Membre arrivé",
            `${member} a rejoint le serveur.`
        );
    }
);

// ============================================================
// MESSAGE SUPPRIMÉ
// ============================================================

client.on(
    "messageDelete",
    async message => {

        if (
            !message.guild ||
            message.author?.bot
        ) {
            return;
        }

        db.snipe[
            message.channel.id
        ] = {

            content:
                message.content ||
                "*Message sans texte*",

            authorId:
                message.author.id,

            authorTag:
                message.author.tag,

            avatar:
                message.author
                    .displayAvatarURL({
                        dynamic: true
                    }),

            date: Date.now()
        };

        saveDB(db);

        await sendLog(
            message.guild,
            "Message supprimé",
            `**Auteur :** <@${message.author.id}>\n` +
            `**Salon :** ${message.channel}\n` +
            `**Contenu :** ${message.content || "*vide*"}`
        );
    }
);

// ============================================================
// MESSAGE MODIFIÉ
// ============================================================

client.on(
    "messageUpdate",
    async (oldMessage, newMessage) => {

        if (
            !oldMessage.guild ||
            oldMessage.author?.bot
        ) {
            return;
        }

        if (
            oldMessage.content ===
            newMessage.content
        ) {
            return;
        }

        await sendLog(
            oldMessage.guild,
            "Message modifié",
            `**Auteur :** <@${oldMessage.author.id}>\n` +
            `**Salon :** ${oldMessage.channel}\n\n` +
            `**Avant :** ${oldMessage.content || "*vide*"}\n` +
            `**Après :** ${newMessage.content || "*vide*"}`
        );
    }
);

// ============================================================
// FIN DE LA PARTIE 2
// ============================================================
// ============================================================
// INTERACTIONS
// ============================================================

client.on("interactionCreate", async interaction => {

    try {

        // ====================================================
        // BOUTONS
        // ====================================================

        if (interaction.isButton()) {

            // ------------------------------------------------
            // OUVRIR UN TICKET
            // ------------------------------------------------

            if (interaction.customId === "open_ticket") {

                const guild = interaction.guild;

                // Vérifie si le membre possède déjà un ticket
                const existingTicket =
                    guild.channels.cache.find(
                        channel =>
                            channel.type === ChannelType.GuildText &&
                            channel.topic ===
                                `ticket:${interaction.user.id}`
                    );

                if (existingTicket) {

                    return interaction.reply({
                        content:
                            `❌ Tu as déjà un ticket ouvert : ${existingTicket}`,
                        ephemeral: true
                    });
                }

                // Création du salon
                const ticketChannel =
                    await guild.channels.create({

                        name:
                            `ticket-${interaction.user.username}`
                                .toLowerCase()
                                .replace(
                                    /[^a-z0-9-]/g,
                                    ""
                                )
                                .slice(0, 90),

                        type:
                            ChannelType.GuildText,

                        topic:
                            `ticket:${interaction.user.id}`,

                        permissionOverwrites: [

                            // Tout le monde ne voit pas le ticket
                            {
                                id:
                                    guild.roles.everyone.id,

                                deny: [
                                    PermissionFlagsBits.ViewChannel
                                ]
                            },

                            // Le créateur du ticket
                            {
                                id:
                                    interaction.user.id,

                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.ReadMessageHistory
                                ]
                            },

                            // Le bot
                            {
                                id:
                                    guild.members.me.id,

                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.ManageChannels,
                                    PermissionFlagsBits.ReadMessageHistory
                                ]
                            }
                        ]
                    });

                // Bouton fermer
                const closeRow =
                    new ActionRowBuilder()
                        .addComponents(

                            new ButtonBuilder()
                                .setCustomId(
                                    "close_ticket"
                                )
                                .setLabel(
                                    "Fermer le ticket"
                                )
                                .setStyle(
                                    ButtonStyle.Danger
                                )
                        );

                // Embed du ticket
                const ticketEmbed =
                    new EmbedBuilder()
                        .setTitle(
                            "🎫 Ticket"
                        )
                        .setDescription(
                            "Explique ta demande ici. " +
                            "Un membre du staff viendra te répondre."
                        )
                        .setColor(
                            "#5865F2"
                        );

                await ticketChannel.send({

                    content:
                        `${interaction.user}`,

                    embeds: [
                        ticketEmbed
                    ],

                    components: [
                        closeRow
                    ]
                });

                await interaction.reply({

                    content:
                        `✅ Ton ticket a été créé : ${ticketChannel}`,

                    ephemeral: true
                });

                await sendLog(
                    guild,
                    "Ticket créé",
                    `${interaction.user} a créé ${ticketChannel}.`
                );

                return;
            }

            // ------------------------------------------------
            // FERMER UN TICKET
            // ------------------------------------------------

            if (
                interaction.customId ===
                "close_ticket"
            ) {

                if (
                    !interaction.member.permissions.has(
                        PermissionsBitField.Flags.ManageChannels
                    )
                ) {

                    return interaction.reply({

                        content:
                            "❌ Tu n'as pas la permission de fermer ce ticket.",

                        ephemeral: true
                    });
                }

                await interaction.reply(
                    "🔒 Fermeture du ticket..."
                );

                await sendLog(
                    interaction.guild,
                    "Ticket fermé",
                    `${interaction.channel} a été fermé par ${interaction.user}.`
                );

                setTimeout(() => {

                    interaction.channel
                        .delete()
                        .catch(() => {});

                }, 1500);

                return;
            }

            // ------------------------------------------------
            // PARTICIPATION GIVEAWAY
            // ------------------------------------------------

            if (
                interaction.customId.startsWith(
                    "giveaway_join:"
                )
            ) {

                const messageId =
                    interaction.customId.split(":")[1];

                const config =
                    guildConfig(
                        interaction.guild.id
                    );

                if (!config.giveaways) {
                    config.giveaways = {};
                }

                const giveaway =
                    config.giveaways[messageId];

                if (!giveaway) {

                    return interaction.reply({

                        content:
                            "❌ Ce giveaway n'existe plus.",

                        ephemeral: true
                    });
                }

                if (giveaway.ended) {

                    return interaction.reply({

                        content:
                            "❌ Ce giveaway est terminé.",

                        ephemeral: true
                    });
                }

                // Quitter le giveaway
                if (
                    giveaway.entries.includes(
                        interaction.user.id
                    )
                ) {

                    giveaway.entries =
                        giveaway.entries.filter(
                            id =>
                                id !==
                                interaction.user.id
                        );

                    saveDB(db);

                    return interaction.reply({

                        content:
                            "❌ Tu as quitté le giveaway.",

                        ephemeral: true
                    });
                }

                // Rejoindre le giveaway
                giveaway.entries.push(
                    interaction.user.id
                );

                saveDB(db);

                return interaction.reply({

                    content:
                        "🎉 Tu participes maintenant au giveaway !",

                    ephemeral: true
                });
            }
        }

        // ====================================================
        // MODALS
        // ====================================================

        if (interaction.isModalSubmit()) {

            // ------------------------------------------------
            // JDEMBED
            // ------------------------------------------------

            if (
                interaction.customId ===
                "jembed_modal"
            ) {

                const title =
                    interaction.fields.getTextInputValue(
                        "title"
                    );

                const description =
                    interaction.fields.getTextInputValue(
                        "description"
                    );

                const color =
                    interaction.fields.getTextInputValue(
                        "color"
                    ) || "#5865F2";

                const image =
                    interaction.fields.getTextInputValue(
                        "image"
                    );

                const embed =
                    new EmbedBuilder()
                        .setTitle(title)
                        .setDescription(description)
                        .setColor(color);

                if (image) {
                    embed.setImage(image);
                }

                await interaction.reply({

                    embeds: [
                        embed
                    ]
                });

                return;
            }
        }

        // ====================================================
        // COMMANDES SLASH
        // ====================================================

        if (
            !interaction.isChatInputCommand()
        ) {
            return;
        }

        const command =
            interaction.commandName;

        // ====================================================
        // STAT
        // ====================================================

        if (command === "stat") {

            const subcommand =
                interaction.options
                    .getSubcommand(false);

            // /stat simple
            if (!subcommand) {

                return interaction.reply({

                    embeds: [
                        statisticsEmbed(
                            interaction.guild
                        )
                    ]
                });
            }

            // ------------------------------------------------
            // /stat setup
            // ------------------------------------------------

            if (
                subcommand ===
                "setup"
            ) {

                if (
                    !await requirePermission(
                        interaction,
                        PermissionsBitField.Flags.ManageGuild
                    )
                ) {
                    return;
                }

                const channel =
                    interaction.options.getChannel(
                        "salon"
                    );

                const config =
                    guildConfig(
                        interaction.guild.id
                    );

                config.statChannelId =
                    channel.id;

                saveDB(db);

                await updateAutomaticStats(
                    interaction.guild
                );

                return interaction.reply({

                    content:
                        `✅ Les statistiques automatiques seront dans ${channel}.\n` +
                        `🕚 Heure actuelle : **${config.statHour || "23:00"}**`
                });
            }

            // ------------------------------------------------
            // /stat heure
            // ------------------------------------------------

            if (
                subcommand ===
                "heure"
            ) {

                if (
                    !await requirePermission(
                        interaction,
                        PermissionsBitField.Flags.ManageGuild
                    )
                ) {
                    return;
                }

                const heure =
                    interaction.options.getString(
                        "heure"
                    );

                // Vérifie HH:MM
                if (
                    !/^(?:[01]\d|2[0-3]):[0-5]\d$/
                        .test(heure)
                ) {

                    return interaction.reply({

                        content:
                            "❌ Format invalide. Exemple : `23:00`.",

                        ephemeral: true
                    });
                }

                const config =
                    guildConfig(
                        interaction.guild.id
                    );

                config.statHour =
                    heure;

                saveDB(db);

                return interaction.reply({

                    content:
                        `✅ Les statistiques automatiques seront mises à jour à **${heure}** chaque jour.`
                });
            }
        }

        // ====================================================
        // BAN
        // ====================================================

        if (command === "ban") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.BanMembers
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            const reason =
                interaction.options.getString(
                    "raison"
                ) ||
                "Aucune raison fournie";

            if (!member) {

                return interaction.reply({

                    content:
                        "❌ Membre introuvable.",

                    ephemeral: true
                });
            }

            if (!member.bannable) {

                return interaction.reply({

                    content:
                        "❌ Je ne peux pas bannir ce membre.",

                    ephemeral: true
                });
            }

            await member.ban({
                reason: reason
            });

            addSanction(
                interaction.guild.id,
                member.id,
                "Ban",
                interaction.user.id,
                reason
            );

            await interaction.reply(

                `🔨 **${member.user.tag}** a été banni.\n` +
                `Raison : ${reason}`
            );

            await sendLog(
                interaction.guild,
                "Ban",
                `${member.user.tag} a été banni par ${interaction.user}.\nRaison : ${reason}`
            );

            return;
        }

        // ====================================================
        // UNBAN
        // ====================================================

        if (command === "unban") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.BanMembers
                )
            ) {
                return;
            }

            const id =
                interaction.options.getString(
                    "id"
                );

            try {

                await interaction.guild.members.unban(
                    id
                );

                await interaction.reply(
                    `✅ <@${id}> a été débanni.`
                );

            } catch {

                await interaction.reply({

                    content:
                        "❌ Impossible de débannir cet utilisateur.",

                    ephemeral: true
                });
            }

            return;
        }

        // ====================================================
        // KICK
        // ====================================================

        if (command === "kick") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.KickMembers
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            const reason =
                interaction.options.getString(
                    "raison"
                ) ||
                "Aucune raison fournie";

            if (!member) {

                return interaction.reply({

                    content:
                        "❌ Membre introuvable.",

                    ephemeral: true
                });
            }

            if (!member.kickable) {

                return interaction.reply({

                    content:
                        "❌ Je ne peux pas expulser ce membre.",

                    ephemeral: true
                });
            }

            await member.kick(
                reason
            );

            addSanction(
                interaction.guild.id,
                member.id,
                "Kick",
                interaction.user.id,
                reason
            );

            await interaction.reply(

                `👢 **${member.user.tag}** a été expulsé.\n` +
                `Raison : ${reason}`
            );

            await sendLog(
                interaction.guild,
                "Kick",
                `${member.user.tag} a été expulsé par ${interaction.user}.\nRaison : ${reason}`
            );

            return;
        }

        // ====================================================
        // FIN PARTIE 3
        // ====================================================
                // ====================================================
        // WARN
        // ====================================================

        if (command === "warn") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ModerateMembers
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            const reason =
                interaction.options.getString(
                    "raison"
                ) ||
                "Aucune raison fournie";

            if (!member) {
                return interaction.reply({
                    content: "❌ Membre introuvable.",
                    ephemeral: true
                });
            }

            if (member.user.bot) {
                return interaction.reply({
                    content: "❌ Tu ne peux pas warn un bot.",
                    ephemeral: true
                });
            }

            if (!db.warnings[interaction.guild.id]) {
                db.warnings[interaction.guild.id] = {};
            }

            if (!db.warnings[interaction.guild.id][member.id]) {
                db.warnings[interaction.guild.id][member.id] = [];
            }

            db.warnings[interaction.guild.id][member.id].push({
                moderatorId: interaction.user.id,
                reason: reason,
                date: Date.now()
            });

            addSanction(
                interaction.guild.id,
                member.id,
                "Warn",
                interaction.user.id,
                reason
            );

            saveDB(db);

            await interaction.reply(
                `⚠️ **${member.user.tag}** a reçu un avertissement.\n` +
                `Raison : ${reason}`
            );

            await sendLog(
                interaction.guild,
                "Avertissement",
                `${member.user.tag} a reçu un warn par ${interaction.user}.\n` +
                `Raison : ${reason}`
            );

            return;
        }

        // ====================================================
        // WARNINGS
        // ====================================================

        if (command === "warnings") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ModerateMembers
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            if (!member) {
                return interaction.reply({
                    content: "❌ Membre introuvable.",
                    ephemeral: true
                });
            }

            const warnings =
                db.warnings[
                    interaction.guild.id
                ]?.[member.id] || [];

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        `⚠️ Avertissements de ${member.user.tag}`
                    )
                    .setColor("#FEE75C");

            if (warnings.length === 0) {

                embed.setDescription(
                    "Aucun avertissement."
                );

            } else {

                embed.setDescription(
                    warnings
                        .map(
                            (warn, index) =>
                                `**#${index + 1}** — ${warn.reason}\n` +
                                `Modérateur : <@${warn.moderatorId}>\n` +
                                `Date : <t:${Math.floor(warn.date / 1000)}:f>`
                        )
                        .join("\n\n")
                );
            }

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

            return;
        }

        // ====================================================
        // UNWARN
        // ====================================================

        if (command === "unwarn") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ModerateMembers
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            const numero =
                interaction.options.getInteger(
                    "numero"
                );

            const warnings =
                db.warnings[
                    interaction.guild.id
                ]?.[member.id];

            if (
                !warnings ||
                warnings.length < numero
            ) {

                return interaction.reply({
                    content:
                        "❌ Cet avertissement n'existe pas.",
                    ephemeral: true
                });
            }

            warnings.splice(
                numero - 1,
                1
            );

            saveDB(db);

            await interaction.reply(
                `✅ L'avertissement **#${numero}** de ${member} a été retiré.`
            );

            return;
        }

        // ====================================================
        // MUTE
        // ====================================================

        if (command === "mute") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ModerateMembers
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            const minutes =
                interaction.options.getInteger(
                    "minutes"
                );

            const reason =
                interaction.options.getString(
                    "raison"
                ) ||
                "Aucune raison fournie";

            if (!member) {

                return interaction.reply({
                    content:
                        "❌ Membre introuvable.",
                    ephemeral: true
                });
            }

            if (!member.moderatable) {

                return interaction.reply({
                    content:
                        "❌ Je ne peux pas mute ce membre.",
                    ephemeral: true
                });
            }

            await member.timeout(
                minutes * 60 * 1000,
                reason
            );

            addSanction(
                interaction.guild.id,
                member.id,
                "Mute",
                interaction.user.id,
                reason
            );

            await interaction.reply(
                `🔇 **${member.user.tag}** a été mute pendant **${minutes} minutes**.\n` +
                `Raison : ${reason}`
            );

            await sendLog(
                interaction.guild,
                "Mute",
                `${member.user.tag} a été mute par ${interaction.user}.\n` +
                `Durée : ${minutes} minutes\n` +
                `Raison : ${reason}`
            );

            return;
        }

        // ====================================================
        // UNMUTE
        // ====================================================

        if (command === "unmute") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ModerateMembers
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Membre introuvable.",
                    ephemeral: true
                });
            }

            await member.timeout(
                null,
                `Unmute par ${interaction.user.tag}`
            );

            await interaction.reply(
                `🔊 ${member} n'est plus mute.`
            );

            return;
        }

        // ====================================================
        // TIMEOUT
        // ====================================================

        if (command === "timeout") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ModerateMembers
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            const minutes =
                interaction.options.getInteger(
                    "minutes"
                );

            const reason =
                interaction.options.getString(
                    "raison"
                ) ||
                "Aucune raison fournie";

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Membre introuvable.",
                    ephemeral: true
                });
            }

            if (!member.moderatable) {
                return interaction.reply({
                    content:
                        "❌ Je ne peux pas timeout ce membre.",
                    ephemeral: true
                });
            }

            await member.timeout(
                minutes * 60 * 1000,
                reason
            );

            addSanction(
                interaction.guild.id,
                member.id,
                "Timeout",
                interaction.user.id,
                reason
            );

            await interaction.reply(
                `⏳ ${member} a été timeout pendant **${minutes} minutes**.\n` +
                `Raison : ${reason}`
            );

            await sendLog(
                interaction.guild,
                "Timeout",
                `${member.user.tag} a été timeout par ${interaction.user}.\n` +
                `Durée : ${minutes} minutes\n` +
                `Raison : ${reason}`
            );

            return;
        }

        // ====================================================
        // UNTIMEOUT
        // ====================================================

        if (command === "untimeout") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ModerateMembers
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Membre introuvable.",
                    ephemeral: true
                });
            }

            await member.timeout(
                null,
                `Timeout retiré par ${interaction.user.tag}`
            );

            await interaction.reply(
                `✅ Le timeout de ${member} a été retiré.`
            );

            return;
        }

        // ====================================================
        // CLEAR
        // ====================================================

        if (command === "clear") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageMessages
                )
            ) {
                return;
            }

            const nombre =
                interaction.options.getInteger(
                    "nombre"
                );

            const deleted =
                await interaction.channel.bulkDelete(
                    nombre,
                    true
                );

            await interaction.reply({

                content:
                    `🧹 **${deleted.size}** message(s) supprimé(s).`,

                ephemeral: true
            });

            return;
        }

        // ====================================================
        // PURGE
        // ====================================================

        if (command === "purge") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageMessages
                )
            ) {
                return;
            }

            const nombre =
                interaction.options.getInteger(
                    "nombre"
                );

            const deleted =
                await interaction.channel.bulkDelete(
                    nombre,
                    true
                );

            await interaction.reply({

                content:
                    `🧹 **${deleted.size}** message(s) supprimé(s).`,

                ephemeral: true
            });

            return;
        }

        // ====================================================
        // LOCK
        // ====================================================

        if (command === "lock") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageChannels
                )
            ) {
                return;
            }

            await interaction.channel.permissionOverwrites.edit(
                interaction.guild.roles.everyone,
                {
                    SendMessages: false
                }
            );

            await interaction.reply(
                "🔒 Salon verrouillé."
            );

            await sendLog(
                interaction.guild,
                "Salon verrouillé",
                `${interaction.channel} a été verrouillé par ${interaction.user}.`
            );

            return;
        }

        // ====================================================
        // UNLOCK
        // ====================================================

        if (command === "unlock") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageChannels
                )
            ) {
                return;
            }

            await interaction.channel.permissionOverwrites.edit(
                interaction.guild.roles.everyone,
                {
                    SendMessages: null
                }
            );

            await interaction.reply(
                "🔓 Salon déverrouillé."
            );

            return;
        }

        // ====================================================
        // SLOWMODE
        // ====================================================

        if (command === "slowmode") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageChannels
                )
            ) {
                return;
            }

            const secondes =
                interaction.options.getInteger(
                    "secondes"
                );

            await interaction.channel.setRateLimitPerUser(
                secondes
            );

            await interaction.reply(
                `🐌 Slowmode réglé sur **${secondes} secondes**.`
            );

            return;
        }

        // ====================================================
        // FIN PARTIE 4
        // ====================================================
              // ====================================================
        // NICKNAME
        // ====================================================

        if (command === "nickname") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageNicknames
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember("membre");

            const pseudo =
                interaction.options.getString("pseudo");

            if (!member) {
                return interaction.reply({
                    content: "❌ Membre introuvable.",
                    ephemeral: true
                });
            }

            if (!member.manageable) {
                return interaction.reply({
                    content:
                        "❌ Je ne peux pas modifier le pseudo de ce membre.",
                    ephemeral: true
                });
            }

            await member.setNickname(
                pseudo || null
            );

            await interaction.reply(
                pseudo
                    ? `✅ Le pseudo de ${member} est maintenant **${pseudo}**.`
                    : `✅ Le pseudo de ${member} a été réinitialisé.`
            );

            return;
        }

        // ====================================================
        // ROLE ADD / REMOVE
        // ====================================================

        if (command === "role") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageRoles
                )
            ) {
                return;
            }

            const subcommand =
                interaction.options.getSubcommand();

            const member =
                interaction.options.getMember("membre");

            const role =
                interaction.options.getRole("role");

            if (!member || !role) {
                return interaction.reply({
                    content:
                        "❌ Membre ou rôle introuvable.",
                    ephemeral: true
                });
            }

            const botMember =
                interaction.guild.members.me;

            if (
                role.managed ||
                role.position >=
                    botMember.roles.highest.position
            ) {
                return interaction.reply({
                    content:
                        "❌ Je ne peux pas gérer ce rôle. Il doit être inférieur à mon rôle le plus élevé.",
                    ephemeral: true
                });
            }

            if (subcommand === "add") {

                await member.roles.add(role);

                await interaction.reply(
                    `✅ Le rôle ${role} a été ajouté à ${member}.`
                );

            } else if (subcommand === "remove") {

                await member.roles.remove(role);

                await interaction.reply(
                    `✅ Le rôle ${role} a été retiré de ${member}.`
                );
            }

            return;
        }

        // ====================================================
        // RANK
        // ====================================================

        if (command === "rank") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageRoles
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Membre introuvable.",
                    ephemeral: true
                });
            }

            const botMember =
                interaction.guild.members.me;

            const roles =
                interaction.guild.roles.cache
                    .filter(role =>
                        !role.managed &&
                        role.id !==
                            interaction.guild.id &&
                        role.position <
                            botMember.roles.highest.position
                    )
                    .sort(
                        (a, b) =>
                            a.position - b.position
                    );

            const memberRoles =
                member.roles.cache
                    .filter(role =>
                        !role.managed &&
                        role.id !==
                            interaction.guild.id
                    )
                    .sort(
                        (a, b) =>
                            b.position - a.position
                    );

            const currentRole =
                memberRoles.first();

            if (!currentRole) {

                return interaction.reply({
                    content:
                        "❌ Ce membre n'a pas de rôle à faire monter.",
                    ephemeral: true
                });
            }

            const higherRoles =
                roles.filter(
                    role =>
                        role.position >
                        currentRole.position
                );

            const nextRole =
                higherRoles
                    .sort(
                        (a, b) =>
                            a.position - b.position
                    )
                    .first();

            if (!nextRole) {

                return interaction.reply({
                    content:
                        "❌ Ce membre est déjà au rang le plus élevé que je peux lui attribuer.",
                    ephemeral: true
                });
            }

            await member.roles.remove(
                currentRole
            );

            await member.roles.add(
                nextRole
            );

            await interaction.reply(
                `⬆️ ${member} est passé de ${currentRole} à ${nextRole}.`
            );

            await sendLog(
                interaction.guild,
                "Rank",
                `${member.user.tag} est passé de **${currentRole.name}** à **${nextRole.name}**.`
            );

            return;
        }

        // ====================================================
        // DERANK
        // ====================================================

        if (command === "derank") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageRoles
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Membre introuvable.",
                    ephemeral: true
                });
            }

            const botMember =
                interaction.guild.members.me;

            const roles =
                interaction.guild.roles.cache
                    .filter(role =>
                        !role.managed &&
                        role.id !==
                            interaction.guild.id &&
                        role.position <
                            botMember.roles.highest.position
                    )
                    .sort(
                        (a, b) =>
                            b.position - a.position
                    );

            const memberRoles =
                member.roles.cache
                    .filter(role =>
                        !role.managed &&
                        role.id !==
                            interaction.guild.id
                    )
                    .sort(
                        (a, b) =>
                            b.position - a.position
                    );

            const currentRole =
                memberRoles.first();

            if (!currentRole) {

                return interaction.reply({
                    content:
                        "❌ Ce membre n'a pas de rôle à faire descendre.",
                    ephemeral: true
                });
            }

            const lowerRoles =
                roles.filter(
                    role =>
                        role.position <
                        currentRole.position
                );

            const nextRole =
                lowerRoles.first();

            if (!nextRole) {

                return interaction.reply({
                    content:
                        "❌ Ce membre est déjà au rang le plus bas.",
                    ephemeral: true
                });
            }

            await member.roles.remove(
                currentRole
            );

            await member.roles.add(
                nextRole
            );

            await interaction.reply(
                `⬇️ ${member} est passé de ${currentRole} à ${nextRole}.`
            );

            await sendLog(
                interaction.guild,
                "Derank",
                `${member.user.tag} est passé de **${currentRole.name}** à **${nextRole.name}**.`
            );

            return;
        }

        // ====================================================
        // SNIPE
        // ====================================================

        if (command === "snipe") {

            const data =
                db.snipe[
                    interaction.channel.id
                ];

            if (!data) {

                return interaction.reply({
                    content:
                        "❌ Aucun message supprimé récemment dans ce salon.",
                    ephemeral: true
                });
            }

            const embed =
                new EmbedBuilder()
                    .setAuthor({
                        name: data.authorTag,
                        iconURL: data.avatar
                    })
                    .setDescription(
                        data.content
                    )
                    .setColor("#ED4245")
                    .setFooter({
                        text:
                            "Message supprimé"
                    })
                    .setTimestamp(
                        data.date
                    );

            await interaction.reply({
                embeds: [embed]
            });

            return;
        }

        // ====================================================
        // USERINFO
        // ====================================================

        if (command === "userinfo") {

            const user =
                interaction.options.getUser(
                    "membre"
                ) ||
                interaction.user;

            const member =
                interaction.guild.members.cache.get(
                    user.id
                );

            const roles =
                member
                    ? member.roles.cache
                        .filter(
                            role =>
                                role.id !==
                                interaction.guild.id
                        )
                        .sort(
                            (a, b) =>
                                b.position - a.position
                        )
                        .map(
                            role =>
                                role.toString()
                        )
                        .join(" ") || "Aucun"
                    : "Membre non présent";

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
                            name: "ID",
                            value: user.id,
                            inline: true
                        },
                        {
                            name: "Compte créé",
                            value:
                                `<t:${Math.floor(
                                    user.createdTimestamp / 1000
                                )}:F>`,
                            inline: true
                        },
                        {
                            name: "A rejoint",
                            value:
                                member
                                    ? `<t:${Math.floor(
                                        member.joinedTimestamp / 1000
                                    )}:F>`
                                    : "Inconnu",
                            inline: true
                        },
                        {
                            name: "Rôles",
                            value: roles
                        }
                    )
                    .setColor("#5865F2");

            await interaction.reply({
                embeds: [embed]
            });

            return;
        }

        // ====================================================
        // SERVERINFO
        // ====================================================

        if (command === "serverinfo") {

            const guild =
                interaction.guild;

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        guild.name
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
                                `${guild.memberCount}`,
                            inline: true
                        },
                        {
                            name: "Salons",
                            value:
                                `${guild.channels.cache.size}`,
                            inline: true
                        },
                        {
                            name: "Rôles",
                            value:
                                `${guild.roles.cache.size}`,
                            inline: true
                        },
                        {
                            name: "Boosts",
                            value:
                                `${guild.premiumSubscriptionCount || 0}`,
                            inline: true
                        },
                        {
                            name: "Créé le",
                            value:
                                `<t:${Math.floor(
                                    guild.createdTimestamp / 1000
                                )}:F>`,
                            inline: false
                        }
                    )
                    .setColor("#5865F2");

            await interaction.reply({
                embeds: [embed]
            });

            return;
        }

        // ====================================================
        // SANCTIONS
        // ====================================================

        if (command === "sanctions") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ModerateMembers
                )
            ) {
                return;
            }

            const member =
                interaction.options.getMember(
                    "membre"
                );

            if (!member) {
                return interaction.reply({
                    content:
                        "❌ Membre introuvable.",
                    ephemeral: true
                });
            }

            const sanctions =
                db.sanctions[
                    interaction.guild.id
                ]?.[member.id] || [];

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        `Historique des sanctions — ${member.user.tag}`
                    )
                    .setThumbnail(
                        member.user.displayAvatarURL({
                            dynamic: true
                        })
                    )
                    .setColor("#5865F2");

            if (sanctions.length === 0) {

                embed.setDescription(
                    "Aucune sanction enregistrée."
                );

            } else {

                embed.setDescription(
                    sanctions
                        .slice(-15)
                        .reverse()
                        .map(
                            (sanction, index) =>
                                `**${index + 1}. ${sanction.type}**\n` +
                                `Raison : ${sanction.reason}\n` +
                                `Modérateur : <@${sanction.moderatorId}>\n` +
                                `Date : <t:${Math.floor(
                                    sanction.date / 1000
                                )}:R>`
                        )
                        .join("\n\n")
                );
            }

            await interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

            return;
        }

        // ====================================================
        // LOGS SETUP
        // ====================================================

        if (command === "logs") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageGuild
                )
            ) {
                return;
            }

            const channel =
                interaction.options.getChannel(
                    "salon"
                );

            const config =
                guildConfig(
                    interaction.guild.id
                );

            config.logsChannelId =
                channel.id;

            saveDB(db);

            await interaction.reply(
                `✅ Les logs seront maintenant envoyés dans ${channel}.`
            );

            return;
        }

        // ====================================================
        // AUTOROLE
        // ====================================================

        if (command === "autorole") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageRoles
                )
            ) {
                return;
            }

            const role =
                interaction.options.getRole(
                    "role"
                );

            const botMember =
                interaction.guild.members.me;

            if (
                role.managed ||
                role.position >=
                    botMember.roles.highest.position
            ) {

                return interaction.reply({
                    content:
                        "❌ Je ne peux pas attribuer ce rôle.",
                    ephemeral: true
                });
            }

            const config =
                guildConfig(
                    interaction.guild.id
                );

            config.autoRoleId =
                role.id;

            saveDB(db);

            await interaction.reply(
                `✅ L'auto-rôle est maintenant ${role}.`
            );

            return;
        }

        // ====================================================
        // FIN PARTIE 5
        // ====================================================
        // ====================================================
        // WELCOME
        // ====================================================

        if (command === "welcome") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageGuild
                )
            ) {
                return;
            }

            const channel =
                interaction.options.getChannel("salon");

            const message =
                interaction.options.getString("message");

            const image =
                interaction.options.getString("image");

            const config =
                guildConfig(interaction.guild.id);

            config.welcomeChannelId = channel.id;

            if (message) {
                config.welcomeMessage = message;
            }

            if (image) {
                config.welcomeImage = image;
            }

            saveDB(db);

            await interaction.reply(
                `✅ Le système de bienvenue est configuré dans ${channel}.`
            );

            return;
        }

        // ====================================================
        // TICKET SETUP
        // ====================================================

        if (command === "ticket") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageChannels
                )
            ) {
                return;
            }

            const subcommand =
                interaction.options.getSubcommand();

            if (subcommand === "setup") {

                const channel =
                    interaction.options.getChannel("salon");

                const title =
                    interaction.options.getString("titre") ||
                    "🎫 Support";

                const description =
                    interaction.options.getString("description") ||
                    "Besoin d'aide ? Clique sur le bouton ci-dessous pour ouvrir un ticket.";

                const image =
                    interaction.options.getString("image");

                const embed =
                    new EmbedBuilder()
                        .setTitle(title)
                        .setDescription(description)
                        .setColor("#5865F2");

                if (image) {
                    embed.setImage(image);
                }

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId("open_ticket")
                                .setLabel("Ouvrir un ticket")
                                .setStyle(ButtonStyle.Primary)
                        );

                await channel.send({
                    embeds: [embed],
                    components: [row]
                });

                await interaction.reply({
                    content:
                        `✅ Le panneau de tickets a été envoyé dans ${channel}.`,
                    ephemeral: true
                });

                return;
            }
        }

        // ====================================================
        // JDEMBED
        // ====================================================

        if (command === "jembed") {

            if (
                !await requirePermission(
                    interaction,
                    PermissionsBitField.Flags.ManageMessages
                )
            ) {
                return;
            }

            const modal =
                new ModalBuilder()
                    .setCustomId("jembed_modal")
                    .setTitle("Créer un embed");

            const titleInput =
                new TextInputBuilder()
                    .setCustomId("title")
                    .setLabel("Titre")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(256);

            const descriptionInput =
                new TextInputBuilder()
                    .setCustomId("description")
                    .setLabel("Description")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(4000);

            const colorInput =
                new TextInputBuilder()
                    .setCustomId("color")
                    .setLabel("Couleur HEX")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder("#5865F2")
                    .setRequired(false);

            const imageInput =
                new TextInputBuilder()
                    .setCustomId("image")
                    .setLabel("URL de l'image")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    titleInput
                ),
                new ActionRowBuilder().addComponents(
                    descriptionInput
                ),
                new ActionRowBuilder().addComponents(
                    colorInput
                ),
                new ActionRowBuilder().addComponents(
                    imageInput
                )
            );

            await interaction.showModal(modal);

            return;
        }

        // ====================================================
        // GIVEAWAY START
        // ====================================================

        if (command === "giveaway") {

            const subcommand =
                interaction.options.getSubcommand();

            // ------------------------------------------------
            // START
            // ------------------------------------------------

            if (subcommand === "start") {

                if (
                    !await requirePermission(
                        interaction,
                        PermissionsBitField.Flags.ManageGuild
                    )
                ) {
                    return;
                }

                const minutes =
                    interaction.options.getInteger(
                        "minutes"
                    );

                const gagnants =
                    interaction.options.getInteger(
                        "gagnants"
                    );

                const prix =
                    interaction.options.getString(
                        "prix"
                    );

                const endTime =
                    Date.now() +
                    minutes * 60 * 1000;

                const embed =
                    new EmbedBuilder()
                        .setTitle("🎉 GIVEAWAY")
                        .setDescription(
                            `**Prix :** ${prix}\n\n` +
                            `**Gagnant(s) :** ${gagnants}\n` +
                            `**Fin :** <t:${Math.floor(endTime / 1000)}:R>\n\n` +
                            `Clique sur **Participer** pour entrer !`
                        )
                        .setColor("#FEE75C")
                        .setTimestamp(endTime);

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    "giveaway_join:TEMP"
                                )
                                .setLabel("Participer")
                                .setStyle(
                                    ButtonStyle.Success
                                )
                        );

                await interaction.reply({
                    content:
                        "✅ Giveaway créé !",
                    ephemeral: true
                });

                const message =
                    await interaction.channel.send({
                        embeds: [embed],
                        components: [row]
                    });

                // On remplace TEMP par l'ID du message
                await message.edit({
                    components: [
                        new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(
                                        `giveaway_join:${message.id}`
                                    )
                                    .setLabel(
                                        "Participer"
                                    )
                                    .setStyle(
                                        ButtonStyle.Success
                                    )
                            )
                    ]
                });

                const config =
                    guildConfig(
                        interaction.guild.id
                    );

                if (!config.giveaways) {
                    config.giveaways = {};
                }

                config.giveaways[message.id] = {
                    prize: prix,
                    winners: gagnants,
                    endTime: endTime,
                    entries: [],
                    ended: false
                };

                saveDB(db);

                // Fin automatique
                setTimeout(
                    () => endGiveaway(
                        interaction.guild,
                        message.id
                    ),
                    minutes * 60 * 1000
                );

                return;
            }

            // ------------------------------------------------
            // END
            // ------------------------------------------------

            if (subcommand === "end") {

                if (
                    !await requirePermission(
                        interaction,
                        PermissionsBitField.Flags.ManageGuild
                    )
                ) {
                    return;
                }

                const messageId =
                    interaction.options.getString(
                        "message_id"
                    );

                const result =
                    await endGiveaway(
                        interaction.guild,
                        messageId
                    );

                await interaction.reply({
                    content: result,
                    ephemeral: true
                });

                return;
            }

            // ------------------------------------------------
            // REROLL
            // ------------------------------------------------

            if (subcommand === "reroll") {

                if (
                    !await requirePermission(
                        interaction,
                        PermissionsBitField.Flags.ManageGuild
                    )
                ) {
                    return;
                }

                const messageId =
                    interaction.options.getString(
                        "message_id"
                    );

                const config =
                    guildConfig(
                        interaction.guild.id
                    );

                const giveaway =
                    config.giveaways?.[messageId];

                if (!giveaway) {
                    return interaction.reply({
                        content:
                            "❌ Giveaway introuvable.",
                        ephemeral: true
                    });
                }

                if (
                    !giveaway.entries ||
                    giveaway.entries.length === 0
                ) {
                    return interaction.reply({
                        content:
                            "❌ Il n'y a aucun participant.",
                        ephemeral: true
                    });
                }

                const shuffled =
                    [...giveaway.entries]
                        .sort(
                            () => Math.random() - 0.5
                        );

                const winners =
                    shuffled.slice(
                        0,
                        giveaway.winners
                    );

                await interaction.reply(
                    `🎉 Nouveau tirage !\n\n` +
                    winners
                        .map(id => `<@${id}>`)
                        .join(", ")
                );

                return;
            }
        }

    } catch (error) {

        console.error(
            "❌ Erreur interaction :",
            error
        );

        if (interaction.replied ||
            interaction.deferred) {

            await interaction.followUp({
                content:
                    "❌ Une erreur est survenue.",
                ephemeral: true
            }).catch(() => {});

        } else {

            await interaction.reply({
                content:
                    "❌ Une erreur est survenue.",
                ephemeral: true
            }).catch(() => {});
        }
    }
});

// ============================================================
// FONCTION GIVEAWAY
// ============================================================

async function endGiveaway(
    guild,
    messageId
) {

    const config =
        guildConfig(guild.id);

    const giveaway =
        config.giveaways?.[messageId];

    if (!giveaway) {
        return "❌ Giveaway introuvable.";
    }

    if (giveaway.ended) {
        return "❌ Ce giveaway est déjà terminé.";
    }

    giveaway.ended = true;

    saveDB(db);

    let channel;

    for (
        const currentChannel
        of guild.channels.cache.values()
    ) {

        if (
            currentChannel.isTextBased()
        ) {

            try {

                const message =
                    await currentChannel.messages.fetch(
                        messageId
                    ).catch(() => null);

                if (message) {
                    channel = currentChannel;
                    break;
                }

            } catch {}
        }
    }

    if (!channel) {
        return "❌ Impossible de retrouver le giveaway.";
    }

    const message =
        await channel.messages.fetch(
            messageId
        ).catch(() => null);

    if (!message) {
        return "❌ Message du giveaway introuvable.";
    }

    const entries =
        giveaway.entries || [];

    if (entries.length === 0) {

        await message.edit({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🎉 GIVEAWAY TERMINÉ")
                    .setDescription(
                        `**Prix :** ${giveaway.prize}\n\n` +
                        "❌ Aucun participant."
                    )
                    .setColor("#ED4245")
            ],
            components: []
        });

        return "⚠️ Giveaway terminé, aucun participant.";
    }

    const shuffled =
        [...entries]
            .sort(
                () => Math.random() - 0.5
            );

    const winners =
        shuffled.slice(
            0,
            giveaway.winners
        );

    await message.edit({
        embeds: [
            new EmbedBuilder()
                .setTitle("🎉 GIVEAWAY TERMINÉ")
                .setDescription(
                    `**Prix :** ${giveaway.prize}\n\n` +
                    `🏆 **Gagnant(s) :**\n` +
                    winners
                        .map(id => `<@${id}>`)
                        .join("\n")
                )
                .setColor("#57F287")
        ],
        components: []
    });

    await channel.send(
        `🎉 Félicitations ${winners
            .map(id => `<@${id}>`)
            .join(", ")} ! Vous avez gagné **${giveaway.prize}** !`
    );

    return "✅ Giveaway terminé.";
}

// ============================================================
// CONNEXION DU BOT
// ============================================================

if (!TOKEN) {

    console.error(
        "❌ DISCORD_TOKEN est introuvable."
    );

    console.error(
        "Configure ton token dans la variable d'environnement DISCORD_TOKEN."
    );

} else {

    client.login(TOKEN)
        .then(() => {
            console.log(
                "🔌 Connexion à Discord..."
            );
        })
        .catch(error => {
            console.error(
                "❌ Impossible de connecter le bot :",
                error
            );
        });
}