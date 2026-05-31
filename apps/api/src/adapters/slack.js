export function toSlackPayload(message) {
  const blocks = [];

  if (message.title) {
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: truncate(message.title, 150)
      }
    });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: formatMainText(message)
    }
  });

  if (message.fields?.length) {
    blocks.push({
      type: "section",
      fields: message.fields.slice(0, 10).map((field) => ({
        type: "mrkdwn",
        text: `*${escapeMrkdwn(field.name)}*\n${escapeMrkdwn(field.value)}`
      }))
    });
  }

  if (message.url) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open" },
          url: message.url
        }
      ]
    });
  }

  return {
    text: fallbackText(message),
    blocks
  };
}

function formatMainText(message) {
  const prefix = message.level && message.level !== "info" ? `*${message.level.toUpperCase()}*\n` : "";
  return truncate(`${prefix}${escapeMrkdwn(message.message)}`, 3000);
}

function fallbackText(message) {
  return truncate([message.title, message.message].filter(Boolean).join(" - "), 3000);
}

function escapeMrkdwn(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function truncate(value, max) {
  return String(value || "").length > max ? `${String(value).slice(0, max - 3)}...` : String(value || "");
}
