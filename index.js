
require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Events,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    AttachmentBuilder
} = require('discord.js');

// ==========================================
// FLORIDA UTILITIES CONFIGURATION
// ==========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const CONFIG = {
    name: 'Florida Utilities',

    categories: {
        general: '1562298345123479562',
        partnerships: '1562298787978805359',
        staffing: '1562298185198866532',
        internal: '1562300412453847050'
    },

    roles: {
        general: '1555989360342597672',
        partnerships: '1555989323634049106',
        staffing: '1560070051594244126',
        internal: '1555989338263654431'
    },

    supportChannel: '1555989576915484753',

    // Ticket logs and transcripts are sent here.
    logChannel: '1556331611841237003',

    footerImage:
        'https://cdn.discordapp.com/attachments/1548084365249093694/1562304431813304380/Florida_Utilities__Reliable_Service.png?ex=6ad980e2&is=6ad82f62&hm=3f3db1de35f9ea8e4ce046d64d736a890033142c937fd18b7d47339a7a1e894e',

    deleteDelay: 10000
};

const DEPARTMENTS = {
    general: {
        label: 'General Support',
        emoji: '🎫',
        color: 0x3498DB
    },
    partnerships: {
        label: 'Partnerships',
        emoji: '🤝',
        color: 0x9B59B6
    },
    staffing: {
        label: 'Staffing',
        emoji: '👥',
        color: 0x2ECC71
    },
    internal: {
        label: 'Internal Affairs',
        emoji: '⚖️',
        color: 0xE67E22
    }
};

// ==========================================
// SLASH COMMANDS
// ==========================================

const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check whether Florida Utilities is online.'),

    new SlashCommandBuilder()
        .setName('ticketpanel')
        .setDescription('Post the ticket panel.')
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    new SlashCommandBuilder()
        .setName('dashboardpanel')
        .setDescription('Post the support dashboard.')
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    new SlashCommandBuilder()
        .setName('addmember')
        .setDescription('Add a member to the current ticket.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The member to add to this ticket.')
                .setRequired(true)
        )
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(
    process.env.DISCORD_TOKEN
);

// ==========================================
// GENERAL HELPERS
// ==========================================

function isTicket(channel) {
    return Boolean(
        channel &&
        channel.type === ChannelType.GuildText &&
        channel.topic?.includes('Ticket Owner:')
    );
}

function isOpenTicket(channel) {
    return isTicket(channel) &&
        channel.topic.includes('Status: Open');
}

function getTicketOwnerId(channel) {
    return channel.topic?.match(/Ticket Owner: (\d+)/)?.[1] ?? null;
}

function getDepartmentKey(channel) {
    const match = channel.topic?.match(/Department: ([^|]+)/);
    const name = match?.[1]?.trim();

    return Object.keys(DEPARTMENTS).find(
        key => DEPARTMENTS[key].label === name
    ) ?? null;
}

function getClaimedUserId(channel) {
    return channel.topic?.match(/Claimed By: (\d+)/)?.[1] ?? null;
}

function isAuthorizedTicketStaff(member, departmentKey) {
    if (!member || !departmentKey) return false;

    return member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.roles.cache.has(CONFIG.roles[departmentKey]);
}

function safeFileName(value) {
    return value
        .replace(/[^a-z0-9-_]/gi, '-')
        .replace(/-+/g, '-')
        .slice(0, 70);
}

async function getLogChannel(guild) {
    const channel = await guild.channels.fetch(
        CONFIG.logChannel
    ).catch(error => {
        console.error('Could not fetch ticket log channel:', error);
        return null;
    });

    if (!channel || channel.type !== ChannelType.GuildText) {
        console.error(
            `Ticket log channel ${CONFIG.logChannel} is missing or is not a text channel.`
        );
        return null;
    }

    return channel;
}

// ==========================================
// TRANSCRIPT GENERATOR
// ==========================================

