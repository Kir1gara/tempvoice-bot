export const config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  CLIENT_ID: process.env.CLIENT_ID || '',
  GUILD_ID: process.env.GUILD_ID || '1504548225720516728',
};

if (!config.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN not set in environment variables');
  process.exit(1);
}
if (!config.CLIENT_ID) {
  console.error('❌ CLIENT_ID not set in environment variables');
  process.exit(1);
}