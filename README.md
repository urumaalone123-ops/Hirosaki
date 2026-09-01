# Hirosaki Discord Bot

Bot Discord à commandes préfixées pour le serveur Hirosaki.

## Installation

```bash
pnpm install
```

Ajoute le token du bot dans les secrets Replit sous le nom `DISCORD_TOKEN`.
En local, copie `.env.example` vers `.env` et renseigne la variable.

## Lancement

```bash
pnpm run dev
```

Vérification de syntaxe :

```bash
pnpm run check
```

Le bot utilise `+` comme préfixe. Les données persistantes sont enregistrées
dans `data/hirosaki.json`, qui n'est pas versionné par Git.

## Commandes principales

### Permissions

- **Perm 0 — Gestion ticket** : `+ticket-add`, `+ticket-close`, `+ticket-claim`
- **Perm 1 — Modérateur test** : `+snipe`
- **Perm 2 — Modérateur** : `+warn`, `+unwarn`, `+sanction`, `+all-sanction`, `+clear-sanction`
- **Perm 3 — Staff confirmé** : `+kick`, `+mute`, `+unmute`, `+clear`, `+purge`
- **Perm 4 — Responsable staff** : rôles, autorole, bienvenue, embeds, tickets, giveaways, planification et DM de sanctions
- **Perm 5 — Co owner** : `+ban`, `+unban`, `+unbanall`, `+banlist`
- **Crown uniquement** : `+rank`, `+derank`

Les rôles de permission sont cumulatifs : un rôle de niveau supérieur hérite
des commandes des niveaux inférieurs.

### Utilitaires

```text
+help
+stat
+leaderboard
+snipe
+addrole @membre @role
+remove-role @membre @role
+autorole @role
+autorole off
+welcome #salon
+welcome-message <texte>
+dm on|off
+dm message <texte>
+embed #salon | titre | description
+joinvoice
```

### Sanctions

```text
+warn @membre [raison]
+unwarn @membre <id-sanction>
+sanction @membre
+all-sanction
+kick @membre [raison]
+mute @membre 10m [raison]
+unmute @membre
+ban @membre [raison]
+unban <id-utilisateur>
+unbanall
+banlist
+clear-sanction @membre
```

Les variantes `+all sanction`, `+clear sanction` et `+remove roll` sont aussi
acceptées pour rester compatibles avec le cahier des charges.

### Tickets et giveaways

```text
+ticket-config on|off
+ticket-config category #catégorie
+ticket-config panel #salon
+ticket panel
+ticket-add @membre
+ticket-claim
+ticket-close

+giveaway start 1h 1 <prix>
+giveaway end <id>
+giveaway reroll <id>
```

## Permissions Discord à activer

Le bot a besoin des intents **Message Content**, **Server Members** et
**Presence** dans le portail développeur Discord. Sur le serveur, donne-lui au
minimum la gestion des messages, rôles, salons, membres, modération, bannissements
et la connexion/parole dans les salons vocaux selon les modules utilisés.

Place le rôle du bot au-dessus des rôles qu'il doit attribuer ou modérer.