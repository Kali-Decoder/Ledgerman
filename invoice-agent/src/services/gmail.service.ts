import type { gmail_v1 } from "googleapis";
import { getGmailClient } from "../config/google-auth.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export type GmailMessage = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  bodyText: string;
};

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return (
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())
      ?.value ?? ""
  );
}

function decodeBase64Url(data: string): string {
  return Buffer.from(
    data.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf8");
}

function collectText(
  part: gmail_v1.Schema$MessagePart | undefined,
  acc: { text: string[]; html: string[] }
): void {
  if (!part) return;

  const mime = part.mimeType ?? "";
  if (mime === "text/plain" && part.body?.data) {
    acc.text.push(decodeBase64Url(part.body.data));
  } else if (mime === "text/html" && part.body?.data) {
    acc.html.push(decodeBase64Url(part.body.data));
  }

  for (const child of part.parts ?? []) {
    collectText(child, acc);
  }
}

function parseMessage(message: gmail_v1.Schema$Message): GmailMessage {
  const headers = message.payload?.headers;
  const acc = { text: [] as string[], html: [] as string[] };

  if (message.payload?.body?.data) {
    acc.text.push(decodeBase64Url(message.payload.body.data));
  }
  collectText(message.payload, acc);

  const bodyText =
    acc.text.join("\n").trim() ||
    acc.html
      .map((h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .join("\n")
      .trim();

  return {
    id: message.id ?? "",
    subject: headerValue(headers, "Subject"),
    from: headerValue(headers, "From"),
    date: headerValue(headers, "Date"),
    snippet: message.snippet ?? "",
    bodyText,
  };
}

/** Milestone 1: list + read messages, nothing else. */
export async function readEmails(
  options: { query?: string; maxResults?: number } = {}
): Promise<GmailMessage[]> {
  const gmail = await getGmailClient();
  const query = options.query ?? env.gmailQuery;
  const maxResults = options.maxResults ?? env.gmailMaxResults;

  logger.info("Reading Gmail", { query, maxResults });

  const list = await gmail.users.messages.list({
    userId: env.gmailUser,
    q: query,
    maxResults,
  });

  const refs = list.data.messages ?? [];
  if (refs.length === 0) return [];

  const messages: GmailMessage[] = [];
  for (const ref of refs) {
    if (!ref.id) continue;
    const full = await gmail.users.messages.get({
      userId: env.gmailUser,
      id: ref.id,
      format: "full",
    });
    messages.push(parseMessage(full.data));
  }

  return messages;
}
