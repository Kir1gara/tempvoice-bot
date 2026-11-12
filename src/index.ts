import http from 'http';
import { Client, GatewayIntentBits, Events, VoiceState, ChannelType, PermissionFlagsBits, EmbedBuilder, Guild, VoiceChannel, TextChannel, GuildMember, ChatInputCommandInteraction } from 'discord.js';
import { getRoom, createRoom, updateRoom, deleteRoom, getGuildConfig, upsertGuildConfig, addRoomMember, removeRoomMember, getRoomMembers, isUserPermitted, getUserRooms, VoiceRoom, GuildConfig } from './database.js';
import { config } from './config.js';

// Simple HTTP server to keep Render happy (port binding required)
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('TempVoice Bot is running!');
}).listen(port, () => {
  console.log(`🌐 HTTP server listening on port ${port}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const GUILD_ID = config.GUILD_ID;

function generateRoomName(pattern: string, user: { username: string; displayName: string }): string {
  return pattern
    .replace('{user}', user.displayName)
    .replace('{username}', user.username);
}

async function createVoiceRoom(guild: Guild, ownerId: string, creatorChannel: VoiceChannel): Promise<VoiceChannel | null> {
  const config = getGuildConfig(guild.id);
  if (!config?.category_id) {
    console.error('No category configured for voice rooms');
    return null;
  }

  const category = guild.channels.cache.get(config.category_id);
  if (!category || category.type !== ChannelType.GuildCategory) {
    console.error('Category not found');
    return null;
  }

  const owner = await guild.members.fetch(ownerId).catch(() => null);
  if (!owner) return null;

  const roomName = config.naming_pattern
    ? generateRoomName(config.naming_pattern, { username: owner.user.username, displayName: owner.displayName })
    : `${owner.displayName}'s room`;

  const voiceChannel = await guild.channels.create({
    name: roomName,
    type: ChannelType.GuildVoice,
    parent: category.id,
    userLimit: config.default_limit || 0,
    permissionOverwrites: [
      {
        id: guild.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      },
      {
        id: ownerId,
        allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers],
      },
    ],
  });

  const room: VoiceRoom = {
    channel_id: voiceChannel.id,
    guild_id: guild.id,
    owner_id: ownerId,
    name: roomName,
    user_limit: config.default_limit || 0,
    locked: false,
    created_at: Date.now(),
  };
  createRoom(room);
  addRoomMember(voiceChannel.id, ownerId, 'owner');

  try {
    await owner.voice.setChannel(voiceChannel);
  } catch (e) {
    console.error('Failed to move user to new room:', e);
  }

  return voiceChannel;
}

async function deleteVoiceRoom(guild: Guild, channelId: string): Promise<void> {
  const channel = guild.channels.cache.get(channelId);
  if (channel && channel.type === ChannelType.GuildVoice) {
    try {
      await channel.delete('TempVoice: room empty');
    } catch (error: any) {
      // Канал уже удалён или недоступен — это нормально, просто удаляем из БД
      if (error?.code === 10003 || error?.status === 404) {
        console.log(`Канал ${channelId} уже удалён, удаляем из БД`);
      } else {
        console.error('Ошибка при удалении канала:', error);
      }
    }
  }
  deleteRoom(channelId);
}

async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  if (oldState.guild.id !== GUILD_ID) return;

  const config = getGuildConfig(GUILD_ID);
  if (!config?.creator_channel_id) return;

  const creatorChannelId = config.creator_channel_id;

  // User joined creator channel
  if (newState.channelId === creatorChannelId && oldState.channelId !== creatorChannelId) {
    const existingRooms = getUserRooms(GUILD_ID, newState.id);
    if (existingRooms.length > 0) {
      // User already has a room, move them there
      const roomChannel = newState.guild.channels.cache.get(existingRooms[0].channel_id);
      if (roomChannel && roomChannel.type === ChannelType.GuildVoice) {
        await newState.setChannel(roomChannel).catch(() => {});
      }
      return;
    }

    await createVoiceRoom(newState.guild, newState.id, newState.channel as VoiceChannel);
  }

  // User left a voice room
  if (oldState.channelId && oldState.channelId !== creatorChannelId) {
    const room = getRoom(oldState.channelId);
    if (room) {
      const channel = oldState.guild.channels.cache.get(oldState.channelId);
      if (channel && channel.type === ChannelType.GuildVoice) {
        const members = channel.members.filter(m => !m.user.bot);
        if (members.size === 0) {
          // Room is empty, delete it
          await deleteVoiceRoom(oldState.guild, oldState.channelId);
        } else if (room.owner_id === oldState.id) {
          // Owner left, transfer ownership
          const newOwner = members.first();
          if (newOwner) {
            updateRoom(oldState.channelId, { owner_id: newOwner.id });
            addRoomMember(oldState.channelId, newOwner.id, 'owner');

            // Update permissions
            await channel.permissionOverwrites.edit(oldState.id, {
              ManageChannels: false,
              MoveMembers: false,
              MuteMembers: false,
              DeafenMembers: false,
            }).catch(console.error);

            await channel.permissionOverwrites.edit(newOwner.id, {
              ManageChannels: true,
              MoveMembers: true,
              MuteMembers: true,
              DeafenMembers: true,
            }).catch(console.error);

            // Notify new owner
            try {
              await newOwner.send(`👑 Ты стал владельцем комнаты **${channel.name}**!`);
            } catch {}
          } else {
            await deleteVoiceRoom(oldState.guild, oldState.channelId);
          }
        }
      }
    }
  }
}

