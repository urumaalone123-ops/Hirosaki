const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const fs = require("fs");

/* =========================================================
   CONFIGURATION
========================================================= */

const PREFIX = "+";

const TOKEN =
    process.env.DISCORD_TOKEN ||
    process.env.TOKEN;

const ROLE_CROWN = "Crown";
const ROLE_TICKET = "Gestion ticket";

const ROLE_PERM = {
    1: "Modérateur test",
    2: "Modérateur",
    3: "Staff confirmé",
    4: "Responsable staff",
    5: "Co-owner"
};

/* =========================================================
   CLIENT
========================================================= */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

/* =========================================================
   DATABASE
========================================================= */

const DB_FILE = "./bot-data.json";

const DEFAULT_DB = {
    guilds: {},
    warnings: {},
    sanctions: {},
    snipe: {},
    activity: {},
    tickets: {},
    giveaways: {}
};

function loadDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(DEFAULT_DB, null, 2)
        );

        return structuredClone(DEFAULT_DB);
    }

    try {
        return JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );
    } catch {
        return structuredClone(DEFAULT_DB);
    }
}

let db = loadDatabase();

function saveDatabase() {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(db, null, 2)
    );
}

function getGuildConfig(guildId) {

    if (!db.guilds[guildId]) {

        db.guilds[guildId] = {
            statChannel: null,
            statHour: "23:00",

            leaderboardChannel: null,
            leaderboardDay: 0,
            leaderboardHour: "20:00",

            welcomeChannel: null,
            welcomeEnabled: true,
            welcomeMessage:
                "Bienvenue {user} sur **{server}** !",
            welcomeImage: null,

            autoRole: null,

            logsChannel: null,

            ticketPanelChannel: null,
            ticketCategory: null,

            customPermissions: {},

            autoRoll: {
                enabled: false,
                interval: 60
            }
        };

        saveDatabase();
    }

    return db.guilds[guildId];
}

/* =========================================================
   PERMISSIONS
========================================================= */

function hasRole(member, roleName) {

    return member.roles.cache.some(
        role => role.name === roleName
    );
}

function getPermission(member) {

    if (!member) return 0;

    if (
        hasRole(
            member,
            ROLE_CROWN
        )
    ) {
        return 5;
    }

    let permission = 0;

    for (
        let i = 1;
        i <= 5;
        i++
    ) {

        if (
            hasRole(
                member,
                ROLE_PERM[i]
            )
        ) {
            permission = Math.max(
                permission,
                i
            );
        }
    }

    return permission;
}

function isTicketStaff(member) {

    return (
        getPermission(member) >= 5 ||
        hasRole(
            member,
            ROLE_TICKET
        )
    );
}

async function requirePermission(
    message,
    required
) {

    const permission =
        getPermission(
            message.member
        );

    if (
        permission < required
    ) {

        await message.reply(
            `❌ Tu n'as pas la permission.\n` +
            `Permission requise : **Perm ${required} — ${ROLE_PERM[required]}**`
        );

        return false;
    }

    return true;
}

async function requireTicketPermission(
    message
) {

    if (
        !isTicketStaff(
            message.member
        )
    ) {

        await message.reply(
            "❌ Cette commande est réservée à **Gestion ticket** et **Crown**."
        );

        return false;
    }

    return true;
}

/* =========================================================
   OUTILS
========================================================= */

function getMember(
    message,
    value
) {

    if (
        message.mentions.members.size
    ) {
        return message.mentions.members.first();
    }

    if (!value) return null;

    const id =
        value.replace(
            /[<@!>]/g,
            ""
        );

    return message.guild.members.cache.get(
        id
    ) || null;
}

function getRole(
    message,
    value
) {

    if (
        message.mentions.roles.size
    ) {
        return message.mentions.roles.first();
    }

    if (!value) return null;

    const id =
        value.replace(
            /[<@&>]/g,
            ""
        );

    return message.guild.roles.cache.get(
        id
    ) || null;
}

function parseArguments(
    content
) {

    const matches =
        content.match(
            /"[^"]*"|'[^']*'|\S+/g
        );

    if (!matches)
        return [];

    return matches.map(
        value =>
            value.replace(
                /^["']|["']$/g,
                ""
            )
    );
}

/* =========================================================
   VARIABLES BIENVENUE
========================================================= */

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

    const voice =
        guild.members.cache.filter(
            m =>
                m.voice.channel
        ).size;

    const streaming =
        guild.members.cache.filter(
            m =>
                m.voice.streaming
        ).size;

    return text
        .replaceAll(
            "{user}",
            `<@${member.id}>`
        )
        .replaceAll(
            "{member}",
            `<@${member.id}>`
        )
        .replaceAll(
            "{username}",
            member.user.username
        )
        .replaceAll(
            "{user.tag}",
            member.user.tag
        )
        .replaceAll(
            "{user.id}",
            member.id
        )
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
        .replaceAll(
            "{online}",
            String(online)
        )
        .replaceAll(
            "{voice}",
            String(voice)
        )
        .replaceAll(
            "{stream}",
            String(streaming)
        )
        .replaceAll(
            "{boosts}",
            String(
                guild.premiumSubscriptionCount ||
                0
            )
        )
        .replaceAll(
            "{date}",
            new Date().toLocaleDateString(
                "fr-FR"
            )
        )
        .replaceAll(
            "{time}",
            new Date().toLocaleTimeString(
                "fr-FR"
            )
        )
        .replaceAll(
            "{avatar}",
            member.user.displayAvatarURL({
                dynamic: true,
                size: 512
            })
        );
}

/* =========================================================
   STATISTIQUES
========================================================= */

function createStatsEmbed(
    guild
) {

    const members =
        guild.memberCount;

    const online =
        guild.members.cache.filter(
            member =>
                member.presence &&
                member.presence.status !==
                    "offline"
        ).size;

    const voice =
        guild.members.cache.filter(
            member =>
                member.voice.channel
        ).size;

    const stream =
        guild.members.cache.filter(
            member =>
                member.voice.streaming
        ).size;

    const boosts =
        guild.premiumSubscriptionCount ||
        0;

    return new EmbedBuilder()
        .setTitle(
            "Hirosaki 🎆 Statistiques"
        )
        .setDescription(
            `Membre : **${members}**\n` +
            `En ligne : **${online}**\n` +
            `En vocal : **${voice}**\n` +
            `Boost : **${boosts}**\n` +
            `En stream : **${stream}**`
        )
        .setThumbnail(
            guild.iconURL({
                dynamic: true,
                size: 512
            })
        )
        .setColor(
            0x5865F2
        )
        .setTimestamp();
}

async function sendStats(
    guild
) {

    const config =
        getGuildConfig(
            guild.id
        );

    if (
        !config.statChannel
    ) {
        return false;
    }

    const channel =
        guild.channels.cache.get(
            config.statChannel
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return false;
    }

    /*
       IMPORTANT :
       On envoie un NOUVEAU message.
       On ne modifie pas l'ancien.
    */

    await channel.send({
        embeds: [
            createStatsEmbed(
                guild
            )
        ]
    });

    return true;
}

/* =========================================================
   SNIPE
========================================================= */

client.on(
    "messageDelete",
    message => {

        if (
            !message.guild ||
            !message.author ||
            message.author.bot
        ) {
            return;
        }

        db.snipe[
            message.channel.id
        ] = {

            content:
                message.content ||
                "*Message sans contenu*",

            author:
                message.author.tag,

            authorId:
                message.author.id,

            avatar:
                message.author.displayAvatarURL({
                    dynamic: true
                }),

            timestamp:
                Date.now()
        };

        saveDatabase();
    }
);

/* =========================================================
   ACTIVITÉ MESSAGES
========================================================= */