// Fetches the complete accessible message history in chronological order.
// Produces a readable .txt transcript, including attachments and embeds.
async function createTicketTranscript(channel, closureReason) {
    const allMessages = [];
    let before;

    while (true) {
        const options = { limit: 100 };

        if (before) {
            options.before = before;
        }

        const batch = await channel.messages.fetch(options);

        if (batch.size === 0) break;

        allMessages.push(...batch.values());

        before = batch.last().id;

        if (batch.size < 100) break;
    }

    allMessages.sort(
        (a, b) => a.createdTimestamp - b.createdTimestamp
    );

    const ownerId = getTicketOwnerId(channel);
    const departmentKey = getDepartmentKey(channel);
    const claimedId = getClaimedUserId(channel);

    const lines = [
        'FLORIDA UTILITIES - TICKET TRANSCRIPT',
        '======================================',
        `Server: ${channel.guild.name}`,
        `Server ID: ${channel.guild.id}`,
        `Ticket channel: #${channel.name}`,
        `Ticket channel ID: ${channel.id}`,
        `Ticket opener ID: ${ownerId || 'Unknown'}`,
        `Department: ${
            departmentKey
                ? DEPARTMENTS[departmentKey].label
                : 'Unknown'
        }`,
        `Claimed by ID: ${claimedId || 'Nobody'}`,
        `Closure reason: ${closureReason}`,
        `Transcript generated: ${new Date().toISOString()}`,
        '',
        'MESSAGES',
        '========',
        ''
    ];

    for (const message of allMessages) {
        const timestamp = new Date(message.createdTimestamp).toISOString();

        const author = message.author
            ? `${message.author.tag} (${message.author.id})`
            : 'Unknown user';

        lines.push(`[${timestamp}] ${author}`);

        if (message.content) {
            lines.push(message.content);
        }

        if (message.attachments.size > 0) {
            lines.push('Attachments:');

            for (const attachment of message.attachments.values()) {
                lines.push(
                    `- ${attachment.name || 'attachment'}: ${attachment.url}`
                );
            }
        }

        if (message.embeds.length > 0) {
            lines.push('Embeds:');

            for (const embed of message.embeds) {
                if (embed.title) lines.push(`Title: ${embed.title}`);
                if (embed.description) {
                    lines.push(`Description: ${embed.description}`);
                }

                if (embed.fields?.length) {
                    for (const field of embed.fields) {
                        lines.push(`${field.name}: ${field.value}`);
                    }
                }
            }
        }

        if (message.stickers.size > 0) {
            lines.push(
                `Stickers: ${message.stickers.map(sticker => sticker.name).join(', ')}`
            );
        }

        if (message.reference?.messageId) {
            lines.push(
                `Reply/reference to message ID: ${message.reference.messageId}`
            );
        }

        lines.push('');
    }

    if (allMessages.length === 0) {
        lines.push('No messages were found in this ticket.');
    }

    const transcriptText = lines.join('\n');

    return new AttachmentBuilder(
        Buffer.from(transcriptText, 'utf8'),
        {
            name: `${safeFileName(channel.name)}-transcript.txt`
        }
    );
}

// ==========================================
// TICKET LOGGING
// ==========================================

async function logTicketOpened(channel, opener, departmentKey) {
    const logChannel = await getLogChannel(channel.guild);

    if (!logChannel) return;

    const department = DEPARTMENTS[departmentKey];

    const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🟢 Ticket Opened')
        .setDescription(
            `A new support ticket has been created.\n\n` +
            `**Ticket:** ${channel}\n` +
            `**Opened by:** ${opener}\n` +
            `**Department:** ${department.label}\n` +
            `**Channel ID:** \`${channel.id}\``
        )
        .setImage(CONFIG.footerImage)
        .setFooter({ text: 'Florida Utilities • Ticket Logs' })
        .setTimestamp();

    await logChannel.send({
        embeds: [embed],
        allowedMentions: { parse: [] }
    });
}