function isRoomOwner(room: VoiceRoom, userId: string): boolean {
  return room.owner_id === userId;
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName, guild, member, channel } = interaction;
  if (!guild || !member || !(member instanceof GuildMember)) return;

  const config = getGuildConfig(guild.id);
  if (!config?.category_id) {
    await interaction.reply({ content: '❌ Бот не настроен. Используй `/voice setup`', ephemeral: true });
    return;
  }

  const voiceState = member.voice;
  if (!voiceState.channelId) {
    await interaction.reply({ content: '❌ Ты не в голосовом канале!', ephemeral: true });
    return;
  }

  const room = getRoom(voiceState.channelId);
  if (!room) {
    await interaction.reply({ content: '❌ Это не временная комната!', ephemeral: true });
    return;
  }

  const isOwner = isRoomOwner(room, member.id);
  const isPermitted = isUserPermitted(voiceState.channelId, member.id);
  const voiceChannel = guild.channels.cache.get(voiceState.channelId) as VoiceChannel | null;
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    await interaction.reply({ content: '❌ Голосовой канал не найден!', ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case 'lock':
      if (!isOwner) { await interaction.reply({ content: '❌ Только владелец может залочить комнату!', ephemeral: true }); return; }
      updateRoom(voiceState.channelId, { locked: true });
      await voiceChannel.permissionOverwrites.edit(guild.id, { Connect: false }).catch(console.error);
      await interaction.reply({ content: '🔒 Комната залочена. Никто не может войти.', ephemeral: true });
      break;

    case 'unlock':
      if (!isOwner) { await interaction.reply({ content: '❌ Только владелец может разлочить комнату!', ephemeral: true }); return; }
      updateRoom(voiceState.channelId, { locked: false });
      await voiceChannel.permissionOverwrites.edit(guild.id, { Connect: true }).catch(console.error);
      await interaction.reply({ content: '🔓 Комната разлочена. Все могут войти.', ephemeral: true });
      break;

    case 'name':
      if (!isOwner) { await interaction.reply({ content: '❌ Только владелец может переименовать комнату!', ephemeral: true }); return; }
      const newName = interaction.options.getString('name', true);
      if (newName.length > 100) { await interaction.reply({ content: '❌ Название слишком длинное (макс. 100 символов)', ephemeral: true }); return; }
      updateRoom(voiceState.channelId, { name: newName });
      await voiceChannel.setName(newName).catch(console.error);
      await interaction.reply({ content: `✅ Комната переименована в **${newName}**`, ephemeral: true });
      break;

    case 'limit':
      if (!isOwner) { await interaction.reply({ content: '❌ Только владелец может поставить лимит!', ephemeral: true }); return; }
      const limit = interaction.options.getInteger('limit', true);
      if (limit < 0 || limit > 99) { await interaction.reply({ content: '❌ Лимит от 0 до 99 (0 = без лимита)', ephemeral: true }); return; }
      updateRoom(voiceState.channelId, { user_limit: limit });
      await voiceChannel.setUserLimit(limit).catch(console.error);
      await interaction.reply({ content: limit === 0 ? '✅ Лимит убран' : `✅ Лимит установлен: **${limit}** человек`, ephemeral: true });
      break;

    case 'kick':
      if (!isOwner) { await interaction.reply({ content: '❌ Только владелец может кикать!', ephemeral: true }); return; }
      const targetUser = interaction.options.getUser('user', true);
      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember || targetMember.voice.channelId !== voiceState.channelId) {
        await interaction.reply({ content: '❌ Этот пользователь не в твоей комнате!', ephemeral: true }); return;
      }
      if (targetMember.id === member.id) { await interaction.reply({ content: '❌ Нельзя кикнуть самого себя!', ephemeral: true }); return; }
      await targetMember.voice.setChannel(null).catch(() => {});
      removeRoomMember(voiceState.channelId, targetUser.id);
      await interaction.reply({ content: `👢 **${targetUser.displayName}** кикнут из комнаты.`, ephemeral: true });
      break;

    case 'permit':
      if (!isOwner) { await interaction.reply({ content: '❌ Только владелец может давать доступ!', ephemeral: true }); return; }
      const permitUser = interaction.options.getUser('user', true);
      const permitMember = await guild.members.fetch(permitUser.id).catch(() => null);
      if (!permitMember) { await interaction.reply({ content: '❌ Пользователь не найден на сервере!', ephemeral: true }); return; }
      addRoomMember(voiceState.channelId, permitUser.id, 'member');
      await voiceChannel.permissionOverwrites.edit(permitUser.id, { Connect: true, ViewChannel: true }).catch(console.error);
      await interaction.reply({ content: `✅ **${permitUser.displayName}** теперь может заходить в комнату.`, ephemeral: true });
      break;

    case 'reject':
      if (!isOwner) { await interaction.reply({ content: '❌ Только владелец может запрещать доступ!', ephemeral: true }); return; }
      const rejectUser = interaction.options.getUser('user', true);
      const rejectMember = await guild.members.fetch(rejectUser.id).catch(() => null);
      if (!rejectMember) { await interaction.reply({ content: '❌ Пользователь не найден на сервере!', ephemeral: true }); return; }
      if (rejectMember.voice.channelId === voiceState.channelId) {
        await rejectMember.voice.setChannel(null).catch(() => {});
      }
      removeRoomMember(voiceState.channelId, rejectUser.id);
      await voiceChannel.permissionOverwrites.edit(rejectUser.id, { Connect: false, ViewChannel: false }).catch(console.error);
      await interaction.reply({ content: `🚫 **${rejectUser.displayName}** больше не может заходить в комнату.`, ephemeral: true });
      break;

    case 'claim':
      const owner = await guild.members.fetch(room.owner_id).catch(() => null);
      if (owner && owner.voice.channelId === voiceState.channelId) {
        await interaction.reply({ content: '❌ Владелец всё ещё в комнате!', ephemeral: true }); return;
      }
      if (!isPermitted) { await interaction.reply({ content: '❌ Ты не в списке участников комнаты!', ephemeral: true }); return; }
      updateRoom(voiceState.channelId, { owner_id: member.id });
      addRoomMember(voiceState.channelId, member.id, 'owner');

      await voiceChannel.permissionOverwrites.edit(member.id, {
        ManageChannels: true, MoveMembers: true, MuteMembers: true, DeafenMembers: true
      }).catch(console.error);

      if (owner) {
        await voiceChannel.permissionOverwrites.edit(owner.id, {
          ManageChannels: false, MoveMembers: false, MuteMembers: false, DeafenMembers: false
        }).catch(console.error);
      }
      await interaction.reply({ content: `👑 **${member.displayName}** теперь владелец комнаты!`, ephemeral: true });
      break;

    case 'info':
      const members = voiceChannel.members.filter(m => !m.user.bot);
      const permitted = getRoomMembers(voiceState.channelId);
      const embed = new EmbedBuilder()
        .setTitle(`📋 Информация о комнате: ${voiceChannel.name}`)
        .addFields(
          { name: '👑 Владелец', value: `<@${room.owner_id}>`, inline: true },
          { name: '🔒 Статус', value: room.locked ? 'Залочена' : 'Открыта', inline: true },
          { name: '👥 Лимит', value: room.user_limit === 0 ? 'Без лимита' : `${room.user_limit} человек`, inline: true },
          { name: '👥 Участников', value: `${members.size}`, inline: true },
          { name: '✅ С доступом', value: permitted.length.toString(), inline: true }
        )
        .setColor(room.locked ? 0xff0000 : 0x00ff00)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
  }
}

