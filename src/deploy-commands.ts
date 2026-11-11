import { REST, Routes } from 'discord.js';
import { config } from './config.js';

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

async function deploy() {
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

  try {
    console.log('🔄 Регистрация слеш-команд...');
    await rest.put(Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID), { body: commands });
    console.log('✅ Команды успешно зарегистрированы!');
  } catch (error) {
    console.error('❌ Ошибка регистрации команд:', error);
    process.exit(1);
  }
}

deploy();