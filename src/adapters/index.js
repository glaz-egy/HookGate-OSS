import { toDiscordPayload } from "./discord.js";
import { toSlackPayload } from "./slack.js";

export function buildDestinationPayload(serviceType, message) {
  if (serviceType === "discord") {
    return toDiscordPayload(message);
  }

  if (serviceType === "slack") {
    return toSlackPayload(message);
  }

  throw new Error(`Unsupported service type: ${serviceType}`);
}