async function handleSetupCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { guild, member, options } = interaction;
  if (!guild || !member || !(member instanceof GuildMember)) return;

  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ Нужны права администратора!', ephemeral: true });
    return;
  }

  const creatorChannel = options.getChannel('creator') as VoiceChannel;
  const category = options.getChannel('category') as any;
  const logChannel = options.getChannel('log') as TextChannel | null;

  if (creatorChannel.type !== ChannelType.GuildVoice) {
    await interaction.reply({ content: '❌ Канал-создатель должен быть голосовым!', ephemeral: true });
    return;
  }
  if (category && category.type !== ChannelType.GuildCategory) {
    await interaction.reply({ content: '❌ Категория должна быть категорией!', ephemeral: true });
    return;
  }

  const cfg: GuildConfig = {
    guild_id: guild.id,
    creator_channel_id: creatorChannel.id,
    category_id: category?.id || null,
    log_channel_id: logChannel?.id || null,
    default_limit: options.getInteger('limit') || 0,
    naming_pattern: options.getString('pattern') || "{user}'s room",
  };

  upsertGuildConfig(cfg);

  const embed = new EmbedBuilder()
    .setTitle('✅ TempVoice настроен!')
    .addFields(
      { name: '🎙️ Канал-создатель', value: `<#${creatorChannel.id}>`, inline: true },
      { name: '📁 Категория для комнат', value: category ? `<#${category.id}>` : 'Не указана (будет рядом с создателем)', inline: true },
      { name: '📝 Лог-канал', value: logChannel ? `<#${logChannel.id}>` : 'Не указан', inline: true },
      { name: '👥 Лимит по умолчанию', value: cfg.default_limit === 0 ? 'Без лимита' : cfg.default_limit.toString(), inline: true },
      { name: '🏷️ Шаблон имени', value: cfg.naming_pattern, inline: true }
    )
    .setColor(0x00ff00);

  await interaction.reply({ embeds: [embed] });
}