async function logTicketClosed(
    channel,
    closer,
    reason,
    transcriptAttachment,
    automatic
) {
    const logChannel = await getLogChannel(channel.guild);

    if (!logChannel) {
        throw new Error('Ticket log channel is unavailable.');
    }

    const ownerId = getTicketOwnerId(channel);
    const departmentKey = getDepartmentKey(channel);
    const claimedId = getClaimedUserId(channel);

    const embed = new EmbedBuilder()
        .setColor(automatic ? 0xE74C3C : 0x5865F2)
        .setTitle(
            automatic
                ? '🔒 Ticket Automatically Closed'
                : '🔒 Ticket Closed'
        )
        .setDescription(
            `**Ticket:** #${channel.name}\n` +
            `**Ticket Channel ID:** \`${channel.id}\`\n` +
            `**Opened by:** ${
                ownerId ? `<@${ownerId}>` : 'Unknown'
            }\n` +
            `**Closed by:** ${closer}\n` +
            `**Department:** ${
                departmentKey
                    ? DEPARTMENTS[departmentKey].label
                    : 'Unknown'
            }\n` +
            `**Claimed by:** ${
                claimedId ? `<@${claimedId}>` : 'Nobody'
            }\n\n` +
            `**Closure reason:**\n${reason}`
        )
        .setImage(CONFIG.footerImage)
        .setFooter({ text: 'Florida Utilities • Ticket Logs' })
        .setTimestamp();

    await logChannel.send({
        embeds: [embed],
        files: [transcriptAttachment],
        allowedMentions: { parse: [] }
    });
}

// ==========================================
// TICKET CONTROLS
// ==========================================

function makeTicketControlRow(
    claimedUserId = null,
    claimedUsername = null
) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel(
                claimedUserId
                    ? `Claimed by ${claimedUsername || 'Staff'}`.slice(0, 80)
                    : 'Claim Ticket'
            )
            .setEmoji(claimedUserId ? '✅' : '🙋')
            .setStyle(ButtonStyle.Success)
            .setDisabled(Boolean(claimedUserId)),

        new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
    );
}

// ==========================================
// CLOSE, LOG, TRANSCRIBE AND DELETE
// ==========================================

async function closeTicket(channel, closer, reason, automatic = false) {
    if (!isOpenTicket(channel)) {
        return {
            ok: false,
            message: 'This ticket is already closed.'
        };
    }

    const ownerId = getTicketOwnerId(channel);
    const departmentKey = getDepartmentKey(channel);

    try {
        // Generate the transcript before deleting the channel.
        const transcript = await createTicketTranscript(channel, reason);

        // Send a closure notice into the ticket first.
        const closingEmbed = new EmbedBuilder()
            .setColor(automatic ? 0xE74C3C : 0x5865F2)
            .setTitle(
                automatic
                    ? '🔒 Ticket Automatically Closed'
                    : '🔒 Ticket Closed'
            )
            .setDescription(
                `**Closed by:** ${closer}\n` +
                `**Department:** ${
                    departmentKey
                        ? DEPARTMENTS[departmentKey].label
                        : 'Unknown'
                }\n` +
                `**Reason:** ${reason}\n\n` +
                'A transcript has been sent to the ticket logs. ' +
                'This channel will be deleted in 10 seconds.'
            )
            .setImage(CONFIG.footerImage)
            .setFooter({ text: 'Florida Utilities • Ticket Support' })
            .setTimestamp();

        await channel.send({
            content: ownerId ? `<@${ownerId}>` : undefined,
            embeds: [closingEmbed],
            allowedMentions: {
                users: ownerId ? [ownerId] : []
            }
        });

        // Mark as closed to prevent duplicate closures.
        await channel.setTopic(
            channel.topic.replace('Status: Open', 'Status: Closed')
        );

        // Log the closure and attach the transcript before deletion.
        // If logging fails, do not delete the channel and lose the history.
        await logTicketClosed(
            channel,
            closer,
            reason,
            transcript,
            automatic
        );

        // Keep the ticket visible briefly so the closure notice can be read.
        await new Promise(resolve =>
            setTimeout(resolve, CONFIG.deleteDelay)
        );

        await channel.delete(
            `Ticket closed by ${closer}. Reason: ${reason}`
        );

        return { ok: true };
    } catch (error) {
        console.error('Ticket closure/logging failed:', error);

        return {
            ok: false,
            message:
                'Ticket closure or logging failed. The ticket may still exist; check the bot terminal and log-channel permissions.'
        };
    }
}

