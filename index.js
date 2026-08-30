const {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    SlashCommandBuilder,
    EmbedBuilder,
    ChannelType
} = require("discord.js");

const fs = require("fs");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;


// ==================================================
// BASE DE DONNÉES DES WARNS
// ==================================================

const DB_FILE = "./warnings.json";

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, "{}");
}

function loadWarnings() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch {
        return {};
    }
}

function saveWarnings(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}


// ==================================================
// COMMANDES
// ==================================================

const commands = [

    // =========================
    // BAN
    // =========================

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
                .setRequired(false)
        ),

    // =========================
    // KICK
    // =========================

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
                .setDescription("Raison de l'expulsion")
                .setRequired(false)
        ),

    // =========================
    // WARN
    // =========================

    new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Avertir un membre")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre à avertir")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("raison")
                .setDescription("Raison de l'avertissement")
                .setRequired(false)
        ),

    // =========================
    // WARNINGS
    // =========================

    new SlashCommandBuilder()
        .setName("warnings")
        .setDescription("Voir les avertissements d'un membre")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(true)
        ),

    // =========================
    // CLEAR
    // =========================

    new SlashCommandBuilder()
        .setName("clear")
        .setDescription("Supprimer des messages")
        .addIntegerOption(option =>
            option
                .setName("nombre")
                .setDescription("Nombre de messages à supprimer")
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),

    // =========================
    // LOCK
    // =========================

    new SlashCommandBuilder()
        .setName("lock")
        .setDescription("Verrouiller le salon"),

    // =========================
    // UNLOCK
    // =========================

    new SlashCommandBuilder()
        .setName("unlock")
        .setDescription("Déverrouiller le salon"),

    // =========================
    // SLOWMODE
    // =========================

    new SlashCommandBuilder()
        .setName("slowmode")
        .setDescription("Modifier le slowmode du salon")
        .addIntegerOption(option =>
            option
                .setName("secondes")
                .setDescription("Nombre de secondes")
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(21600)
        ),

    // =========================
    // USERINFO
    // =========================

    new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("Voir les informations d'un membre")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Membre")
                .setRequired(false)
        ),

    // =========================
    // SERVERINFO
    // =========================

    new SlashCommandBuilder()
        .setName("serverinfo")
        .setDescription("Voir les informations du serveur"),

    // =========================
    // STAT
    // =========================

    new SlashCommandBuilder()
        .setName("stat")
        .setDescription("Voir les statistiques du serveur")

].map(command => command.toJSON());


// ==================================================
// READY
// ==================================================

client.once("ready", async () => {

    console.log(`✅ ${client.user.tag} est connecté !`);

    try {

        await client.application.commands.set(commands);

        console.log("✅ Commandes slash enregistrées !");

    } catch (error) {

        console.error("❌ Erreur commandes :", error);

    }

    client.user.setActivity("Gestion du serveur", {
        type: 3
    });
});


// ==================================================
// INTERACTIONS
// ==================================================

