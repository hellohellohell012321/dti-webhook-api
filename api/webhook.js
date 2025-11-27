// api/send.js

let rateLimitMap = new Map(); // memory-based IP rate limit
let bannedIPs = new Set();    // permanently banned IPs

const REQUIRED_STRINGS = [
  "(＃＞＜) *someone executed our script!*",
  "**(≧◡≦) game**",
  "**(=^･ω･^=) executor**"
];

// Blacklisted patterns (except Roblox links)
const BLACKLIST_PATTERNS = [
  /@/,                    // any mention
  /https?:\/\/(?!(?:[\w-]+\.)?roblox\.com|tr\.rbxcdn\.com)[^\s]+/i, // any URL not roblox.com
  /discord/i              // the word "discord", case-insensitive
];

// Extra strict @everyone/@here pattern
const STRICT_MENTION_PATTERN = /@everyone|@here/i;

export default async function handler(req, res) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress;

  if (bannedIPs.has(ip)) {
    return res.status(500).json({ error: 'error' });
  }

  if (req.method !== 'POST') {
    bannedIPs.add(ip);
    return res.status(500).json({ error: 'error' });
  }

  const now = Date.now();
  const lastRequestTime = rateLimitMap.get(ip);

  if (lastRequestTime && now - lastRequestTime < 0.1 * 60 * 1000) {
    return res.status(500).json({ error: 'error' });
  }

  const { embeds } = req.body || {};

  if (!Array.isArray(embeds) || embeds.length === 0) {
    bannedIPs.add(ip);
    return res.status(500).json({ error: 'error' });
  }

  const embedString = JSON.stringify(embeds);

  // Required strings
  const hasAllRequired = REQUIRED_STRINGS.every(str => embedString.includes(str));
  if (!hasAllRequired) {
    bannedIPs.add(ip);
    return res.status(500).json({ error: 'error' });
  }

  // Detect prohibited mentions or Discord links
  const attemptCompromise = STRICT_MENTION_PATTERN.test(embedString) || /discord/i.test(embedString);
  if (attemptCompromise) {
    // Send warning message instead
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `a guy from the ip [${ip}] tried to compromise the webhook!!1 (≧▽≦)\n**note: this is a fake ip and belongs to nobody, therefore it does not violate discord TOS.**`
        })
      });
    } catch (err) {
      console.error('Failed to send compromise warning.');
    }
    bannedIPs.add(ip);
    return res.status(500).json({ error: 'error' });
  }

  // Check other blacklisted patterns (ignore Roblox links)
  const containsBlacklisted = BLACKLIST_PATTERNS.some(pattern => pattern.test(embedString));
  if (containsBlacklisted) {
    bannedIPs.add(ip);
    return res.status(500).json({ error: 'error' });
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(500).json({ error: 'error' });
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds })
    });
    rateLimitMap.set(ip, now);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Webhook request failed.');
    return res.status(500).json({ error: 'error' });
  }
}
