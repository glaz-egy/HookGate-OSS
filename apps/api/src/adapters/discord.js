const LEVEL_COLORS = {
  debug: 0x64748b,
  info: 0x2563eb,
  notice: 0x16a34a,
  warning: 0xf59e0b,
  error: 0xdc2626,
  critical: 0x7f1d1d
};

export function toDiscordPayload(message) {
  const embed = {
    title: truncate(message.title, 256),
    description: truncate(message.message, 4096),
    color: parseColor(message.color) || LEVEL_COLORS[message.level] || LEVEL_COLORS.info,
    timestamp: new Date().toISOString()
  };

  if (message.url) {
    embed.url = message.url;
  }

  if (message.fields?.length) {
    embed.fields = message.fields.slice(0, 25).map((field) => ({
      name: truncate(field.name, 256),
      value: truncate(field.value, 1024),
      inline: Boolean(field.inline)
    }));
  }

  const payload = {
    content: buildMentions(message.mentions),
    embeds: [removeUndefined(embed)]
  };

  if (message.username) {
    payload.username = truncate(message.username, 80);
  }

  if (message.icon_url) {
    payload.avatar_url = message.icon_url;
  }

  return removeUndefined(payload);
}

function buildMentions(mentions = []) {
  return mentions.length ? mentions.map(String).join(" ") : undefined;
}

function parseColor(color) {
  if (typeof color === "number") {
    return color;
  }
  if (typeof color === "string" && /^#?[0-9a-f]{6}$/i.test(color)) {
    return Number.parseInt(color.replace("#", ""), 16);
  }
  return undefined;
}

function truncate(value, max) {
  if (!value) {
    return undefined;
  }
  return String(value).length > max ? `${String(value).slice(0, max - 3)}...` : String(value);
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined));
}