client.on(
    "messageCreate",
    message => {

        if (
            !message.guild ||
            message.author.bot
        ) {
            return;
        }

        if (
            !db.activity[
                message.guild.id
            ]
        ) {

            db.activity[
                message.guild.id
            ] = {
                users: {},
                duos: {}
            };
        }

        const activity =
            db.activity[
                message.guild.id
            ];

        activity.users[
            message.author.id
        ] ??= {
            messages: 0,
            voiceSeconds: 0
        };

        activity.users[
            message.author.id
        ].messages++;

        saveDatabase();
    }
);

/* =========================================================
   ACTIVITÉ VOCAL
========================================================= */

client.on(
    "voiceStateUpdate",
    (
        oldState,
        newState
    ) => {

        const member =
            newState.member ||
            oldState.member;

        if (
            !member ||
            member.user.bot
        ) {
            return;
        }

        db.activity[
            member.guild.id
        ] ??= {
            users: {},
            duos: {}
        };

        const activity =
            db.activity[
                member.guild.id
            ];

        activity.users[
            member.id
        ] ??= {
            messages: 0,
            voiceSeconds: 0
        };

        const user =
            activity.users[
                member.id
            ];

        /*
           Entrée en vocal
        */

        if (
            !oldState.channelId &&
            newState.channelId
        ) {

            user.voiceStart =
                Date.now();
        }

        /*
           Sortie du vocal
        */

        if (
            oldState.channelId &&
            !newState.channelId
        ) {

            if (
                user.voiceStart
            ) {

                user.voiceSeconds +=
                    Math.floor(
                        (
                            Date.now() -
                            user.voiceStart
                        ) / 1000
                    );

                delete user.voiceStart;
            }
        }

        /*
           Duo vocal
        */

        if (
            oldState.channelId &&
            !newState.channelId
        ) {

            const channel =
                oldState.channel;

            if (channel) {

                const others =
                    channel.members.filter(
                        m =>
                            m.id !==
                                member.id &&
                            !m.user.bot
                    );

                for (
                    const other
                    of others.values()
                ) {

                    const ids =
                        [
                            member.id,
                            other.id
                        ].sort();

                    const pair =
                        ids.join(":");

                    activity.duos[
                        pair
                    ] ??= 0;

                    /*
                       On ajoute approximativement
                       le temps de présence commun.
                    */
                    activity.duos[
                        pair
                    ] += 60;
                }
            }
        }

        saveDatabase();
    }
);

/* =========================================================
   BIENVENUE
========================================================= */

client.on(
    "guildMemberAdd",
    async member => {

        const config =
            getGuildConfig(
                member.guild.id
            );

        /*
           AUTO ROLE
        */

        if (
            config.autoRole
        ) {

            const role =
                member.guild.roles.cache.get(
                    config.autoRole
                );

            if (
                role &&
                role.position <
                    member.guild.members.me
                        .roles.highest.position
            ) {

                await member.roles.add(
                    role
                ).catch(
                    () => {}
                );
            }
        }

        /*
           BIENVENUE
        */

        if (
            !config.welcomeEnabled ||
            !config.welcomeChannel
        ) {
            return;
        }

        const channel =
            member.guild.channels.cache.get(
                config.welcomeChannel
            );

        if (
            !channel ||
            !channel.isTextBased()
        ) {
            return;
        }

        const text =
            replaceWelcomeVariables(
                config.welcomeMessage,
                member
            );

        const embed =
            new EmbedBuilder()
                .setDescription(
                    text
                )
                .setThumbnail(
                    member.user.displayAvatarURL({
                        dynamic: true,
                        size: 512
                    })
                )
                .setColor(
                    0x5865F2
                )
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
        }).catch(
            () => {}
        );
    }
);

/* =========================================================
   READY
========================================================= */