client.on("interactionCreate", async interaction => {

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.commandName;


    // ==================================================
    // STATISTIQUES
    // ==================================================

    if (command === "stat") {

        const guild = interaction.guild;

        const membres = guild.memberCount;

        const enLigne = guild.members.cache.filter(
            member =>
                member.presence &&
                member.presence.status !== "offline"
        ).size;

        const enVocal = guild.members.cache.filter(
            member => member.voice.channel
        ).size;

        const boosts = guild.premiumSubscriptionCount || 0;

        const enStream = guild.members.cache.filter(
            member => member.voice.streaming
        ).size;

        const embed = new EmbedBuilder()

            .setTitle("Hirosaki 🎆 Statistiques !")

            .setDescription(
                `Membres : **${membres}**\n` +
                `En ligne : **${enLigne}**\n` +
                `En vocal : **${enVocal}**\n` +
                `Boosts : **${boosts}**\n` +
                `En stream : **${enStream}**`
            )

            .setThumbnail(
                guild.iconURL({
                    dynamic: true,
                    size: 512
                })
            )

            .setColor("#5865F2");

        return interaction.reply({
            embeds: [embed]
        });
    }


    // ==================================================
    // BAN
    // ==================================================

    if (command === "ban") {

        if (!interaction.member.permissions.has(
            PermissionsBitField.Flags.BanMembers
        )) {

            return interaction.reply({
                content: "❌ Tu n'as pas la permission de bannir des membres.",
                ephemeral: true
            });
        }

        const member = interaction.options.getMember("membre");

        const reason =
            interaction.options.getString("raison") ||
            "Aucune raison fournie";

        if (!member) {

            return interaction.reply({
                content: "❌ Membre introuvable.",
                ephemeral: true
            });
        }

        if (!member.bannable) {

            return interaction.reply({
                content: "❌ Je ne peux pas bannir ce membre.",
                ephemeral: true
            });
        }

        try {

            await member.ban({ reason });

            return interaction.reply({
                content:
                    `🔨 **${member.user.tag}** a été banni.\n` +
                    `Raison : ${reason}`
            });

        } catch (error) {

            console.error(error);

            return interaction.reply({
                content: "❌ Une erreur est survenue.",
                ephemeral: true
            });
        }
    }


    // ==================================================
    // KICK
    // ==================================================

    if (command === "kick") {

        if (!interaction.member.permissions.has(
            PermissionsBitField.Flags.KickMembers
        )) {

            return interaction.reply({
                content: "❌ Tu n'as pas la permission d'expulser des membres.",
                ephemeral: true
            });
        }

        const member = interaction.options.getMember("membre");

        const reason =
            interaction.options.getString("raison") ||
            "Aucune raison fournie";

        if (!member) {

            return interaction.reply({
                content: "❌ Membre introuvable.",
                ephemeral: true
            });
        }

        if (!member.kickable) {

            return interaction.reply({
                content: "❌ Je ne peux pas expulser ce membre.",
                ephemeral: true
            });
        }

        try {

            await member.kick(reason);

            return interaction.reply({
                content:
                    `👢 **${member.user.tag}** a été expulsé.\n` +
                    `Raison : ${reason}`
            });

        } catch (error) {

            console.error(error);

            return interaction.reply({
                content: "❌ Une erreur est survenue.",
                ephemeral: true
            });
        }
    }


    // ==================================================
    // WARN
    // ==================================================

    if (command === "warn") {

        if (!interaction.member.permissions.has(
            PermissionsBitField.Flags.ModerateMembers
        )) {

            return interaction.reply({
                content: "❌ Tu n'as pas la permission de warn.",
                ephemeral: true
            });
        }

        const member = interaction.options.getMember("membre");

        const reason =
            interaction.options.getString("raison") ||
            "Aucune raison fournie";

        if (!member) {

            return interaction.reply({
                content: "❌ Membre introuvable.",
                ephemeral: true
            });
        }

        const warnings = loadWarnings();

        if (!warnings[member.id]) {
            warnings[member.id] = [];
        }

        warnings[member.id].push({
            reason: reason,
            moderator: interaction.user.id,
            date: new Date().toISOString()
        });

        saveWarnings(warnings);

        return interaction.reply({
            content:
                `⚠️ **${member.user.tag}** a reçu un avertissement.\n` +
                `Raison : ${reason}`
        });
    }


    // ==================================================
    // WARNINGS
    // ==================================================

    if (command === "warnings") {

        if (!interaction.member.permissions.has(
            PermissionsBitField.Flags.ModerateMembers
        )) {

            return interaction.reply({
                content: "❌ Tu n'as pas la permission.",
                ephemeral: true
            });
        }

        const member = interaction.options.getMember("membre");

        if (!member) {

            return interaction.reply({
                content: "❌ Membre introuvable.",
                ephemeral: true
            });
        }

        const warnings = loadWarnings();

        const list = warnings[member.id] || [];

        if (list.length === 0) {

            return interaction.reply({
                content: `✅ **${member.user.tag}** n'a aucun avertissement.`
            });
        }

        const text = list
            .map(
                (warn, index) =>
                    `**${index + 1}.** ${warn.reason}`
            )
            .join("\n");

        const embed = new EmbedBuilder()
            .setTitle(`Avertissements de ${member.user.username}`)
            .setDescription(text)
            .setColor("#5865F2");

        return interaction.reply({
            embeds: [embed]
        });
    }


    // ==================================================
    // CLEAR
    // ==================================================

    if (command === "clear") {

        if (!interaction.member.permissions.has(
            PermissionsBitField.Flags.ManageMessages
        )) {

            return interaction.reply({
                content: "❌ Tu n'as pas la permission.",
                ephemeral: true
            });
        }

        const nombre = interaction.options.getInteger("nombre");

        try {

            const deleted = await interaction.channel.bulkDelete(
                nombre,
                true
            );

            return interaction.reply({
                content: `🧹 ${deleted.size} message(s) supprimé(s).`,
                ephemeral: true
            });

        } catch (error) {

            console.error(error);

            return interaction.reply({
                content: "❌ Impossible de supprimer les messages.",
                ephemeral: true
            });
        }
    }


    // ==================================================
    // LOCK
    // ==================================================

    if (command === "lock") {

        if (!interaction.member.permissions.has(
            PermissionsBitField.Flags.ManageChannels
        )) {

            return interaction.reply({
                content: "❌ Tu n'as pas la permission.",
                ephemeral: true
            });
        }

        try {

            await interaction.channel.permissionOverwrites.edit(
                interaction.guild.roles.everyone,
                {
                    SendMessages: false
                }
            );

            return interaction.reply({
                content: "🔒 Salon verrouillé."
            });

        } catch (error) {

            console.error(error);

            return interaction.reply({
                content: "❌ Impossible de verrouiller le salon.",
                ephemeral: true
            });
        }
    }


    // ==================================================
    // UNLOCK
    // ==================================================

    if (command === "unlock") {

        if (!interaction.member.permissions.has(
            PermissionsBitField.Flags.ManageChannels
        )) {

            return interaction.reply({
                content: "❌ Tu n'as pas la permission.",
                ephemeral: true
            });
        }

        try {

            await interaction.channel.permissionOverwrites.edit(
                interaction.guild.roles.everyone,
                {
                    SendMessages: null
                }
            );

            return interaction.reply({
                content: "🔓 Salon déverrouillé."
            });

        } catch (error) {

            console.error(error);

            return interaction.reply({
                content: "❌ Impossible de déverrouiller le salon.",
                ephemeral: true
            });
        }
    }


    // ==================================================
    // SLOWMODE
    // ==================================================

    if (command === "slowmode") {

        if (!interaction.member.permissions.has(
            PermissionsBitField.Flags.ManageChannels
        )) {

            return interaction.reply({
                content: "❌ Tu n'as pas la permission.",
                ephemeral: true
            });
        }

        const secondes =
            interaction.options.getInteger("secondes");

        try {

            await interaction.channel.setRateLimitPerUser(
                secondes
            );

            return interaction.reply({
                content:
                    secondes === 0
                        ? "🐌 Slowmode désactivé."
                        : `🐌 Slowmode réglé sur **${secondes} secondes**.`
            });

        } catch (error) {

            console.error(error);

            return interaction.reply({
                content: "❌ Impossible de modifier le slowmode.",
                ephemeral: true
            });
        }
    }


    // ==================================================
    // USERINFO
    // ==================================================

    if (command === "userinfo") {

        const member =
            interaction.options.getMember("membre") ||
            interaction.member;

        const embed = new EmbedBuilder()
            .setTitle(`Informations de ${member.user.username}`)
            .setThumbnail(
                member.user.displayAvatarURL({
                    dynamic: true,
                    size: 512
                })
            )
            .addFields(
                {
                    name: "Utilisateur",
                    value: `${member.user.tag}`,
                    inline: true
                },
                {
                    name: "ID",
                    value: member.user.id,
                    inline: true
                },
                {
                    name: "Compte créé",
                    value: `<t:${Math.floor(
                        member.user.createdTimestamp / 1000
                    )}:F>`
                },
                {
                    name: "Arrivée sur le serveur",
                    value: `<t:${Math.floor(
                        member.joinedTimestamp / 1000
                    )}:F>`
                }
            )
            .setColor("#5865F2");

        return interaction.reply({
            embeds: [embed]
        });
    }


    // ==================================================
    // SERVERINFO
    // ==================================================

    if (command === "serverinfo") {

        const guild = interaction.guild;

        const embed = new EmbedBuilder()
            .setTitle(guild.name)
            .setThumbnail(
                guild.iconURL({
                    dynamic: true,
                    size: 512
                })
            )
            .addFields(
                {
                    name: "Membres",
                    value: `${guild.memberCount}`,
                    inline: true
                },
                {
                    name: "Salons",
                    value: `${guild.channels.cache.size}`,
                    inline: true
                },
                {
                    name: "Rôles",
                    value: `${guild.roles.cache.size}`,
                    inline: true
                },
                {
                    name: "Boosts",
                    value: `${guild.premiumSubscriptionCount || 0}`,
                    inline: true
                },
                {
                    name: "Création",
                    value: `<t:${Math.floor(
                        guild.createdTimestamp / 1000
                    )}:F>`
                }
            )
            .setColor("#5865F2");

        return interaction.reply({
            embeds: [embed]
        });
    }

});


// ==================================================
// CONNEXION
// ==================================================

if (!TOKEN) {

    console.error("❌ DISCORD_TOKEN est introuvable.");

    process.exit(1);
}

client.login(TOKEN);
      