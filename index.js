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
    GatewayIntentBits.GuildMessages
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;

// ==========================
// BASE DE DONNÉES DES WARNS
// ==========================

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

// ==========================
// COMMANDES
// ==========================

const commands = [

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

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Mettre un membre en timeout")
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre à mettre en timeout")
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
        .setDescription("Raison du timeout")
        .setRequired(false)
    ),

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
        .setDescription("Nombre de secondes")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    ),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Voir les informations d'un membre")
    .addUserOption(option =>
      option
        .setName("membre")
        .setDescription("Membre")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Voir les informations du serveur")

].map(command => command.toJSON());

// ==========================
// BOT PRÊT
// ==========================

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

// ==========================
// INTERACTIONS
// ==========================

client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;

  const command = interaction.commandName;

  // ==========================
  // BAN
  // ==========================

  if (command === "ban") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return interaction.reply({
        content: "❌ Tu n'as pas la permission de bannir des membres.",
        ephemeral: true
      });
    }

    const user = interaction.options.getUser("membre");
    const reason =
      interaction.options.getString("raison") || "Aucune raison indiquée.";

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    if (!member) {
      return interaction.reply({
        content: "❌ Ce membre n'est pas sur le serveur.",
        ephemeral: true
      });
    }

    if (!member.bannable) {
      return interaction.reply({
        content: "❌ Je ne peux pas bannir ce membre. Vérifie la hiérarchie des rôles.",
        ephemeral: true
      });
    }

    await member.ban({ reason });

    const embed = new EmbedBuilder()
      .setTitle("🔨 Membre banni")
      .setColor(0xFF0000)
      .addFields(
        { name: "Membre", value: `${user}`, inline: true },
        { name: "Modérateur", value: `${interaction.user}`, inline: true },
        { name: "Raison", value: reason }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // ==========================
  // KICK
  // ==========================

  if (command === "kick") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return interaction.reply({
        content: "❌ Tu n'as pas la permission d'expulser des membres.",
        ephemeral: true
      });
    }

    const user = interaction.options.getUser("membre");
    const reason =
      interaction.options.getString("raison") || "Aucune raison indiquée.";

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    if (!member || !member.kickable) {
      return interaction.reply({
        content: "❌ Je ne peux pas expulser ce membre.",
        ephemeral: true
      });
    }

    await member.kick(reason);

    const embed = new EmbedBuilder()
      .setTitle("👢 Membre expulsé")
      .setColor(0xFFA500)
      .addFields(
        { name: "Membre", value: `${user}`, inline: true },
        { name: "Modérateur", value: `${interaction.user}`, inline: true },
        { name: "Raison", value: reason }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // ==========================
  // TIMEOUT
  // ==========================

  if (command === "timeout") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({
        content: "❌ Tu n'as pas la permission de mettre en timeout.",
        ephemeral: true
      });
    }

    const user = interaction.options.getUser("membre");
    const minutes = interaction.options.getInteger("minutes");
    const reason =
      interaction.options.getString("raison") || "Aucune raison indiquée.";

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    if (!member || !member.moderatable) {
      return interaction.reply({
        content: "❌ Je ne peux pas mettre ce membre en timeout.",
        ephemeral: true
      });
    }

    await member.timeout(minutes * 60 * 1000, reason);

    return interaction.reply(
      `🔇 ${user} a été mis en timeout pendant **${minutes} minute(s)**.\n**Raison :** ${reason}`
    );
  }

  // ==========================
  // WARN
  // ==========================

  if (command === "warn") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return interaction.reply({
        content: "❌ Tu n'as pas la permission de donner un avertissement.",
        ephemeral: true
      });
    }

    const user = interaction.options.getUser("membre");
    const reason =
      interaction.options.getString("raison") || "Aucune raison indiquée.";

    const warnings = loadWarnings();

    if (!warnings[interaction.guild.id]) {
      warnings[interaction.guild.id] = {};
    }

    if (!warnings[interaction.guild.id][user.id]) {
      warnings[interaction.guild.id][user.id] = [];
    }

    warnings[interaction.guild.id][user.id].push({
      reason,
      moderator: interaction.user.id,
      date: new Date().toISOString()
    });

    saveWarnings(warnings);

    const total = warnings[interaction.guild.id][user.id].length;

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Avertissement")
      .setColor(0xFFFF00)
      .addFields(
        { name: "Membre", value: `${user}`, inline: true },
        { name: "Total de warns", value: `${total}`, inline: true },
        { name: "Raison", value: reason }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // ==========================
  // WARNINGS
  // ==========================

  if (command === "warnings") {

    const user = interaction.options.getUser("membre");
    const warnings = loadWarnings();

    const list =
      warnings[interaction.guild.id]?.[user.id] || [];

    if (list.length === 0) {
      return interaction.reply(
        `✅ ${user} n'a aucun avertissement.`
      );
    }

    const text = list
      .map((warn, index) =>
        `**${index + 1}.** ${warn.reason}`
      )
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Avertissements de ${user.username}`)
      .setColor(0xFFFF00)
      .setDescription(text)
      .setFooter({
        text: `${list.length} avertissement(s)`
      });

    return interaction.reply({ embeds: [embed] });
  }

  // ==========================
  // CLEAR
  // ==========================

  if (command === "clear") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return interaction.reply({
        content: "❌ Tu n'as pas la permission de supprimer des messages.",
        ephemeral: true
      });
    }

    const amount = interaction.options.getInteger("nombre");

    const deleted = await interaction.channel.bulkDelete(
      amount,
      true
    );

    return interaction.reply({
      content: `🧹 **${deleted.size}** message(s) supprimé(s).`,
      ephemeral: true
    });
  }

  // ==========================
  // LOCK
  // ==========================

  if (command === "lock") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({
        content: "❌ Tu n'as pas la permission de verrouiller ce salon.",
        ephemeral: true
      });
    }

    await interaction.channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      {
        SendMessages: false
      }
    );

    return interaction.reply("🔒 **Salon verrouillé.**");
  }

  // ==========================
  // UNLOCK
  // ==========================

  if (command === "unlock") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({
        content: "❌ Tu n'as pas la permission de déverrouiller ce salon.",
        ephemeral: true
      });
    }

    await interaction.channel.permissionOverwrites.edit(
      interaction.guild.roles.everyone,
      {
        SendMessages: null
      }
    );

    return interaction.reply("🔓 **Salon déverrouillé.**");
  }

  // ==========================
  // SLOWMODE
  // ==========================

  if (command === "slowmode") {

    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({
        content: "❌ Tu n'as pas la permission de modifier le slowmode.",
        ephemeral: true
      });
    }

    const seconds = interaction.options.getInteger("secondes");

    await interaction.channel.setRateLimitPerUser(seconds);

    return interaction.reply(
      seconds === 0
        ? "🐌 Slowmode désactivé."
        : `🐌 Slowmode réglé sur **${seconds} seconde(s)**.`
    );
  }

  // ==========================
  // USERINFO
  // ==========================

  if (command === "userinfo") {

    const user =
      interaction.options.getUser("membre") ||
      interaction.user;

    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);

    const embed = new EmbedBuilder()
      .setTitle(`👤 Informations — ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .setColor(0x5865F2)
      .addFields(
        {
          name: "ID",
          value: user.id,
          inline: true
        },
        {
          name: "Compte créé",
          value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`
        }
      )
      .setTimestamp();

    if (member) {
      embed.addFields({
        name: "Arrivé sur le serveur",
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
      });
    }

    return interaction.reply({ embeds: [embed] });
  }

  // ==========================
  // SERVERINFO
  // ==========================

  if (command === "serverinfo") {

    const guild = interaction.guild;

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${guild.name}`)
      .setThumbnail(guild.iconURL())
      .setColor(0x5865F2)
      .addFields(
        {
          name: "👑 Propriétaire",
          value: `<@${guild.ownerId}>`,
          inline: true
        },
        {
          name: "👥 Membres",
          value: `${guild.memberCount}`,
          inline: true
        },
        {
          name: "💬 Salons",
          value: `${guild.channels.cache.size}`,
          inline: true
        },
        {
          name: "🎭 Rôles",
          value: `${guild.roles.cache.size}`,
          inline: true
        }
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
});

// ==========================
// CONNEXION
// ==========================

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN est manquant !");
  process.exit(1);
}

client.login(TOKEN);