client.once(
    "ready",
    () => {

        console.log(
            `✅ ${client.user.tag} est connecté.`
        );

        client.user.setActivity(
            "+commands | Hirosaki",
            {
                type: 3
            }
        );
    }
);
/* =========================================================
   COMMANDES DE MODÉRATION
========================================================= */

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

        const args = parseArguments(
            message.content
                .slice(PREFIX.length)
                .trim()
        );

        const command =
            (args.shift() || "").toLowerCase();

        if (!command) return;

        try {

            /* =================================================
               HELP / COMMANDES
            ================================================= */

            if (
                command === "help" ||
                command === "commands" ||
                command === "perms"
            ) {

                return sendCommandHelp(
                    message
                );
            }

            /* =================================================
               SNIPE — PERM 1
            ================================================= */

            if (command === "snipe") {

                if (
                    !await requirePermission(
                        message,
                        1
                    )
                ) return;

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
                        .setAuthor({
                            name: data.author,
                            iconURL: data.avatar
                        })
                        .setDescription(
                            data.content
                        )
                        .setColor(
                            0x5865F2
                        )
                        .setTimestamp(
                            data.timestamp
                        );

                return message.reply({
                    embeds: [embed]
                });
            }

            /* =================================================
               WARN — PERM 2
            ================================================= */

            if (command === "warn") {

                if (
                    !await requirePermission(
                        message,
                        2
                    )
                ) return;

                const member =
                    getMember(
                        message,
                        args[0]
                    );

                if (!member) {
                    return message.reply(
                        "❌ Mentionne un membre."
                    );
                }

                if (
                    member.id ===
                    message.author.id
                ) {
                    return message.reply(
                        "❌ Tu ne peux pas te warn toi-même."
                    );
                }

                const reason =
                    args
                        .slice(1)
                        .join(" ") ||
                    "Aucune raison";

                db.warnings[
                    message.guild.id
                ] ??= {};

                db.warnings[
                    message.guild.id
                ][member.id] ??= [];

                db.warnings[
                    message.guild.id
                ][member.id].push({
                    moderator:
                        message.author.id,
                    reason,
                    date:
                        Date.now()
                });

                db.sanctions[
                    message.guild.id
                ] ??= {};

                db.sanctions[
                    message.guild.id
                ][member.id] ??= [];

                db.sanctions[
                    message.guild.id
                ][member.id].push({
                    type: "Warn",
                    moderator:
                        message.author.id,
                    reason,
                    date:
                        Date.now()
                });

                saveDatabase();

                await member.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "⚠️ Avertissement"
                            )
                            .setDescription(
                                `Tu as reçu un avertissement sur **${message.guild.name}**.\n\n` +
                                `**Raison :** ${reason}`
                            )
                            .setColor(
                                0xFEE75C
                            )
                    ]
                }).catch(() => {});

                return message.reply(
                    `⚠️ ${member} a reçu un avertissement.\n**Raison :** ${reason}`
                );
            }

            /* =================================================
               WARNINGS
            ================================================= */

            if (
                command === "warnings" ||
                command === "warns"
            ) {

                if (
                    !await requirePermission(
                        message,
                        2
                    )
                ) return;

                const member =
                    getMember(
                        message,
                        args[0]
                    );

                if (!member) {
                    return message.reply(
                        "❌ Mentionne un membre."
                    );
                }

                const list =
                    db.warnings[
                        message.guild.id
                    ]?.[member.id] || [];

                if (!list.length) {
                    return message.reply(
                        `✅ ${member} n'a aucun avertissement.`
                    );
                }

                const description =
                    list.map(
                        (warning, index) =>
                            `**#${index + 1}**\n` +
                            `Raison : ${warning.reason}\n` +
                            `Staff : <@${warning.moderator}>\n` +
                            `Date : <t:${Math.floor(
                                warning.date / 1000
                            )}:F>`
                    ).join("\n\n");

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                `⚠️ Avertissements — ${member.user.tag}`
                            )
                            .setDescription(
                                description
                            )
                            .setColor(
                                0xFEE75C
                            )
                    ]
                });
            }

            /* =================================================
               UNWARN
            ================================================= */

            if (command === "unwarn") {

                if (
                    !await requirePermission(
                        message,
                        2
                    )
                ) return;

                const member =
                    getMember(
                        message,
                        args[0]
                    );

                const number =
                    Number(args[1]);

                if (!member) {
                    return message.reply(
                        "❌ Mentionne un membre."
                    );
                }

                if (
                    !Number.isInteger(number) ||
                    number < 1
                ) {
                    return message.reply(
                        "❌ Indique le numéro du warn à retirer."
                    );
                }

                const list =
                    db.warnings[
                        message.guild.id
                    ]?.[member.id];

                if (
                    !list ||
                    !list[number - 1]
                ) {
                    return message.reply(
                        "❌ Ce warn n'existe pas."
                    );
                }

                list.splice(
                    number - 1,
                    1
                );

                saveDatabase();

                return message.reply(
                    `✅ Le warn **#${number}** de ${member} a été retiré.`
                );
            }

            /* =================================================
               SANCTIONS
            ================================================= */

            if (
                command === "sanctions" ||
                command === "sanction"
            ) {

                if (
                    !await requirePermission(
                        message,
                        2
                    )
                ) return;

                const member =
                    getMember(
                        message,
                        args[0]
                    );

                if (!member) {
                    return message.reply(
                        "❌ Mentionne un membre."
                    );
                }

                const list =
                    db.sanctions[
                        message.guild.id
                    ]?.[member.id] || [];

                if (!list.length) {
                    return message.reply(
                        `✅ ${member} n'a aucune sanction enregistrée.`
                    );
                }

                const description =
                    list.map(
                        (sanction, index) =>
                            `**#${index + 1} — ${sanction.type}**\n` +
                            `Raison : ${sanction.reason}\n` +
                            `Staff : <@${sanction.moderator}>\n` +
                            `<t:${Math.floor(
                                sanction.date / 1000
                            )}:R>`
                    ).join("\n\n");

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                `📋 Sanctions — ${member.user.tag}`
                            )
                            .setDescription(
                                description
                            )
                            .setColor(
                                0x5865F2
                            )
                    ]
                });
            }

            /* =================================================
               BLACKLIST / BANLIST
            ================================================= */

            if (
                command === "blacklist" ||
                command === "banlist"
            ) {

                if (
                    !await requirePermission(
                        message,
                        2
                    )
                ) return;

                const bans =
                    await message.guild.bans.fetch();

                if (!bans.size) {
                    return message.reply(
                        "✅ Aucun membre actuellement banni."
                    );
                }

                const list =
                    [...bans.values()]
                        .slice(0, 50)
                        .map(
                            (ban, index) =>
                                `**${index + 1}.** ${ban.user.tag} — \`${ban.user.id}\``
                        )
                        .join("\n");

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "🔨 Blacklist"
                            )
                            .setDescription(
                                list
                            )
                            .setFooter({
                                text:
                                    `${bans.size} membre(s) banni(s)`
                            })
                            .setColor(
                                0xED4245
                            )
                    ]
                });
            }

            /* =================================================
               KICK — PERM 3
            ================================================= */

            if (command === "kick") {

                if (
                    !await requirePermission(
                        message,
                        3
                    )
                ) return;

                const member =
                    getMember(
                        message,
                        args[0]
                    );

                if (!member) {
                    return message.reply(
                        "❌ Mentionne un membre."
                    );
                }

                if (
                    !member.kickable
                ) {
                    return message.reply(
                        "❌ Je ne peux pas expulser ce membre."
                    );
                }

                const reason =
                    args
                        .slice(1)
                        .join(" ") ||
                    "Aucune raison";

                await member.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "👢 Expulsion"
                            )
                            .setDescription(
                                `Tu as été expulsé de **${message.guild.name}**.\n\n` +
                                `**Raison :** ${reason}`
                            )
                            .setColor(
                                0xED4245
                            )
                    ]
                }).catch(() => {});

                await member.kick(
                    reason
                );

                db.sanctions[
                    message.guild.id
                ] ??= {};

                db.sanctions[
                    message.guild.id
                ][member.id] ??= [];

                db.sanctions[
                    message.guild.id
                ][member.id].push({
                    type: "Kick",
                    moderator:
                        message.author.id,
                    reason,
                    date:
                        Date.now()
                });

                saveDatabase();

                return message.reply(
                    `👢 **${member.user.tag}** a été expulsé.\n**Raison :** ${reason}`
                );
            }

            /* =================================================
               BAN — PERM 3
            ================================================= */

            if (command === "ban") {

                if (
                    !await requirePermission(
                        message,
                        3
                    )
                ) return;

                const member =
                    getMember(
                        message,
                        args[0]
                    );

                if (!member) {
                    return message.reply(
                        "❌ Mentionne un membre."
                    );
                }

                if (
                    !member.bannable
                ) {
                    return message.reply(
                        "❌ Je ne peux pas bannir ce membre."
                    );
                }

                const reason =
                    args
                        .slice(1)
                        .join(" ") ||
                    "Aucune raison";

                await member.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "🔨 Bannissement"
                            )
                            .setDescription(
                                `Tu as été banni de **${message.guild.name}**.\n\n` +
                                `**Raison :** ${reason}`
                            )
                            .setColor(
                                0xED4245
                            )
                    ]
                }).catch(() => {});

                await member.ban({
                    reason
                });

                db.sanctions[
                    message.guild.id
                ] ??= {};

                db.sanctions[
                    message.guild.id
                ][member.id] ??= [];

                db.sanctions[
                    message.guild.id
                ][member.id].push({
                    type: "Ban",
                    moderator:
                        message.author.id,
                    reason,
                    date:
                        Date.now()
                });

                saveDatabase();

                return message.reply(
                    `🔨 **${member.user.tag}** a été banni.\n**Raison :** ${reason}`
                );
            }

            /* =================================================
               UNBAN — PERM 3
            ================================================= */

            if (command === "unban") {

                if (
                    !await requirePermission(
                        message,
                        3
                    )
                ) return;

                const userId =
                    args[0];

                if (!userId) {
                    return message.reply(
                        "❌ Donne l'ID du membre."
                    );
                }

                await message.guild.members.unban(
                    userId
                );

                return message.reply(
                    `✅ <@${userId}> a été débanni.`
                );
            }

            /* =================================================
               MUTE / TIMEOUT — PERM 3
            ================================================= */

            if (
                command === "mute" ||
                command === "timeout"
            ) {

                if (
                    !await requirePermission(
                        message,
                        3
                    )
                ) return;

                const member =
                    getMember(
                        message,
                        args[0]
                    );

                const duration =
                    Number(args[1]);

                if (!member) {
                    return message.reply(
                        "❌ Mentionne un membre."
                    );
                }

                if (
                    !Number.isInteger(
                        duration
                    ) ||
                    duration < 1 ||
                    duration > 40320
                ) {
                    return message.reply(
                        "❌ Indique une durée en minutes (maximum 40320)."
                    );
                }

                const reason =
                    args
                        .slice(2)
                        .join(" ") ||
                    "Aucune raison";

                if (
                    !member.moderatable
                ) {
                    return message.reply(
                        "❌ Je ne peux pas mute ce membre."
                    );
                }

                await member.timeout(
                    duration * 60000,
                    reason
                );

                db.sanctions[
                    message.guild.id
                ] ??= {};

                db.sanctions[
                    message.guild.id
                ][member.id] ??= [];

                db.sanctions[
                    message.guild.id
                ][member.id].push({
                    type: "Mute",
                    moderator:
                        message.author.id,
                    reason,
                    date:
                        Date.now()
                });

                saveDatabase();

                return message.reply(
                    `🔇 ${member} est mute pendant **${duration} minute(s)**.`
                );
            }

            /* =================================================
               UNMUTE
            ================================================= */

            if (
                command === "unmute" ||
                command === "untimeout"
            ) {

                if (
                    !await requirePermission(
                        message,
                        3
                    )
                ) return;

                const member =
                    getMember(
                        message,
                        args[0]
                    );

                if (!member) {
                    return message.reply(
                        "❌ Mentionne un membre."
                    );
                }

                await member.timeout(
                    null
                );

                return message.reply(
                    `🔊 Le mute de ${member} a été retiré.`
                );
            }

            /* =================================================
               CLEAR / PURGE — PERM 4
            ================================================= */

            if (
                command === "clear" ||
                command === "purge"
            ) {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                const amount =
                    Number(args[0]);

                if (
                    !Number.isInteger(
                        amount
                    ) ||
                    amount < 1 ||
                    amount > 100
                ) {
                    return message.reply(
                        "❌ Utilise un nombre entre **1 et 100**."
                    );
                }

                const deleted =
                    await message.channel.bulkDelete(
                        amount,
                        true
                    );

                const confirmation =
                    await message.channel.send(
                        `🧹 **${deleted.size}** message(s) supprimé(s).`
                    );

                setTimeout(
                    () =>
                        confirmation
                            .delete()
                            .catch(() => {}),
                    3000
                );

                return;
            }

            /* =================================================
               LOCK — PERM 4
            ================================================= */

            if (command === "lock") {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                await message.channel.permissionOverwrites.edit(
                    message.guild.roles.everyone,
                    {
                        SendMessages: false
                    }
                );

                return message.reply(
                    "🔒 Salon verrouillé."
                );
            }

            /* =================================================
               UNLOCK — PERM 4
            ================================================= */

            if (command === "unlock") {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                await message.channel.permissionOverwrites.edit(
                    message.guild.roles.everyone,
                    {
                        SendMessages: null
                    }
                );

                return message.reply(
                    "🔓 Salon déverrouillé."
                );
            }

            /* =================================================
               SLOWMODE — PERM 4
            ================================================= */

            if (command === "slowmode") {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                const seconds =
                    Number(args[0]);

                if (
                    !Number.isInteger(
                        seconds
                    ) ||
                    seconds < 0 ||
                    seconds > 21600
                ) {
                    return message.reply(
                        "❌ Indique une durée entre **0 et 21600 secondes**."
                    );
                }

                await message.channel.setRateLimitPerUser(
                    seconds
                );

                return message.reply(
                    seconds === 0
                        ? "🐌 Slowmode désactivé."
                        : `🐌 Slowmode réglé sur **${seconds}s**.`
                );
            }

            /* =================================================
               ROLE ADD / REMOVE — PERM 4
            ================================================= */

            if (command === "role") {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                const action =
                    (
                        args[0] || ""
                    ).toLowerCase();

                if (
                    action !== "add" &&
                    action !== "remove"
                ) {
                    return message.reply(
                        "❌ Utilisation : `+role add @membre @role` ou `+role remove @membre @role`"
                    );
                }

                const member =
                    getMember(
                        message,
                        args[1]
                    );

                const role =
                    getRole(
                        message,
                        args[2]
                    );

                if (
                    !member ||
                    !role
                ) {
                    return message.reply(
                        "❌ Mentionne le membre et le rôle."
                    );
                }

                if (
                    role.managed ||
                    role.position >=
                        message.guild.members.me
                            .roles.highest.position
                ) {
                    return message.reply(
                        "❌ Je ne peux pas gérer ce rôle."
                    );
                }

                if (
                    action === "add"
                ) {

                    await member.roles.add(
                        role
                    );

                    return message.reply(
                        `✅ ${role} ajouté à ${member}.`
                    );
                }

                await member.roles.remove(
                    role
                );

                return message.reply(
                    `✅ ${role} retiré de ${member}.`
                );
            }

            /* =================================================
               RANK / DERANK — PERM 4
            ================================================= */

            if (
                command === "rank" ||
                command === "derank"
            ) {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                const member =
                    getMember(
                        message,
                        args[0]
                    );

                if (!member) {
                    return message.reply(
                        "❌ Mentionne un membre."
                    );
                }

                const bot =
                    message.guild.members.me;

                const availableRoles =
                    [...message.guild.roles.cache.values()]
                        .filter(
                            role =>
                                !role.managed &&
                                role.id !==
                                    message.guild.id &&
                                role.position <
                                    bot.roles.highest.position
                        )
                        .sort(
                            (a, b) =>
                                a.position -
                                b.position
                        );

                const current =
                    [...member.roles.cache.values()]
                        .filter(
                            role =>
                                !role.managed &&
                                role.id !==
                                    message.guild.id
                        )
                        .sort(
                            (a, b) =>
                                b.position -
                                a.position
                        )[0];

                let target;

                if (
                    command === "rank"
                ) {

                    target =
                        availableRoles.find(
                            role =>
                                !current ||
                                role.position >
                                    current.position
                        );

                } else {

                    target =
                        availableRoles
                            .filter(
                                role =>
                                    !current ||
                                    role.position <
                                        current.position
                            )
                            .pop();
                }

                if (!target) {
                    return message.reply(
                        "❌ Aucun rôle disponible."
                    );
                }

                if (current) {
                    await member.roles.remove(
                        current
                    ).catch(() => {});
                }

                await member.roles.add(
                    target
                );

                return message.reply(
                    `✅ ${member} est maintenant **${target.name}**.`
                );
            }

            /* =================================================
               NICKNAME — PERM 4
            ================================================= */

            if (
                command === "nickname" ||
                command === "nick"
            ) {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                const member =
                    getMember(
                        message,
                        args[0]
                    );

                if (!member) {
                    return message.reply(
                        "❌ Mentionne un membre."
                    );
                }

                const nickname =
                    args
                        .slice(1)
                        .join(" ") ||
                    null;

                await member.setNickname(
                    nickname
                );

                return message.reply(
                    nickname
                        ? `✅ Pseudo changé en **${nickname}**.`
                        : "✅ Pseudo réinitialisé."
                );
            }

            /* =================================================
               USERINFO — PERM 3
            ================================================= */

            if (
                command === "userinfo" ||
                command === "user"
            ) {

                if (
                    !await requirePermission(
                        message,
                        3
                    )
                ) return;

                const member =
                    getMember(
                        message,
                        args[0]
                    ) ||
                    message.member;

                const permission =
                    getPermission(
                        member
                    );

                const permissionName =
                    permission === 5
                        ? "Crown / Perm 5"
                        : permission > 0
                            ? `Perm ${permission} — ${ROLE_PERM[permission]}`
                            : "Aucune";

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                `👤 ${member.user.tag}`
                            )
                            .setThumbnail(
                                member.user.displayAvatarURL({
                                    dynamic: true,
                                    size: 512
                                })
                            )
                            .addFields(
                                {
                                    name: "ID",
                                    value:
                                        member.id,
                                    inline: true
                                },
                                {
                                    name:
                                        "Permission",
                                    value:
                                        permissionName,
                                    inline: true
                                },
                                {
                                    name:
                                        "Compte créé",
                                    value:
                                        `<t:${Math.floor(
                                            member.user.createdTimestamp /
                                            1000
                                        )}:F>`
                                },
                                {
                                    name:
                                        "Arrivée",
                                    value:
                                        member.joinedTimestamp
                                            ? `<t:${Math.floor(
                                                member.joinedTimestamp /
                                                1000
                                            )}:F>`
                                            : "Inconnue"
                                }
                            )
                            .setColor(
                                0x5865F2
                            )
                    ]
                });
            }

            /* =================================================
               STAT
            ================================================= */

            if (command === "stat") {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                const sub =
                    (
                        args[0] || ""
                    ).toLowerCase();

                if (!sub) {

                    return message.reply({
                        embeds: [
                            createStatsEmbed(
                                message.guild
                            )
                        ]
                    });
                }

                if (
                    sub === "setup"
                ) {

                    const channel =
                        message.mentions.channels.first();

                    if (!channel) {
                        return message.reply(
                            "❌ Mentionne le salon où envoyer les statistiques."
                        );
                    }

                    const config =
                        getGuildConfig(
                            message.guild.id
                        );

                    config.statChannel =
                        channel.id;

                    saveDatabase();

                    return message.reply(
                        `✅ Salon des statistiques configuré : ${channel}`
                    );
                }

                if (
                    sub === "send" ||
                    sub === "now"
                ) {

                    const sent =
                        await sendStats(
                            message.guild
                        );

                    if (!sent) {
                        return message.reply(
                            "❌ Aucun salon de statistiques n'est configuré."
                        );
                    }

                    return message.reply(
                        "✅ **Nouvel embed** de statistiques envoyé."
                    );
                }

                if (
                    sub === "heure"
                ) {

                    const hour =
                        args[1];

                    if (
                        !/^(?:[01]\d|2[0-3]):[0-5]\d$/
                            .test(
                                hour || ""
                            )
                    ) {
                        return message.reply(
                            "❌ Format invalide. Exemple : `+stat heure 23:00`"
                        );
                    }

                    const config =
                        getGuildConfig(
                            message.guild.id
                        );

                    config.statHour =
                        hour;

                    saveDatabase();

                    return message.reply(
                        `✅ Les statistiques seront envoyées automatiquement chaque jour à **${hour}**.`
                    );
                }
            }

            /* =================================================
               BIENVENUE
            ================================================= */

            if (command === "welcome") {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                const sub =
                    (
                        args[0] || ""
                    ).toLowerCase();

                const config =
                    getGuildConfig(
                        message.guild.id
                    );

                if (
                    sub === "channel"
                ) {

                    const channel =
                        message.mentions.channels.first();

                    if (!channel) {
                        return message.reply(
                            "❌ Mentionne un salon."
                        );
                    }

                    config.welcomeChannel =
                        channel.id;

                    saveDatabase();

                    return message.reply(
                        `✅ Salon de bienvenue : ${channel}`
                    );
                }

                if (
                    sub === "message"
                ) {

                    const text =
                        args
                            .slice(1)
                            .join(" ");

                    if (!text) {
                        return message.reply(
                            "❌ Indique le message."
                        );
                    }

                    config.welcomeMessage =
                        text;

                    saveDatabase();

                    return message.reply(
                        "✅ Message de bienvenue enregistré."
                    );
                }

                if (
                    sub === "image"
                ) {

                    const url =
                        args[1];

                    if (!url) {
                        return message.reply(
                            "❌ Indique une URL d'image."
                        );
                    }

                    config.welcomeImage =
                        url;

                    saveDatabase();

                    return message.reply(
                        "✅ Image de bienvenue enregistrée."
                    );
                }

                if (
                    sub === "on"
                ) {

                    config.welcomeEnabled =
                        true;

                    saveDatabase();

                    return message.reply(
                        "✅ Bienvenue activée."
                    );
                }

                if (
                    sub === "off"
                ) {

                    config.welcomeEnabled =
                        false;

                    saveDatabase();

                    return message.reply(
                        "✅ Bienvenue désactivée."
                    );
                }

                return message.reply(
                    "❌ Utilisation : `+welcome channel/message/image/on/off`"
                );
            }

            /* =================================================
               AUTOROLE
            ================================================= */

            if (
                command === "autorole"
            ) {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                const role =
                    getRole(
                        message,
                        args[0]
                    );

                if (!role) {
                    return message.reply(
                        "❌ Mentionne le rôle."
                    );
                }

                const config =
                    getGuildConfig(
                        message.guild.id
                    );

                config.autoRole =
                    role.id;

                saveDatabase();

                return message.reply(
                    `✅ Auto-rôle configuré : ${role}`
                );
            }

            /* =================================================
               LOGS
            ================================================= */

            if (
                command === "logs"
            ) {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                const channel =
                    message.mentions.channels.first();

                if (!channel) {
                    return message.reply(
                        "❌ Mentionne un salon."
                    );
                }

                const config =
                    getGuildConfig(
                        message.guild.id
                    );

                config.logsChannel =
                    channel.id;

                saveDatabase();

                return message.reply(
                    `✅ Salon des logs configuré : ${channel}`
                );
            }

        } catch (error) {

            console.error(
                "Erreur commande :",
                error
            );

            if (
                !message.replied
            ) {
                await message.reply(
                    "❌ Une erreur est survenue pendant l'exécution de la commande."
                ).catch(() => {});
            }
        }
    }
);
/* =========================================================
   TICKETS
========================================================= */

