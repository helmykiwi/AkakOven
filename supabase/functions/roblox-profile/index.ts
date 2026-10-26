const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders });

  const username = new URL(request.url).searchParams.get('username')?.trim().replace(/^@/, '') || '';
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return Response.json({ error: 'Enter a valid Roblox username.' }, { status: 400, headers: corsHeaders });
  }

  try {
    const lookup = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
    });
    const user = (await lookup.json()).data?.[0];
    if (!user) return Response.json({ error: 'Roblox user not found.' }, { status: 404, headers: corsHeaders });

    const thumbnail = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`
    );
    const avatar = (await thumbnail.json()).data?.[0]?.imageUrl || '';
    return Response.json({
      id: user.id,
      username: user.name,
      displayName: user.displayName,
      avatar,
      profileUrl: `https://www.roblox.com/users/${user.id}/profile`
    }, { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return Response.json({ error: 'Roblox lookup is temporarily unavailable.' }, { status: 502, headers: corsHeaders });
  }
});
