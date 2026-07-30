import { describe, expect, it } from "vitest";

import {
  formatGmailLabelQuery,
  htmlToPlainText,
  normalizeEmailBody,
  parseSender,
  stripQuotedReplies,
} from "../../src/gmail/normalize-message.js";

describe("normalizeEmailBody", () => {
  it("prefers plain text over html", () => {
    const result = normalizeEmailBody("Plain body", "<p>HTML body</p>");
    expect(result.bodyText).toBe("Plain body");
    expect(result.rawBodyText).toBe("Plain body");
  });

  it("converts html when plain text is missing", () => {
    const result = normalizeEmailBody(null, "<p>Hello <strong>school</strong></p>");
    expect(result.bodyText).toContain("Hello");
    expect(result.bodyText).toContain("school");
  });

  it("truncates body text when maxChars is set", () => {
    const result = normalizeEmailBody("abcdefghij", null, { maxChars: 5 });
    expect(result.bodyText).toContain("[truncated]");
    expect(result.rawBodyText).toBe("abcdefghij");
  });
});

describe("stripQuotedReplies", () => {
  it("removes quoted reply lines", () => {
    const text = "New message\n\n> quoted line\nmore quoted";
    expect(stripQuotedReplies(text)).toBe("New message");
  });
});

describe("parseSender", () => {
  it("parses name and email", () => {
    expect(parseSender("Jane Doe <jane@school.edu>")).toEqual({
      senderName: "Jane Doe",
      senderEmail: "jane@school.edu",
    });
  });

  it("parses bare email", () => {
    expect(parseSender("jane@school.edu")).toEqual({
      senderName: null,
      senderEmail: "jane@school.edu",
    });
  });
});

describe("formatGmailLabelQuery", () => {
  it("quotes labels with spaces or apostrophes", () => {
    expect(formatGmailLabelQuery("Kid's School")).toBe('label:"Kid\'s School"');
  });
});

describe("htmlToPlainText", () => {
  it("strips tags", () => {
    expect(htmlToPlainText("<div>Test</div>")).toBe("Test");
  });
});
