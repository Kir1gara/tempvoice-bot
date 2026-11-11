import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const dataDir = join(__dirname, '..', 'data');
const dbPath = join(dataDir, 'voice.json');

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}
if (!existsSync(dbPath)) {
  writeFileSync(dbPath, JSON.stringify({ voice_rooms: [], room_members: [], guild_config: [] }, null, 2));
}

function readDb(): any {
  return JSON.parse(readFileSync(dbPath, 'utf-8'));
}

function writeDb(data: any): void {
  writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

export interface VoiceRoom {
  channel_id: string;
  guild_id: string;
  owner_id: string;
  name: string | null;
  user_limit: number;
  locked: boolean;
  created_at: number;
}

export interface GuildConfig {
  guild_id: string;
  creator_channel_id: string | null;
  category_id: string | null;
  log_channel_id: string | null;
  default_limit: number;
  naming_pattern: string;
}

export function getRoom(channelId: string): VoiceRoom | undefined {
  const db = readDb();
  return db.voice_rooms.find((r: VoiceRoom) => r.channel_id === channelId);
}

export function createRoom(room: VoiceRoom): void {
  const db = readDb();
  db.voice_rooms.push(room);
  writeDb(db);
}

export function updateRoom(channelId: string, data: Partial<VoiceRoom>): void {
  const db = readDb();
  const idx = db.voice_rooms.findIndex((r: VoiceRoom) => r.channel_id === channelId);
  if (idx >= 0) {
    db.voice_rooms[idx] = { ...db.voice_rooms[idx], ...data };
    writeDb(db);
  }
}

export function deleteRoom(channelId: string): void {
  const db = readDb();
  db.voice_rooms = db.voice_rooms.filter((r: VoiceRoom) => r.channel_id !== channelId);
  db.room_members = db.room_members.filter((m: any) => m.channel_id !== channelId);
  writeDb(db);
}

export function getGuildConfig(guildId: string): GuildConfig | undefined {
  const db = readDb();
  return db.guild_config.find((c: GuildConfig) => c.guild_id === guildId);
}

export function upsertGuildConfig(config: GuildConfig): void {
  const db = readDb();
  const idx = db.guild_config.findIndex((c: GuildConfig) => c.guild_id === config.guild_id);
  if (idx >= 0) {
    db.guild_config[idx] = config;
  } else {
    db.guild_config.push(config);
  }
  writeDb(db);
}

export function addRoomMember(channelId: string, userId: string, role: 'owner' | 'member' = 'member'): void {
  const db = readDb();
  const idx = db.room_members.findIndex((m: any) => m.channel_id === channelId && m.user_id === userId);
  if (idx >= 0) {
    db.room_members[idx].role = role;
  } else {
    db.room_members.push({ channel_id: channelId, user_id: userId, role });
  }
  writeDb(db);
}

export function removeRoomMember(channelId: string, userId: string): void {
  const db = readDb();
  db.room_members = db.room_members.filter((m: any) => !(m.channel_id === channelId && m.user_id === userId));
  writeDb(db);
}

export function getRoomMembers(channelId: string): { user_id: string; role: string }[] {
  const db = readDb();
  return db.room_members.filter((m: any) => m.channel_id === channelId);
}

export function isUserPermitted(channelId: string, userId: string): boolean {
  const member = getRoomMembers(channelId).find(m => m.user_id === userId);
  return member ? (member.role === 'owner' || member.role === 'member') : false;
}

export function getUserRooms(guildId: string, userId: string): VoiceRoom[] {
  const db = readDb();
  return db.voice_rooms.filter((r: VoiceRoom) => r.guild_id === guildId && r.owner_id === userId);
}