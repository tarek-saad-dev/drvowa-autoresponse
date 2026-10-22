/**
 * Classify the ORIGINAL Baileys chat, before participant phone-number resolution.
 * Private LID chats and private replies to statuses must remain eligible.
 */
export function classifyBlockedWhatsAppSource(input: {
  externalContactKey: string;
  sourceRemoteJid?: string;
  sourceIsBroadcast?: boolean;
}): "group" | "broadcast" | "newsletter" | "call" | null {
  if (input.sourceIsBroadcast === true) return "broadcast";

  for (const candidate of [input.sourceRemoteJid, input.externalContactKey]) {
    const jid = String(candidate ?? "").trim().toLowerCase();
    if (jid.endsWith("@g.us")) return "group";
    if (jid.endsWith("@broadcast")) return "broadcast";
    if (jid.endsWith("@newsletter")) return "newsletter";
    if (jid.endsWith("@call")) return "call";
  }

  return null;
}
