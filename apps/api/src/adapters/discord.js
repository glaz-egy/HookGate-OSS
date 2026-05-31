const LEVEL_COLORS = {
  debug: 0x64748b,
  info: 0x2563eb,
  notice: 0x16a34a,
  warning: 0xf59e0b,
  error: 0xdc2626,
  critical: 0x7f1d1d
};

export function toDiscordPayload(message) {
  if (message.embeds?.length) {
    return removeUndefined({
      content: truncate(message.content || buildMentions(message.mentions), 2000),
      embeds: message.embeds.slice(0, 10).map(normalizeEmbed),
      username: message.username ? truncate(message.username, 80) : undefined,
      avatar_url: message.icon_url
    });
  }

  if (message.title || message.fields?.length || message.url || message.color) {
    const embed = normalizeEmbed({
      title: message.title,
      description: message.message,
      color: message.color,
      fields: message.fields,
      url: message.url
    }, message.level);

    return removeUndefined({
      content: buildMentions(message.mentions),
      embeds: [embed],
      username: message.username ? truncate(message.username, 80) : undefined,
      avatar_url: message.icon_url
    });
  }

  return removeUndefined({
    content: truncate(message.content || message.message, 2000),
    username: message.username ? truncate(message.username, 80) : undefined,
    avatar_url: message.icon_url
  });
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

function normalizeEmbed(embed, level = "info") {
  return removeUndefined({
    title: truncate(embed.title, 256),
    description: truncate(embed.description, 4096),
    color: parseColor(embed.color) || LEVEL_COLORS[level] || LEVEL_COLORS.info,
    timestamp: embed.timestamp || new Date().toISOString(),
    url: embed.url,
    fields: embed.fields?.slice(0, 25).map((field) => ({
      name: truncate(field.name, 256),
      value: truncate(field.value, 1024),
      inline: Boolean(field.inline)
    }))
  });
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
