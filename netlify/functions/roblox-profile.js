exports.handler = async (event) => {
  const username = (event.queryStringParameters?.username || '').trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return { statusCode: 400, body: JSON.stringify({ error: 'Enter a valid Roblox username.' }) };
  try {
    const lookup = await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }) });
    const user = (await lookup.json()).data?.[0];
    if (!user) return { statusCode: 404, body: JSON.stringify({ error: 'Roblox user not found.' }) };
    const thumb = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`);
    const avatar = (await thumb.json()).data?.[0]?.imageUrl || '';
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, body: JSON.stringify({ id: user.id, username: user.name, displayName: user.displayName, avatar, profileUrl: `https://www.roblox.com/users/${user.id}/profile` }) };
  } catch { return { statusCode: 502, body: JSON.stringify({ error: 'Roblox lookup is temporarily unavailable.' }) }; }
};
