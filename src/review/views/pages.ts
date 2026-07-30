import { escapeHtml, layout, type NavItem } from "../templates/layout.js";
import type { Message } from "../../domain/message.js";
import type { ProposedAction } from "../../domain/proposed-action.js";

const NAV: NavItem[] = [
  { href: "/", label: "Inbox" },
  { href: "/actions/awaiting", label: "Awaiting review" },
];

export function inboxPage(
  messages: Array<{ message: Message; actionCount: number; awaitingCount: number }>,
): string {
  const rows =
    messages.length === 0
      ? "<p class='muted'>No messages ingested yet.</p>"
      : `<table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Sender</th>
              <th>Received</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${messages
              .map(
                (item) => `
              <tr>
                <td><a href="/messages/${item.message.id}">${escapeHtml(item.message.subject)}</a></td>
                <td>${escapeHtml(item.message.senderEmail)}</td>
                <td>${escapeHtml(item.message.receivedAt)}</td>
                <td><span class="badge">${escapeHtml(item.message.status)}</span></td>
                <td>${item.actionCount} total / ${item.awaitingCount} awaiting</td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>`;

  return layout("Inbox", NAV, `<h1>Inbox</h1>${rows}`);
}

export function messagePage(
  message: Message,
  actions: ProposedAction[],
): string {
  const actionCards = actions
    .map((action) => actionCard(message, action))
    .join("");

  const body = `
    <h1>${escapeHtml(message.subject)}</h1>
    <p class="muted">From ${escapeHtml(message.senderEmail)} · ${escapeHtml(message.receivedAt)} · ${escapeHtml(message.status)}</p>
    <div class="grid">
      <section class="card">
        <h2>Source email</h2>
        <pre class="email-body">${escapeHtml(message.bodyText)}</pre>
        <form method="post" action="/messages/${message.id}/reprocess" style="margin-top:1rem">
          <button type="submit">Reprocess with AI</button>
        </form>
      </section>
      <section>
        <h2>Proposed actions</h2>
        ${actionCards || "<p class='muted'>No proposed actions.</p>"}
      </section>
    </div>`;

  return layout(message.subject, NAV, body);
}

function actionCard(message: Message, action: ProposedAction): string {
  if (action.status === "superseded") {
    return `
      <article class="card muted-card">
        <h3>${escapeHtml(action.title)} <span class="badge">superseded</span></h3>
      </article>`;
  }

  const ambiguity = action.ambiguityReason
    ? `<p class="warn"><strong>Ambiguity:</strong> ${escapeHtml(action.ambiguityReason)}</p>`
    : "";

  const interpretation = action.interpretationSummary
    ? `<p><strong>Interpretation:</strong> ${escapeHtml(action.interpretationSummary)}</p>`
    : "";

  const excerpt = action.sourceExcerpt
    ? `<p><strong>Source excerpt:</strong> ${escapeHtml(action.sourceExcerpt)}</p>`
    : "";

  const readonly = action.status !== "awaiting_review";

  return `
    <article class="card">
      <h3>${escapeHtml(action.title)} <span class="badge">${escapeHtml(action.status)}</span></h3>
      <p class="muted">Confidence: ${action.confidence.toFixed(2)} · Type: ${escapeHtml(action.actionType)}</p>
      ${ambiguity}
      ${interpretation}
      ${excerpt}
      <form method="post" action="/actions/${action.id}/save">
        <label>Action type
          <select name="actionType" ${readonly ? "disabled" : ""}>
            ${actionTypeOptions(action.actionType)}
          </select>
        </label>
        <label>Child
          <input name="childName" value="${escapeHtml(action.childName ?? "")}" ${readonly ? "readonly" : ""} />
        </label>
        <label>Title
          <input name="title" value="${escapeHtml(action.title)}" ${readonly ? "readonly" : ""} required />
        </label>
        <label>Start (ISO)
          <input name="startAt" value="${escapeHtml(action.startAt ?? "")}" ${readonly ? "readonly" : ""} />
        </label>
        <label>End (ISO)
          <input name="endAt" value="${escapeHtml(action.endAt ?? "")}" ${readonly ? "readonly" : ""} />
        </label>
        <label>
          <input type="checkbox" name="allDay" ${action.allDay ? "checked" : ""} ${readonly ? "disabled" : ""} />
          All day
        </label>
        <label>Location
          <input name="location" value="${escapeHtml(action.location ?? "")}" ${readonly ? "readonly" : ""} />
        </label>
        <label>Description
          <textarea name="description" rows="3" ${readonly ? "readonly" : ""}>${escapeHtml(action.description ?? "")}</textarea>
        </label>
        <label>Reminder offsets (minutes, comma-separated)
          <input name="reminderOffsetsMinutes" value="${escapeHtml(action.reminderOffsetsMinutes.join(","))}" ${readonly ? "readonly" : ""} />
        </label>
        ${readonly ? "" : `
          <div class="actions">
            <button type="submit" name="intent" value="save">Save edits</button>
            <button type="submit" name="intent" value="approve" class="primary">Approve</button>
            <button type="submit" name="intent" value="reject" class="danger">Reject</button>
          </div>
        `}
      </form>
    </article>`;
}

function actionTypeOptions(selected: string): string {
  const types = [
    "calendar_event",
    "deadline",
    "bring_item",
    "school_closure",
    "volunteer_opportunity",
    "informational",
    "needs_review",
  ];

  return types
    .map(
      (type) =>
        `<option value="${type}" ${type === selected ? "selected" : ""}>${type}</option>`,
    )
    .join("");
}

export function awaitingPage(actions: ProposedAction[]): string {
  const rows =
    actions.length === 0
      ? "<p class='muted'>Nothing awaiting review.</p>"
      : `<table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Confidence</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            ${actions
              .map(
                (action) => `
              <tr>
                <td><a href="/messages/${action.messageId}">${escapeHtml(action.title)}</a></td>
                <td>${escapeHtml(action.actionType)}</td>
                <td>${action.confidence.toFixed(2)}</td>
                <td><a href="/messages/${action.messageId}">View email</a></td>
              </tr>`,
              )
              .join("")}
          </tbody>
        </table>`;

  return layout("Awaiting review", NAV, `<h1>Awaiting review</h1>${rows}`);
}

export function flashPage(title: string, message: string): string {
  return layout(title, NAV, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/">Back to inbox</a></p>`);
}