async function createTicketPanel(message) {

    const config = getGuildConfig(message.guild.id);

    config.ticketPanelChannel = message.channel.id;

    saveDatabase();

    const embed = new EmbedBuilder()
        .setTitle("🎫 Tickets")
        .setDescription(
            "Besoin d'aide ?\n\n" +
            "Clique sur le bouton ci-dessous pour ouvrir un ticket."
        )
        .setColor(0x5865F2);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("ticket_create")
            .setLabel("Ouvrir un ticket")
            .setStyle(ButtonStyle.Primary)
    );

    await message.channel.send({
        embeds: [embed],
        components: [row]
    });
}


/* =========================================================
   LEADERBOARD
========================================================= */

function getMessageLeaderboard(guild) {

    const activity =
        db.activity[guild.id]?.users || {};

    return Object.entries(activity)
        .sort(
            (a, b) =>
                (b[1].messages || 0) -
                (a[1].messages || 0)
        )
        .slice(0, 10);
}

function getVoiceLeaderboard(guild) {

    const activity =
        db.activity[guild.id]?.users || {};

    return Object.entries(activity)
        .sort(
            (a, b) =>
                (b[1].voiceSeconds || 0) -
                (a[1].voiceSeconds || 0)
        )
        .slice(0, 10);
}

function formatVoice(seconds) {

    seconds = Number(seconds) || 0;

    const hours =
        Math.floor(seconds / 3600);

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    return `${hours}h ${minutes}m`;
}

