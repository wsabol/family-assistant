export {
  messageStatusSchema,
  type Message,
  type MessageStatus,
} from "./message.js";

export {
  proposedActionTypeSchema,
  proposedActionStatusSchema,
  type ProposedAction,
  type ProposedActionStatus,
  type ProposedActionType,
  type CalendarLink,
} from "./proposed-action.js";

export const DOMAIN_TABLES = [
  "messages",
  "proposed_actions",
  "calendar_links",
] as const;