async function deployCommands(): Promise<void> {
  const { REST, Routes } = await import('discord.js');
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

  const commands = [
    {
      name: 'voice',
      description: 'Управление временными голосовыми комнатами',
      options: [
        {
          name: 'setup',
          description: 'Настроить TempVoice (только админы)',
          type: 1,
          options: [
            { name: 'creator', description: 'Голосовой канал-создатель', type: 7, required: true, channel_types: [2] },
            { name: 'category', description: 'Категория для создаваемых комнат', type: 7, required: false, channel_types: [4] },
            { name: 'log', description: 'Текстовый канал для логов', type: 7, required: false, channel_types: [0] },
            { name: 'limit', description: 'Лимит участников по умолчанию (0 = без лимита)', type: 4, required: false, min_value: 0, max_value: 99 },
            { name: 'pattern', description: 'Шаблон имени комнаты ({user}, {username})', type: 3, required: false },
          ],
        },
        { name: 'lock', description: 'Залочить комнату (никто не может войти)', type: 1 },
        { name: 'unlock', description: 'Разлочить комнату (все могут войти)', type: 1 },
        { name: 'name', description: 'Переименовать комнату', type: 1, options: [
          { name: 'name', description: 'Новое название', type: 3, required: true, max_length: 100 },
        ]},
        { name: 'limit', description: 'Поставить лимит участников', type: 1, options: [
          { name: 'limit', description: 'Лимит (0 = без лимита)', type: 4, required: true, min_value: 0, max_value: 99 },
        ]},
        { name: 'kick', description: 'Кикнуть пользователя из комнаты', type: 1, options: [
          { name: 'user', description: 'Пользователь для кика', type: 6, required: true },
        ]},
        { name: 'permit', description: 'Дать доступ пользователю', type: 1, options: [
          { name: 'user', description: 'Пользователь', type: 6, required: true },
        ]},
        { name: 'reject', description: 'Запретить доступ пользователю (и кикнуть если внутри)', type: 1, options: [
          { name: 'user', description: 'Пользователь', type: 6, required: true },
        ]},
        { name: 'claim', description: 'Забрать владение комнатой (если владелец ушел)', type: 1 },
        { name: 'info', description: 'Показать информацию о комнате', type: 1 },
      ],
    },
  ];

  try {
    console.log('🔄 Регистрация слеш-команд...');
    await rest.put(Routes.applicationGuildCommands(config.CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Команды зарегистрированы!');
  } catch (error) {
    console.error('❌ Ошибка регистрации команд:', error);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 Бот запущен: ${c.user.tag}`);
  console.log(`📡 Сервер: ${GUILD_ID}`);
  await deployCommands();
});

client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'voice') {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'setup') {
        await handleSetupCommand(interaction);
      } else {
        await handleCommand(interaction);
      }
    }
  }
});

client.login(config.DISCORD_TOKEN).catch(console.error);