function createLeaderboardEmbed(guild) {

    const messages =
        getMessageLeaderboard(guild);

    const voice =
        getVoiceLeaderboard(guild);

    const messageText =
        messages.length
            ? messages.map(
                (entry, index) =>
                    `**${index + 1}.** <@${entry[0]}> — **${entry[1].messages || 0}** messages`
            ).join("\n")
            : "Aucune donnée.";

    const voiceText =
        voice.length
            ? voice.map(
                (entry, index) =>
                    `**${index + 1}.** <@${entry[0]}> — **${formatVoice(entry[1].voiceSeconds)}**`
            ).join("\n")
            : "Aucune donnée.";

    const duoData =
        db.activity[guild.id]?.duos || {};

    const duos =
        Object.entries(duoData)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            )
            .slice(0, 10);

    const duoText =
        duos.length
            ? duos.map(
                (entry, index) => {

                    const ids =
                        entry[0].split(":");

                    return (
                        `**${index + 1}.** ` +
                        `<@${ids[0]}> + <@${ids[1]}> — ` +
                        `**${formatVoice(entry[1])}**`
                    );
                }
            ).join("\n")
            : "Aucune donnée.";

    return new EmbedBuilder()
        .setTitle("🏆 Leaderboard Hirosaki")
        .addFields(
            {
                name: "💬 Top messages",
                value: messageText
            },
            {
                name: "🎙️ Top vocal",
                value: voiceText
            },
            {
                name: "👥 Top duo vocal",
                value: duoText
            }
        )
        .setColor(0x5865F2)
        .setTimestamp();
}