// ==========================================
// PANEL BUILDERS
// ==========================================

function makeTicketButtons() {
    const row = new ActionRowBuilder();

    for (const [key, department] of Object.entries(DEPARTMENTS)) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket_${key}`)
                .setLabel(department.label)
                .setEmoji(department.emoji)
                .setStyle(ButtonStyle.Primary)
        );
    }

    return row;
}

function makeTicketPanelEmbed() {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🎫 Florida Utilities | Ticket Support')
        .setDescription(
            'Select the department that best fits your request.\n\n' +
            '🎫 General Support\n' +
            '🤝 Partnerships\n' +
            '👥 Staffing\n' +
            '⚖️ Internal Affairs\n\n' +
            'A private ticket will be created for you and the appropriate team.'
        )
        .setImage(CONFIG.footerImage)
        .setFooter({ text: 'Florida Utilities • Support System' })
        .setTimestamp();
}

function makeDashboardEmbed() {
    return new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🌴 Florida Utilities | Support')
        .setDescription(
            'Need help from Florida Utilities?\n\n' +
            'Click the button below to visit our support channel. ' +
            'For private assistance, use the ticket panel provided by the server.'
        )
        .setImage(CONFIG.footerImage)
        .setFooter({ text: 'Florida Utilities • Reliable Service' })
        .setTimestamp();
}

// ==========================================
// BOT READY AND COMMAND REGISTRATION
// ==========================================

client.once(Events.ClientReady, async readyClient => {
    console.log(
        `${CONFIG.name} is online as ${readyClient.user.tag}`
    );

    try {
        await rest.put(
            Routes.applicationCommands(readyClient.user.id),
            { body: commands }
        );

        console.log('Slash commands registered successfully.');
    } catch (error) {
        console.error('Command registration failed:', error);
    }
});

// ==========================================
// AUTOMATIC STAFF-PING CLOSURE
// ==========================================

client.on(Events.MessageCreate, async message => {
    if (
        !message.guild ||
        message.author.bot ||
        !isOpenTicket(message.channel)
    ) {
        return;
    }

    const channel = message.channel;
    const ownerId = getTicketOwnerId(channel);

    // Only auto-close when the ticket opener pings staff.
    if (message.author.id !== ownerId) return;

    const member = await message.guild.members.fetch(
        message.author.id
    ).catch(() => null);

    if (!member) return;

    const departmentKey = getDepartmentKey(channel);

    if (isAuthorizedTicketStaff(member, departmentKey)) return;

    const pingedStaffRole = message.mentions.roles.some(role =>
        Object.values(CONFIG.roles).includes(role.id)
    );

    let pingedStaffMember = false;

    for (const mentionedUser of message.mentions.users.values()) {
        const mentionedMember = await message.guild.members.fetch(
            mentionedUser.id
        ).catch(() => null);

        if (
            mentionedMember &&
            (
                mentionedMember.permissions.has(
                    PermissionFlagsBits.Administrator
                ) ||
                Object.values(CONFIG.roles).some(roleId =>
                    mentionedMember.roles.cache.has(roleId)
                )
            )
        ) {
            pingedStaffMember = true;
            break;
        }
    }

    if (!pingedStaffRole && !pingedStaffMember) return;

    await closeTicket(
        channel,
        client.user,
        `${message.author.tag} pinged staff in the ticket.`,
        true
    );
});

// ==========================================
// INTERACTION HANDLER
// ==========================================

client.on(Events.InteractionCreate, async interaction => {
    try {
        // --------------------------------------
        // SLASH COMMANDS
        // --------------------------------------

        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'ping') {
                return interaction.reply({
                    content: 'Pong! 🏓 Florida Utilities is working!',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === 'ticketpanel') {
                await interaction.channel.send({
                    embeds: [makeTicketPanelEmbed()],
                    components: [makeTicketButtons()]
                });

                return interaction.reply({
                    content: '✅ Ticket panel posted.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === 'dashboardpanel') {
                const supportChannel = await interaction.guild.channels.fetch(
                    CONFIG.supportChannel
                ).catch(() => null);

                if (
                    !supportChannel ||
                    supportChannel.type !== ChannelType.GuildText
                ) {
                    return interaction.reply({
                        content: '❌ The configured support channel could not be found.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const dashboardRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Go to Support Channel')
                            .setEmoji('🎫')
                            .setStyle(ButtonStyle.Link)
                            .setURL(
                                `https://discord.com/channels/${interaction.guildId}/${supportChannel.id}`
                            )
                    );

                await interaction.channel.send({
                    embeds: [makeDashboardEmbed()],
                    components: [dashboardRow]
                });

                return interaction.reply({
                    content: '✅ Support dashboard posted.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (interaction.commandName === 'addmember') {
                const channel = interaction.channel;

                if (!isOpenTicket(channel)) {
                    return interaction.reply({
                        content: '❌ Use this command inside an open ticket.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const departmentKey = getDepartmentKey(channel);

                if (!isAuthorizedTicketStaff(interaction.member, departmentKey)) {
                    return interaction.reply({
                        content: '❌ Only the department staff or an administrator can add members.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const user = interaction.options.getUser('user');

                const member = await interaction.guild.members.fetch(user.id)
                    .catch(() => null);

                if (!member) {
                    return interaction.reply({
                        content: '❌ That user could not be found in this server.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                await channel.permissionOverwrites.edit(user.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                    EmbedLinks: true
                });

                await channel.send({
                    content: `➕ ${user} has been added to this ticket by ${interaction.user}.`,
                    allowedMentions: {
                        users: [user.id]
                    }
                });

                return interaction.reply({
                    content: `✅ Added ${user.tag} to this ticket.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // --------------------------------------
        // BUTTONS
        // --------------------------------------

        if (interaction.isButton()) {
            const customId = interaction.customId;

            // CREATE TICKET
            if (customId.startsWith('ticket_')) {
                const departmentKey = customId.slice('ticket_'.length);
                const department = DEPARTMENTS[departmentKey];

                if (!department || !interaction.guild) {
                    return interaction.reply({
                        content: '❌ Invalid department.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });

                const guild = interaction.guild;
                const opener = interaction.user;
                const parentId = CONFIG.categories[departmentKey];
                const staffRoleId = CONFIG.roles[departmentKey];

                const category = await guild.channels.fetch(parentId)
                    .catch(() => null);

                const staffRole = await guild.roles.fetch(staffRoleId)
                    .catch(() => null);

                if (
                    !category ||
                    category.type !== ChannelType.GuildCategory
                ) {
                    return interaction.editReply(
                        '❌ The configured department category is invalid. Check its ID.'
                    );
                }

                if (!staffRole) {
                    return interaction.editReply(
                        '❌ The department staff role could not be found.'
                    );
                }

                const existingTicket = guild.channels.cache.find(channel =>
                    isOpenTicket(channel) &&
                    channel.parentId === parentId &&
                    getTicketOwnerId(channel) === opener.id
                );

                if (existingTicket) {
                    return interaction.editReply(
                        `You already have an open ticket in this department: ${existingTicket}`
                    );
                }

                const botMember = guild.members.me ??
                    await guild.members.fetchMe();

                const safeName = opener.username
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, '-')
                    .replace(/-+/g, '-')
                    .slice(0, 60);

                let ticketChannel;

                try {
                    ticketChannel = await guild.channels.create({
                        name: `ticket-${departmentKey}-${safeName}`.slice(0, 100),
                        type: ChannelType.GuildText,
                        parent: parentId,
                        topic:
                            `Ticket Owner: ${opener.id} | ` +
                            `Department: ${department.label} | Status: Open`,
                        permissionOverwrites: [
                            {
                                id: guild.roles.everyone.id,
                                deny: [PermissionFlagsBits.ViewChannel]
                            },
                            {
                                id: opener.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.ReadMessageHistory,
                                    PermissionFlagsBits.AttachFiles,
                                    PermissionFlagsBits.EmbedLinks
                                ]
                            },
                            {
                                id: staffRole.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.ReadMessageHistory,
                                    PermissionFlagsBits.AttachFiles,
                                    PermissionFlagsBits.EmbedLinks
                                ]
                            },
                            {
                                id: botMember.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.ReadMessageHistory,
                                    PermissionFlagsBits.ManageChannels,
                                    PermissionFlagsBits.ManageMessages,
                                    PermissionFlagsBits.EmbedLinks,
                                    PermissionFlagsBits.AttachFiles
                                ]
                            }
                        ]
                    });
                } catch (error) {
                    console.error('Ticket creation failed:', error);

                    return interaction.editReply(
                        '❌ I could not create the ticket. Check the category IDs and bot permissions.'
                    );
                }

                const ticketEmbed = new EmbedBuilder()
                    .setColor(department.color)
                    .setTitle(`${department.emoji} ${department.label}`)
                    .setDescription(
                        `Welcome, ${opener}!\n\n` +
                        'Please explain what you need assistance with.\n\n' +
                        '**If this is a report:** provide any available proof or references, such as screenshots, message links, usernames, dates, or other relevant details.\n\n' +
                        '**Ticket rules**\n' +
                        '• Do not ping staff members or staff roles.\n' +
                        '• Staff pings will automatically close this ticket.\n' +
                        '• Be respectful and keep discussion relevant to this request.'
                    )
                    .addFields(
                        { name: 'Opened By', value: `${opener}`, inline: true },
                        { name: 'Department', value: department.label, inline: true },
                        { name: 'Status', value: '🟢 Open', inline: true },
                        { name: 'Claimed By', value: 'Nobody yet', inline: true }
                    )
                    .setImage(CONFIG.footerImage)
                    .setFooter({ text: 'Florida Utilities • Ticket Support' })
                    .setTimestamp();

                try {
                    await ticketChannel.send({
                        content: `${opener} <@&${staffRole.id}>`,
                        embeds: [ticketEmbed],
                        components: [makeTicketControlRow()],
                        allowedMentions: {
                            users: [opener.id],
                            roles: [staffRole.id]
                        }
                    });

                    await logTicketOpened(
                        ticketChannel,
                        opener,
                        departmentKey
                    );
                } catch (error) {
                    // Ticket remains open if logging fails. Do not delete
                    // a valid ticket just because the log channel failed.
                    console.error('Ticket welcome/logging error:', error);
                }

                return interaction.editReply(
                    `✅ Your ticket has been created: ${ticketChannel}`
                );
            }

            // CLAIM TICKET
            if (customId === 'claim_ticket') {
                const channel = interaction.channel;

                if (!isOpenTicket(channel)) {
                    return interaction.reply({
                        content: '❌ This is not an open ticket.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const departmentKey = getDepartmentKey(channel);

                if (!isAuthorizedTicketStaff(interaction.member, departmentKey)) {
                    return interaction.reply({
                        content: '❌ Only the appropriate department staff or an administrator can claim this ticket.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (getClaimedUserId(channel)) {
                    return interaction.reply({
                        content: '❌ This ticket has already been claimed.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                await interaction.deferReply({
                    flags: MessageFlags.Ephemeral
                });

                try {
                    await channel.setTopic(
                        `${channel.topic} | Claimed By: ${interaction.user.id}`
                    );

                    const messages = await channel.messages.fetch({ limit: 50 });

                    const ticketMessage = messages.find(message =>
                        message.author.id === client.user.id &&
                        message.embeds.some(embed =>
                            embed.title &&
                            Object.values(DEPARTMENTS).some(department =>
                                embed.title === `${department.emoji} ${department.label}`
                            )
                        )
                    );

                    if (ticketMessage) {
                        const oldEmbed = ticketMessage.embeds[0];

                        const updatedEmbed = EmbedBuilder.from(oldEmbed)
                            .setFields(
                                oldEmbed.fields.map(field =>
                                    field.name === 'Claimed By'
                                        ? {
                                            name: 'Claimed By',
                                            value: `${interaction.user}`,
                                            inline: true
                                        }
                                        : field
                                )
                            );

                        await ticketMessage.edit({
                            embeds: [updatedEmbed],
                            components: [
                                makeTicketControlRow(
                                    interaction.user.id,
                                    interaction.user.username
                                )
                            ]
                        });
                    }

                    await channel.send({
                        content: `🙋 This ticket has been claimed by ${interaction.user}.`,
                        allowedMentions: {
                            users: [interaction.user.id]
                        }
                    });

                    return interaction.editReply(
                        '✅ You have successfully claimed this ticket.'
                    );
                } catch (error) {
                    console.error('Claim ticket failed:', error);

                    return interaction.editReply(
                        '❌ I could not claim this ticket. Check the bot permissions.'
                    );
                }
            }

            // CLOSE TICKET - OPEN CLOSURE REASON FORM
            if (customId === 'close_ticket') {
                const channel = interaction.channel;

                if (!isOpenTicket(channel)) {
                    return interaction.reply({
                        content: '❌ This is not an open ticket.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const departmentKey = getDepartmentKey(channel);
                const ownerId = getTicketOwnerId(channel);

                const isOwner = interaction.user.id === ownerId;
                const isStaff = isAuthorizedTicketStaff(
                    interaction.member,
                    departmentKey
                );

                if (!isOwner && !isStaff) {
                    return interaction.reply({
                        content: '❌ Only the ticket opener, department staff, or an administrator can close this ticket.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`close_reason_${channel.id}`)
                    .setTitle('Close Ticket');

                const reasonInput = new TextInputBuilder()
                    .setCustomId('reason')
                    .setLabel('Why are you closing this ticket?')
                    .setPlaceholder('Enter the reason for closing this ticket...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMinLength(3)
                    .setMaxLength(1000)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(reasonInput)
                );

                return interaction.showModal(modal);
            }
        }

        // --------------------------------------
        // CLOSURE REASON MODAL SUBMISSION
        // --------------------------------------

        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith('close_reason_')
        ) {
            const channelId = interaction.customId.slice(
                'close_reason_'.length
            );

            if (interaction.channelId !== channelId) {
                return interaction.reply({
                    content: '❌ This close form belongs to a different ticket.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const channel = interaction.channel;

            if (!isOpenTicket(channel)) {
                return interaction.reply({
                    content: '❌ This ticket is already closed or unavailable.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const departmentKey = getDepartmentKey(channel);
            const ownerId = getTicketOwnerId(channel);

            const isOwner = interaction.user.id === ownerId;
            const isStaff = isAuthorizedTicketStaff(
                interaction.member,
                departmentKey
            );

            if (!isOwner && !isStaff) {
                return interaction.reply({
                    content: '❌ You are not authorized to close this ticket.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const reason = interaction.fields
                .getTextInputValue('reason')
                .trim();

            if (reason.length < 3) {
                return interaction.reply({
                    content: 'Please provide a meaningful closure reason.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({
                flags: MessageFlags.Ephemeral
            });

            const result = await closeTicket(
                channel,
                interaction.user,
                reason
            );

            return interaction.editReply(
                result.ok
                    ? '✅ Ticket closed. The closure log and transcript have been sent. The channel will be deleted in 10 seconds.'
                    : `❌ ${result.message}`
            );
        }
    } catch (error) {
        console.error('Interaction error:', error);

        if (interaction.isRepliable()) {
            const response = {
                content: '❌ Something went wrong. Check the terminal for details.',
                flags: MessageFlags.Ephemeral
            };

            if (interaction.deferred) {
                await interaction.editReply(response).catch(() => null);
            } else if (!interaction.replied) {
                await interaction.reply(response).catch(() => null);
            }
        }
    }
});

// ==========================================
// START BOT
// ==========================================

if (!process.env.DISCORD_TOKEN) {
    console.error('Missing DISCORD_TOKEN in your .env file.');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);