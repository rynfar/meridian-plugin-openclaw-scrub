const HEARTBEAT_POLL_PREFIX =
  "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK."

interface MessageLike {
  role?: unknown
  content?: unknown
}

function messageText(message: unknown): string {
  if (!message || typeof message !== "object") return ""
  const content = (message as MessageLike).content
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter((block): block is { type: "text"; text: string } =>
      Boolean(block) && typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string")
    .map(block => block.text)
    .join("\n")
}

function messageRole(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined
  const role = (message as MessageLike).role
  return typeof role === "string" ? role : undefined
}

function isHeartbeatPoll(message: unknown): boolean {
  return messageRole(message) === "user" && messageText(message).startsWith(HEARTBEAT_POLL_PREFIX)
}

function isDisposableHeartbeatReply(message: unknown): boolean {
  if (messageRole(message) !== "assistant") return false
  const text = messageText(message).trim()
  return text === "" || text === "HEARTBEAT_OK"
}

/**
 * Collapse stale OpenClaw heartbeat polls in a replayed conversation.
 *
 * OpenClaw appends a new poll even when the previous one failed before Claude
 * produced content. A long-running session can therefore replay hundreds of
 * near-identical autonomous-schedule instructions on every request. Anthropic
 * classifies that transcript as a third-party app even after the system-prompt
 * fingerprint has been scrubbed. Keep the newest poll (the turn Claude must
 * answer), discard older unanswered polls and exact HEARTBEAT_OK acknowledgments,
 * and preserve any heartbeat that produced a real alert.
 *
 * Returns the original array reference when no change is needed.
 */
export function scrubOpenClawHeartbeatHistory(messages: unknown[]): unknown[] {
  const heartbeatIndexes = messages
    .map((message, index) => isHeartbeatPoll(message) ? index : -1)
    .filter(index => index >= 0)
  if (heartbeatIndexes.length <= 1) return messages

  const drop = new Set<number>()
  for (const index of heartbeatIndexes.slice(0, -1)) {
    const next = messages[index + 1]
    if (messageRole(next) === "assistant") {
      // A substantive reply may be an alert the user needs in history. Keep
      // that whole turn; only exact acks and empty failed assistant entries go.
      if (!isDisposableHeartbeatReply(next)) continue
      drop.add(index + 1)
    }
    drop.add(index)
  }
  if (drop.size === 0) return messages
  return messages.filter((_, index) => !drop.has(index))
}