async function sendLeaderboard(guild) {

    const config =
        getGuildConfig(guild.id);

    if (!config.leaderboardChannel) {
        return false;
    }

    const channel =
        guild.channels.cache.get(
            config.leaderboardChannel
        );

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        return false;
    }

    await channel.send({
        embeds: [
            createLeaderboardEmbed(
                guild
            )
        ]
    });

    return true;
}


/* =========================================================
   GIVEAWAY
========================================================= */

async function finishGiveaway(
    guildId,
    giveawayId
) {

    const giveaway =
        db.giveaways[guildId]?.[giveawayId];

    if (!giveaway || giveaway.finished) {
        return;
    }

    giveaway.finished = true;

    const guild =
        client.guilds.cache.get(
            guildId
        );

    if (!guild) return;

    const channel =
        guild.channels.cache.get(
            giveaway.channelId
        );

    if (!channel) return;

    const entries =
        [...new Set(
            giveaway.entries || []
        )];

    if (!entries.length) {

        await channel.send(
            `🎉 Le giveaway **${giveaway.prize}** est terminé, mais personne n'a participé.`
        );

        saveDatabase();

        return;
    }

    const winners = [];

    const copy =
        [...entries];

    const count =
        Math.min(
            giveaway.winners,
            copy.length
        );

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const index =
            Math.floor(
                Math.random() *
                copy.length
            );

        winners.push(
            copy.splice(
                index,
                1
            )[0]
        );
    }

    const mentions =
        winners
            .map(
                id => `<@${id}>`
            )
            .join(", ");

    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("🎉 Giveaway terminé")
                .setDescription(
                    `**Prix :** ${giveaway.prize}\n\n` +
                    `🏆 Gagnant(s) : ${mentions}`
                )
                .setColor(0x57F287)
        ]
    });

    saveDatabase();
}


/* =========================================================
   COMMANDES TICKETS / LEADERBOARD / GIVEAWAY
========================================================= */

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
            parseArguments(
                message.content
                    .slice(PREFIX.length)
                    .trim()
            );

        const command =
            (args.shift() || "")
                .toLowerCase();

        if (!command) return;

        try {

            /* =============================================
               TICKET
            ============================================= */

            if (command === "ticket") {

                if (
                    !await requireTicketPermission(
                        message
                    )
                ) return;

                const sub =
                    (
                        args[0] || ""
                    ).toLowerCase();

                if (
                    sub === "setup"
                ) {

                    const category =
                        message.guild.channels.cache.find(
                            channel =>
                                channel.type ===
                                    ChannelType.GuildCategory &&
                                channel.name
                                    .toLowerCase() ===
                                    "tickets"
                        );

                    const config =
                        getGuildConfig(
                            message.guild.id
                        );

                    config.ticketCategory =
                        category
                            ? category.id
                            : null;

                    saveDatabase();

                    await createTicketPanel(
                        message
                    );

                    return;
                }

                if (
                    sub === "add"
                ) {

                    const member =
                        getMember(
                            message,
                            args[1]
                        );

                    const channel =
                        message.channel;

                    if (!member) {
                        return message.reply(
                            "❌ Mentionne le membre à ajouter."
                        );
                    }

                    await channel.permissionOverwrites.edit(
                        member,
                        {
                            ViewChannel: true,
                            SendMessages: true,
                            ReadMessageHistory: true
                        }
                    );

                    return message.reply(
                        `✅ ${member} a été ajouté au ticket.`
                    );
                }

                if (
                    sub === "remove"
                ) {

                    const member =
                        getMember(
                            message,
                            args[1]
                        );

                    if (!member) {
                        return message.reply(
                            "❌ Mentionne le membre à retirer."
                        );
                    }

                    await message.channel.permissionOverwrites.edit(
                        member,
                        {
                            ViewChannel: false,
                            SendMessages: false
                        }
                    );

                    return message.reply(
                        `✅ ${member} a été retiré du ticket.`
                    );
                }

                if (
                    sub === "claim"
                ) {

                    await message.channel.setTopic(
                        `Ticket pris en charge par ${message.author.tag}`
                    );

                    return message.reply(
                        `✅ Ticket pris en charge par ${message.author}.`
                    );
                }

                if (
                    sub === "rename"
                ) {

                    const name =
                        args
                            .slice(1)
                            .join("-");

                    if (!name) {
                        return message.reply(
                            "❌ Indique le nouveau nom."
                        );
                    }

                    await message.channel.setName(
                        name
                    );

                    return message.reply(
                        `✅ Ticket renommé en **${name}**.`
                    );
                }

                if (
                    sub === "close"
                ) {

                    await message.reply(
                        "🔒 Fermeture du ticket..."
                    );

                    setTimeout(
                        () =>
                            message.channel
                                .delete()
                                .catch(() => {}),
                        1500
                    );

                    return;
                }

                return message.reply(
                    "❌ Commandes : `+ticket setup`, `add`, `remove`, `claim`, `rename`, `close`"
                );
            }


            /* =============================================
               LEADERBOARD
            ============================================= */

            if (
                command === "leaderboard" ||
                command === "lb"
            ) {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                const sub =
                    (
                        args[0] || ""
                    ).toLowerCase();

                const config =
                    getGuildConfig(
                        message.guild.id
                    );

                if (
                    sub === "send"
                ) {

                    const channel =
                        message.mentions.channels.first();

                    if (channel) {

                        config.leaderboardChannel =
                            channel.id;

                        saveDatabase();
                    }

                    const sent =
                        await sendLeaderboard(
                            message.guild
                        );

                    if (!sent) {

                        return message.reply(
                            "❌ Configure d'abord le salon du leaderboard."
                        );
                    }

                    return message.reply(
                        "✅ Leaderboard envoyé."
                    );
                }

                if (
                    sub === "channel"
                ) {

                    const channel =
                        message.mentions.channels.first();

                    if (!channel) {
                        return message.reply(
                            "❌ Mentionne un salon."
                        );
                    }

                    config.leaderboardChannel =
                        channel.id;

                    saveDatabase();

                    return message.reply(
                        `✅ Salon du leaderboard : ${channel}`
                    );
                }

                if (
                    sub === "day"
                ) {

                    const day =
                        Number(args[1]);

                    if (
                        !Number.isInteger(day) ||
                        day < 0 ||
                        day > 6
                    ) {
                        return message.reply(
                            "❌ Jour invalide. Utilise 0 à 6."
                        );
                    }

                    config.leaderboardDay =
                        day;

                    saveDatabase();

                    return message.reply(
                        `✅ Jour du leaderboard configuré : **${day}**.`
                    );
                }

                if (
                    sub === "hour"
                ) {

                    const hour =
                        args[1];

                    if (
                        !/^(?:[01]\d|2[0-3]):[0-5]\d$/
                            .test(
                                hour || ""
                            )
                    ) {
                        return message.reply(
                            "❌ Format : `20:00`"
                        );
                    }

                    config.leaderboardHour =
                        hour;

                    saveDatabase();

                    return message.reply(
                        `✅ Heure configurée : **${hour}**.`
                    );
                }

                return message.reply({
                    embeds: [
                        createLeaderboardEmbed(
                            message.guild
                        )
                    ]
                });
            }


            /* =============================================
               GIVEAWAY
            ============================================= */

            if (
                command === "giveaway" ||
                command === "gw"
            ) {

                if (
                    !await requirePermission(
                        message,
                        4
                    )
                ) return;

                const sub =
                    (
                        args[0] || ""
                    ).toLowerCase();

                if (
                    sub === "create"
                ) {

                    const duration =
                        Number(args[1]);

                    const winners =
                        Number(args[2]);

                    const prize =
                        args
                            .slice(3)
                            .join(" ");

                    if (
                        !Number.isInteger(
                            duration
                        ) ||
                        duration < 1
                    ) {
                        return message.reply(
                            "❌ Durée invalide."
                        );
                    }

                    if (
                        !Number.isInteger(
                            winners
                        ) ||
                        winners < 1
                    ) {
                        return message.reply(
                            "❌ Nombre de gagnants invalide."
                        );
                    }

                    if (!prize) {
                        return message.reply(
                            "❌ Indique le lot."
                        );
                    }

                    const id =
                        Date.now().toString();

                    db.giveaways[
                        message.guild.id
                    ] ??= {};

                    db.giveaways[
                        message.guild.id
                    ][id] = {
                        channelId:
                            message.channel.id,
                        prize,
                        winners,
                        entries: [],
                        finished: false,
                        end:
                            Date.now() +
                            duration * 60000
                    };

                    saveDatabase();

                    const row =
                        new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(
                                        `giveaway_join_${id}`
                                    )
                                    .setLabel(
                                        "Participer"
                                    )
                                    .setStyle(
                                        ButtonStyle.Success
                                    )
                            );

                    await message.channel.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    "🎉 GIVEAWAY"
                                )
                                .setDescription(
                                    `**Prix :** ${prize}\n` +
                                    `**Gagnants :** ${winners}\n\n` +
                                    `⏱️ Fin dans **${duration} minute(s)**`
                                )
                                .setColor(
                                    0x57F287
                                )
                        ],
                        components: [row]
                    });

                    setTimeout(
                        () =>
                            finishGiveaway(
                                message.guild.id,
                                id
                            ),
                        duration * 60000
                    );

                    return;
                }

                if (
                    sub === "end"
                ) {

                    const id =
                        args[1];

                    if (!id) {
                        return message.reply(
                            "❌ ID du giveaway manquant."
                        );
                    }

                    await finishGiveaway(
                        message.guild.id,
                        id
                    );

                    return message.reply(
                        "✅ Giveaway terminé."
                    );
                }

                return message.reply(
                    "❌ Utilisation : `+giveaway create <minutes> <gagnants> <lot>`"
                );
            }


            /* =============================================
               AUTOROLL
            ============================================= */

            if (
                command === "autoroll"
            ) {

                if (
                    !await requirePermission(
                        message,
                        5
                    )
                ) return;

                const sub =
                    (
                        args[0] || ""
                    ).toLowerCase();

                const config =
                    getGuildConfig(
                        message.guild.id
                    );

                if (
                    sub === "on"
                ) {

                    config.autoRoll.enabled =
                        true;

                    saveDatabase();

                    return message.reply(
                        "✅ Auto-roll activé."
                    );
                }

                if (
                    sub === "off"
                ) {

                    config.autoRoll.enabled =
                        false;

                    saveDatabase();

                    return message.reply(
                        "✅ Auto-roll désactivé."
                    );
                }

                if (
                    sub === "interval"
                ) {

                    const minutes =
                        Number(args[1]);

                    if (
                        !Number.isInteger(
                            minutes
                        ) ||
                        minutes < 1
                    ) {
                        return message.reply(
                            "❌ Indique un nombre de minutes valide."
                        );
                    }

                    config.autoRoll.interval =
                        minutes;

                    saveDatabase();

                    return message.reply(
                        `✅ Intervalle auto-roll : **${minutes} minute(s)**.`
                    );
                }

                return message.reply(
                    "❌ Utilisation : `+autoroll on/off/interval <minutes>`"
                );
            }

        } catch (error) {

            console.error(
                "Erreur :",
                error
            );

            if (
                !message.replied &&
                !message.deferred
            ) {
                await message.reply(
                    "❌ Une erreur est survenue."
                ).catch(() => {});
            }
        }
    }
);


