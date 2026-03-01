// Imports
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getVoiceConnection, EndBehaviorType } = require('@discordjs/voice');

// Local Imports
const {
	initVoicePresence,
	getUserVoiceGuild,
	getUserVoiceChannel,
	getUsersForChannel,
	addUserToVoicePresence,
	removeUserFromVoicePresence,
} = require("./voicePresence");

// Discord Many Imports
const {
	Client,
	GatewayIntentBits,
	Collection,
	Events,
	MessageFlags,
	REST,
	Routes,
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
})



// Gather Commands from commands folder
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	} else {
		consoleLogger(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

// Command Executer 
client.on(Events.InteractionCreate, async (interaction) => {
	// If Not Command
	if (!interaction.isChatInputCommand()) return;

	// Get Command
	const command = interaction.client.commands.get(interaction.commandName);
	
	// If Command Invalid
	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	// Try To Run Command
	try {
		await command.execute(interaction);
	
	// Command Run Error
	// Inform of Fail
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.reply({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		}
	}
});

// Command Registerer
async function registerCommands() {
	const commands = client.commands.map((command) => command.data.toJSON());
	const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
	const appId = process.env.WEB_CLIENT_ID;

	// PUT Commands
	await rest.put(Routes.applicationCommands(appId), { body: commands });
	consoleLogger(`Registered ${commands.length} global command(s).`);
}

// Voice state listener
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
	const userId = newState.id;
	const guildId = newState.guildId;
	const channelId = newState.channelId;

	if (userId === client.user?.id) {
		const botDisconnected = !!oldState.channelId && !newState.channelId;
		if (botDisconnected) {
			getVoiceConnection(guildId)?.destroy();
		}
		return;
	}

	const disconnected = !!oldState.channelId && !newState.channelId;

	if (disconnected) {
		removeUserFromVoicePresence(userId);
		return;
	}

	const connected = !oldState.channelId && !!newState.channelId;
	if (connected) {
		addUserToVoicePresence(userId, guildId, newState.channelId);
	}

	const moved = !!oldState.channelId && !!newState.channelId && oldState.channelId !== newState.channelId;
	if (moved) {
		addUserToVoicePresence(userId, guildId, newState.channelId);
	}

	const newMuted = newState.serverMute || newState.selfMute;
	const oldMuted = oldState.serverMute || oldState.selfMute;
	if (oldMuted !== newMuted) {
		client.emit('voiceActivity', {
			type: newMuted ? 'mute' : 'unmute',
			guildId,
			channelId,
			userId,
			username: newState.member?.user?.username ?? userId,
			at: Date.now(),
		});
	}

	const newDeafened = newState.serverDeaf || newState.selfDeaf;
	const oldDeafened = oldState.serverDeaf || oldState.selfDeaf;
	if (oldDeafened !== newDeafened) {
		client.emit('voiceActivity', {
			type: newDeafened ? 'deaf' : 'undeaf',
			guildId,
			channelId,
			userId,
			username: newState.member?.user?.username ?? userId,
			at: Date.now(),
		});
	}
});

// Return All Users In User's Voice
async function getVoiceUsers(id) {
	const users = []
	try {
		// Guild Validation
		let guildId = getUserVoiceGuild(id)
		let channelId = getUserVoiceChannel(id)
		let guild = client.guilds.cache.get(guildId)

		// Recovery path: if presence was missed, locate the user from guild voice state.
		if (!guildId || !channelId || !guild) {
			for (const cachedGuild of client.guilds.cache.values()) {
				const member = cachedGuild.members.cache.get(id) ?? await cachedGuild.members.fetch(id).catch(() => null)
				const memberChannelId = member?.voice?.channelId
				if (!memberChannelId) continue

				guildId = cachedGuild.id
				channelId = memberChannelId
				guild = cachedGuild
				addUserToVoicePresence(id, guildId, channelId)
				break
			}
		}

		if (!guild || !channelId) return users

		// Get users from voicePresence inverse index instead of channel member iteration.
		const userIds = getUsersForChannel(guildId, channelId);
		for (const userId of userIds) {
			const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
			if (!member) continue;

			users.push({
				userId,
				username: member.user?.username ?? userId,
				avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 64 }),
			})
		}
	} catch (err) {
		consoleLogger("Invalid Voice Users Request")
	}
	return users

	
}

async function getVoiceLocation(userId) {
	let guildId = getUserVoiceGuild(userId)
	let channelId = getUserVoiceChannel(userId)
	if (guildId && channelId) {
		return { guildId, channelId }
	}

	for (const cachedGuild of client.guilds.cache.values()) {
		const member = cachedGuild.members.cache.get(userId) ?? await cachedGuild.members.fetch(userId).catch(() => null)
		const memberChannelId = member?.voice?.channelId
		if (!memberChannelId) continue
		addUserToVoicePresence(userId, cachedGuild.id, memberChannelId)
		guildId = cachedGuild.id
		channelId = memberChannelId
		break
	}

	if (!guildId || !channelId) return null
	return { guildId, channelId }
}

async function isBotInSameVoiceChannel(userId) {
	const userVoice = await getVoiceLocation(userId)
	if (!userVoice) {
		return {
			userInVoice: false,
			botInVoice: false,
			inSameChannel: false,
		}
	}

	const guild = client.guilds.cache.get(userVoice.guildId)
	const botMember = guild
		? (guild.members.cache.get(client.user.id) ?? await guild.members.fetch(client.user.id).catch(() => null))
		: null
	const botChannelId = botMember?.voice?.channelId ?? null
	return {
		userInVoice: true,
		botInVoice: !!botChannelId,
		inSameChannel: botChannelId === userVoice.channelId,
	}
}

// Ready Printer
client.once(Events.ClientReady, async (c) => {
	consoleLogger(`${c.user.username} Is Ready`)
	try {
		await registerCommands();
	} catch (error) {
		console.error("Failed to register commands:", error);
	}
});

// Exit Logic
async function shutdown(signal) {
  consoleLogger(`Received ${signal}, shutting down...`);

  try {
    // Close voice connections
    for (const guildId of client.guilds.cache.keys()) {
        getVoiceConnection(guildId)?.destroy();
    }
    // disconnect bot cleanly
    await client.destroy(); 
    } catch (err) {
        console.error('Shutdown error:', err);
    } finally {
        process.exit(0);
    }
}

// Ctrl+C
process.on('SIGINT', () => shutdown('SIGINT'));  
// container/system stop 
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start Bot Function
// Returns Active Bot Client
async function startBot() {
	// Start Bot
	await client.login(process.env.TOKEN)

	// Wait until Bot is Ready
	await new Promise((resolve) => client.once(Events.ClientReady, resolve))
	initVoicePresence(client.user.id)
	client.getVoiceUsers = getVoiceUsers
	client.isBotInSameVoiceChannel = isBotInSameVoiceChannel
	// Return Client
	return client
}

// Log To Console Marked as Bot
function consoleLogger(message) {
	console.info(`[Bot] ${message}`)
}

module.exports = { startBot, getVoiceUsers, isBotInSameVoiceChannel }
