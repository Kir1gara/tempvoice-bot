# TempVoice Bot - Free Deployment Guide

## 🆓 Бесплатный хостинг: Render.com

**Render** — лучший бесплатный вариант для Discord-ботов:
- ✅ Бесплатно навсегда (750 часов/мес)
- ✅ Автодеплой из GitHub
- ✅ Поддерживает Node.js
- ⚠️ Бот «засыпает» после 15 мин неактивности (cold start ~30 сек)

---

## 🚀 Быстрый деплой (5 минут)

### 1. Создай репозиторий на GitHub
1. Зайди на https://github.com/new
2. Название: `tempvoice-bot` (или любое)
3. **Public** (для бесплатного Render) → Create repository

### 2. Заливай код
```bash
# В папке проекта (D:\Clode\tempvoice-bot)
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ТВОЙ_НИК/tempvoice-bot.git
git push -u origin main
```

### 3. Деплой на Render
1. Зайди на https://dashboard.render.com → **New** → **Web Service**
2. **Connect GitHub** → выбери репозиторий `tempvoice-bot`
3. Настройки:
   - **Name**: `tempvoice-bot`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: **Free** (обязательно!)

4. **Environment Variables** (добавь все 3):
   ```
   DISCORD_TOKEN = ВАШ_ТОКЕН_ИЗ_DEVELOPER_PORTAL
   CLIENT_ID = ВАШ_APPLICATION_ID
   GUILD_ID = 1504548225720516728
   ```

5. **Create Web Service** → жди 2-3 минуты сборки

### 4. Настройка на сервере
1. Зайди на сервер Discord
2. `/voice setup` (только админы):
   - `creator`: канал `➕ Создать комнату` (ID: 1504579504650195075)
   - `category`: `Chilling` (ID: 1504554627226669137) или создай новую
   - `limit`: 0 (или твой лимит)
   - `pattern`: `{user}'s room`

---

## 🔧 Альтернатива: Railway (платный после триала)
- $5/мес после $5 бесплатных кредитов
- Не засыпает, быстрее
- Если хочешь — регистрируйся на railway.app, процесс похожий

---

## 📋 Команды бота
| Команда | Описание | Кто может |
|---|---|---|
| `/voice setup` | Настройка бота | Админы |
| `/voice lock` | Залочить комнату | Владелец |
| `/voice unlock` | Разлочить комнату | Владелец |
| `/voice name <имя>` | Переименовать | Владелец |
| `/voice limit <0-99>` | Лимит участников | Владелец |
| `/voice kick @user` | Кикнуть | Владелец |
| `/voice permit @user` | Дать доступ | Владелец |
| `/voice reject @user` | Запретить доступ | Владелец |
| `/voice claim` | Забрать владение | Участник |
| `/voice info` | Инфо о комнате | Все в комнате |

---

## ⚠️ Важно про бесплатный Render
- Бот **засыпает** через 15 мин без активности
- Первое сообщение/заход в голос после сна = **30 сек ожидания** (cold start)
- Это нормально для бесплатного тарифа
- Чтобы не спал — нужен платный план или внешний пингер (UptimeRobot)

---

## 🛠 Если что-то не работает
1. Проверь логи в Render Dashboard → Logs
2. Убедись, что бот добавлен на сервер с правами Administrator
3. Проверь, что Intents включены в Developer Portal:
   - Message Content Intent ✅
   - Server Members Intent ✅
   - Presence Intent ✅

---

## 📁 Структура проекта
```
tempvoice-bot/
├── src/
│   ├── index.ts           # Главный файл бота
│   ├── database.ts        # JSON база (файл data/voice.json)
│   ├── config.ts          # Конфиг из env переменных
│   └── deploy-commands.ts # Регистрация слеш-команд
├── package.json
├── tsconfig.json
└── README.md (этот файл)
```

---

## 🔒 Безопасность
- **Никогда не коммить токен в GitHub!** Только через Environment Variables в Render
- Токен в этом README — для примера, **срочно смени его** в Developer Portal → Bot → Reset Token