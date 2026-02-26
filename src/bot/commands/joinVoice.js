const { SlashCommandBuilder, Events, NewsChannel } = require('discord.js')
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');

// Module To Run
module.exports = {
    // Basic Command Info
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Joins Users Current Voice Channel'),
    
    // Actual Command Logic
    async execute(interaction) {
        
        // Destroy Any Existing Voice Connection
        const existing = getVoiceConnection(interaction.guild.id);
        if (existing) {
            existing.destroy(); // leave current channel
        }

        // Get User and VC they're in
        const member = await interaction.guild.members.fetch(interaction.user);
        const vc = member.voice.channel;

        // If They Aren't, reply and finish
        if (!vc) {
            await interaction.reply(`${member.user.tag} is not in a voice channel.`);
            return;
        } 

        // Get Client
        const client = interaction.client

        // Otherwise, join their reply and join the channel
        await interaction.reply(`${member.user.tag} is in: ${vc.name}`);
        const connection = joinVoiceChannel({
            channelId: vc.id,
            guildId: interaction.guildId,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false
        })

        // Voice Event Logic

        // On Green Circle Start
        connection.receiver.speaking.on('start', (userId) => {
            client.emit('voiceActivity', {
                type: 'start',
                guildId: interaction.guildId,
                channelId: interaction.member.voice.channelId,
                userId,
                at: Date.now(),
            });
        });
        
        // On Green Circle Ending
        connection.receiver.speaking.on('end', (userId) => {
            client.emit('voiceActivity', {
                type: 'end',
                guildId: interaction.guildId,
                channelId: interaction.member.voice.channelId,
                userId,
                at: Date.now(),
            });
        });
        
        // Mute and Deafened Events
        client.on(Events.VoiceStateUpdate, (oldState, newState) => {
            const userId = newState.id
            const guildId = newState.guildId
            const channelId = newState.channelId

            const newMuted = newState.serverMute || newState.selfMute
            const oldMuted = oldState.serverMute || oldState.selfMute
            if (oldMuted !== newMuted) {
                client.emit('voiceActivity', {
                    type: newMuted ? 'mute' : 'unmute',
                    guildId,
                    channelId,
                    userId,
                    at: Date.now(),
                });
            }

            const newDeafened = newState.serverDeaf || newState.selfDeaf
            const oldDeafened = oldState.serverDeaf || oldState.selfDeaf
            if (oldDeafened !== newDeafened) {
                client.emit('voiceActivity', {
                    type: newDeafened ? 'deaf' : 'undeaf',
                    guildId,
                    channelId,
                    userId,
                    at: Date.now(),
                });
            }
        })
    }
}