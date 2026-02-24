const { SlashCommandBuilder } = require('discord.js')

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Pings Bot'),
    async execute(interaction) {
        await interaction.reply("pong")
    }
}