/* =========================================================
   BOUTONS
========================================================= */

client.on(
    "interactionCreate",
    async interaction => {

        if (
            !interaction.isButton()
        ) {
            return;
        }

        try {

            /* =============================================
               CRÉATION TICKET
            ============================================= */

            if (
                interaction.customId ===
                "ticket_create"
            ) {

                const guild =
                    interaction.guild;

                const config =
                    getGuildConfig(
                        guild.id
                    );

                const existing =
                    guild.channels.cache.find(
                        channel =>
                            channel.name ===
                            `ticket-${interaction.user.id}`
                    );

                if (existing) {

                    return interaction.reply({
                        content:
                            `❌ Tu as déjà un ticket : ${existing}`,
                        ephemeral: true
                    });
                }

                const permissionOverwrites = [
                    {
                        id:
                            guild.roles.everyone.id,
                        deny: [
                            PermissionFlagsBits.ViewChannel
                        ]
                    },
                    {
                        id:
                            interaction.user.id,
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
                            ROLE_TICKET
                    );

                if (ticketRole) {

                    permissionOverwrites.push({
                        id:
                            ticketRole.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    });
                }

                const crown =
                    guild.roles.cache.find(
                        role =>
                            role.name ===
                            ROLE_CROWN
                    );

                if (crown) {

                    permissionOverwrites.push({
                        id:
                            crown.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    });
                }

                const channel =
                    await guild.channels.create({
                        name:
                            `ticket-${interaction.user.id}`,
                        type:
                            ChannelType.GuildText,
                        parent:
                            config.ticketCategory ||
                            undefined,
                        permissionOverwrites
                    });

                await channel.send({
                    content:
                        `${interaction.user} <@&${ticketRole?.id || ""}>`,
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(
                                "🎫 Ticket ouvert"
                            )
                            .setDescription(
                                "Explique ton problème ici.\n\n" +
                                "Le staff va venir t'aider."
                            )
                            .setColor(
                                0x5865F2
                            )
                    ]
                });

                return interaction.reply({
                    content:
                        `✅ Ton ticket a été créé : ${channel}`,
                    ephemeral: true
                });
            }


            /* =============================================
               GIVEAWAY PARTICIPATION
            ============================================= */

            if (
                interaction.customId
                    .startsWith(
                        "giveaway_join_"
                    )
            ) {

                const id =
                    interaction.customId
                        .replace(
                            "giveaway_join_",
                            ""
                        );

                const giveaways =
                    db.giveaways[
                        interaction.guild.id
                    ];

                const giveaway =
                    giveaways?.[id];

                if (
                    !giveaway ||
                    giveaway.finished
                ) {

                    return interaction.reply({
                        content:
                            "❌ Ce giveaway est terminé.",
                        ephemeral: true
                    });
                }

                if (
                    Date.now() >=
                    giveaway.end
                ) {

                    await finishGiveaway(
                        interaction.guild.id,
                        id
                    );

                    return interaction.reply({
                        content:
                            "❌ Ce giveaway est terminé.",
                        ephemeral: true
                    });
                }

                giveaway.entries ??= [];

                if (
                    giveaway.entries.includes(
                        interaction.user.id
                    )
                ) {

                    return interaction.reply({
                        content:
                            "❌ Tu participes déjà à ce giveaway.",
                        ephemeral: true
                    });
                }

                giveaway.entries.push(
                    interaction.user.id
                );

                saveDatabase();

                return interaction.reply({
                    content:
                        "✅ Tu participes maintenant au giveaway !",
                    ephemeral: true
                });
            }

        } catch (error) {

            console.error(
                "Interaction error :",
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.reply({
                    content:
                        "❌ Une erreur est survenue.",
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
);


/* =========================================================
   EMBED DES COMMANDES / PERMISSIONS
========================================================= */

function createPermissionEmbeds() {

    const pages = [];

    pages.push(
        new EmbedBuilder()
            .setTitle(
                "📚 Commandes — Perm 0"
            )
            .setDescription(
                "**Gestion ticket**\n\n" +
                "`+ticket setup`\n" +
                "`+ticket add`\n" +
                "`+ticket remove`\n" +
                "`+ticket claim`\n" +
                "`+ticket rename`\n" +
                "`+ticket close`"
            )
            .setColor(
                0x5865F2
            )
    );

    pages.push(
        new EmbedBuilder()
            .setTitle(
                "📚 Commandes — Perm 1"
            )
            .setDescription(
                "**Modérateur test**\n\n" +
                "Toutes les commandes de la Perm 0.\n\n" +
                "`+snipe`"
            )
            .setColor(
                0x5865F2
            )
    );

    pages.push(
        new EmbedBuilder()
            .setTitle(
                "📚 Commandes — Perm 2"
            )
            .setDescription(
                "**Modérateur**\n\n" +
                "Toutes les commandes des Perms précédentes.\n\n" +
                "`+warn`\n" +
                "`+unwarn`\n" +
                "`+warnings`\n" +
                "`+sanctions`\n" +
                "`+blacklist`"
            )
            .setColor(
                0x5865F2
            )
    );

    pages.push(
        new EmbedBuilder()
            .setTitle(
                "📚 Commandes — Perm 3"
            )
            .setDescription(
                "**Staff confirmé**\n\n" +
                "Toutes les commandes précédentes.\n\n" +
                "`+kick`\n" +
                "`+ban`\n" +
                "`+unban`\n" +
                "`+mute`\n" +
                "`+unmute`\n" +
                "`+timeout`\n" +
                "`+untimeout`\n" +
                "`+userinfo`"
            )
            .setColor(
                0x5865F2
            )
    );

    pages.push(
        new EmbedBuilder()
            .setTitle(
                "📚 Commandes — Perm 4"
            )
            .setDescription(
                "**Responsable staff**\n\n" +
                "Toutes les commandes précédentes.\n\n" +
                "`+clear`\n" +
                "`+purge`\n" +
                "`+lock`\n" +
                "`+unlock`\n" +
                "`+slowmode`\n" +
                "`+role add`\n" +
                "`+role remove`\n" +
                "`+rank`\n" +
                "`+derank`\n" +
                "`+nickname`\n" +
                "`+stat`\n" +
                "`+welcome`\n" +
                "`+autorole`\n" +
                "`+logs`\n" +
                "`+leaderboard`\n" +
                "`+giveaway`"
            )
            .setColor(
                0x5865F2
            )
    );

    pages.push(
        new EmbedBuilder()
            .setTitle(
                "📚 Commandes — Perm 5"
            )
            .setDescription(
                "**Co-owner**\n\n" +
                "Accès à toutes les commandes.\n\n" +
                "Configuration avancée du bot.\n" +
                "`+autoroll on`\n" +
                "`+autoroll off`\n" +
                "`+autoroll interval`"
            )
            .setColor(
                0x5865F2
            )
    );

    pages.push(
        new EmbedBuilder()
            .setTitle(
                "👑 Crown"
            )
            .setDescription(
                "**Accès total au bot.**\n\n" +
                "Crown peut utiliser et configurer toutes les fonctionnalités."
            )
            .setColor(
                0xF1C40F
            )
    );

    return pages;
}

async function sendCommandHelp(
    message
) {

    const pages =
        createPermissionEmbeds();

    let currentPage = 0;

    const getRow = () =>
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        "help_previous"
                    )
                    .setLabel(
                        "◀"
                    )
                    .setStyle(
                        ButtonStyle.Secondary
                    )
                    .setDisabled(
                        currentPage === 0
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        "help_next"
                    )
                    .setLabel(
                        "▶"
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
        await message.reply({
            embeds: [
                pages[currentPage]
            ],
            components: [
                getRow()
            ]
        });

    const collector =
        sent.createMessageComponentCollector({
            time: 300000
        });

    collector.on(
        "collect",
        async interaction => {

            if (
                interaction.user.id !==
                message.author.id
            ) {

                return interaction.reply({
                    content:
                        "❌ Ce menu ne t'appartient pas.",
                    ephemeral: true
                });
            }

            if (
                interaction.customId ===
                "help_previous"
            ) {

                currentPage =
                    Math.max(
                        0,
                        currentPage - 1
                    );
            }

            if (
                interaction.customId ===
                "help_next"
            ) {

                currentPage =
                    Math.min(
                        pages.length - 1,
                        currentPage + 1
                    );
            }

            await interaction.update({
                embeds: [
                    pages[currentPage]
                ],
                components: [
                    getRow()
                ]
            });
        }
    );

    collector.on(
        "end",
        async () => {

            await sent.edit({
                components: []
            }).catch(() => {});
        }
    );
}


/* =========================================================
   AUTOMATISATIONS
========================================================= */

function getCurrentTime() {

    return new Date()
        .toLocaleTimeString(
            "fr-FR",
            {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            }
        );
}

setInterval(
    async () => {

        const now =
            new Date();

        const day =
            now.getDay();

        const time =
            getCurrentTime();

        for (
            const guild
            of client.guilds.cache.values()
        ) {

            const config =
                getGuildConfig(
                    guild.id
                );

            /* =============================================
               STAT AUTOMATIQUE
            ============================================= */

            if (
                config.statChannel &&
                config.statHour === time
            ) {

                if (
                    !config._lastStat ||
                    Date.now() -
                        config._lastStat >
                        60000
                ) {

                    await sendStats(
                        guild
                    ).catch(() => {});

                    config._lastStat =
                        Date.now();

                    saveDatabase();
                }
            }

            /* =============================================
               LEADERBOARD AUTOMATIQUE
            ============================================= */

            if (
                config.leaderboardChannel &&
                Number(
                    config.leaderboardDay
                ) === day &&
                config.leaderboardHour === time
            ) {

                if (
                    !config._lastLeaderboard ||
                    Date.now() -
                        config._lastLeaderboard >
                        60000
                ) {

                    await sendLeaderboard(
                        guild
                    ).catch(() => {});

                    config._lastLeaderboard =
                        Date.now();

                    saveDatabase();
                }
            }
        }

    },
    60000
);


/* =========================================================
   AUTO-ROLL
========================================================= */

setInterval(
    async () => {

        for (
            const guild
            of client.guilds.cache.values()
        ) {

            const config =
                getGuildConfig(
                    guild.id
                );

            if (
                !config.autoRoll.enabled
            ) {
                continue;
            }

            const channel =
                config.leaderboardChannel
                    ? guild.channels.cache.get(
                        config.leaderboardChannel
                    )
                    : null;

            if (
                !channel ||
                !channel.isTextBased()
            ) {
                continue;
            }

            const messages =
                await channel.messages.fetch({
                    limit: 50
                }).catch(() => null);

            if (!messages) continue;

            const users =
                [...messages.values()]
                    .filter(
                        msg =>
                            !msg.author.bot
                    );

            if (!users.length) continue;

            const winner =
                users[
                    Math.floor(
                        Math.random() *
                        users.length
                    )
                ];

            await channel.send(
                `🎲 **Auto-roll** : ${winner.author} a été tiré au sort !`
            ).catch(() => {});
        }

    },
    60000
);


/* =========================================================
   LOGIN
========================================================= */

if (!TOKEN) {

    console.error(
        "❌ TOKEN introuvable. Ajoute DISCORD_TOKEN ou TOKEN dans les variables d'environnement."
    );

} else {

    client.login(
        TOKEN
    ).catch(
        error =>
            console.error(
                "❌ Impossible de connecter le bot :",
                error
            )
    );
}