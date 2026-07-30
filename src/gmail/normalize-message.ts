import { convert } from "html-to-text";

const QUOTED_REPLY_PATTERNS = [
  /^On .+wrote:\s*$/i,
  /^-{2,}\s*Original Message\s*-{2,}$/i,
  /^From:\s.+$/i,
  /^Sent:\s.+$/i,
];

export interface NormalizeMessageOptions {
  maxChars?: number;
}

export function stripQuotedReplies(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith(">")) {
      break;
    }

    if (QUOTED_REPLY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      break;
    }

    result.push(line);
  }

  return result.join("\n").trim();
}

export function htmlToPlainText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: false } },
      { selector: "img", format: "skip" },
    ],
  }).trim();
}

export function normalizeEmailBody(
  plainText: string | null | undefined,
  html: string | null | undefined,
  options: NormalizeMessageOptions = {},
): { rawBodyText: string; bodyText: string } {
  let raw = "";

  if (plainText && plainText.trim().length > 0) {
    raw = plainText.trim();
  } else if (html && html.trim().length > 0) {
    raw = htmlToPlainText(html);
  }

  const stripped = stripQuotedReplies(raw);
  const normalized = stripped.replace(/\n{3,}/g, "\n\n").trim();

  let bodyText = normalized;
  const maxChars = options.maxChars;

  if (maxChars && bodyText.length > maxChars) {
    bodyText = `${bodyText.slice(0, maxChars)}\n\n[truncated]`;
  }

  return {
    rawBodyText: raw,
    bodyText,
  };
}

export function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

export interface GmailPart {
  mimeType?: string | null;
  body?: { data?: string | null; size?: number | null } | null;
  parts?: GmailPart[] | null;
}

export function extractBodiesFromPart(
  part: GmailPart,
): { plainText: string | null; html: string | null } {
  let plainText: string | null = null;
  let html: string | null = null;

  const mimeType = part.mimeType ?? "";
  const data = part.body?.data;

  if (data) {
    const decoded = decodeBase64Url(data);
    if (mimeType === "text/plain") {
      plainText = decoded;
    } else if (mimeType === "text/html") {
      html = decoded;
    }
  }

  if (part.parts) {
    for (const child of part.parts) {
      const childBodies = extractBodiesFromPart(child);
      plainText = plainText ?? childBodies.plainText;
      html = html ?? childBodies.html;
    }
  }

  return { plainText, html };
}

export function parseSender(fromHeader: string): {
  senderName: string | null;
  senderEmail: string;
} {
  const match = fromHeader.match(/^(?:(.+?)\s*)?<([^>]+)>$/);

  if (match) {
    const name = match[1]?.trim().replace(/^"|"$/g, "") ?? null;
    return { senderName: name, senderEmail: match[2].trim() };
  }

  return { senderName: null, senderEmail: fromHeader.trim() };
}

export function formatGmailLabelQuery(label: string): string {
  const escaped = label.includes(" ") || label.includes("'")
    ? `"${label.replace(/"/g, '\\"')}"`
    : label;
  return `label:${escaped}`;
}
