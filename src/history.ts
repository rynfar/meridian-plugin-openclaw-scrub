const HEARTBEAT_POLL_PREFIX =
  "Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK."

interface MessageLike {
  role?: unknown
  content?: unknown
}

/** Only a completely understood text payload can be discarded. */
function plainMessageText(message: unknown): string | undefined {
  if (!message || typeof message !== "object" || Array.isArray(message)) return undefined
  const content = (message as MessageLike).content
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return undefined
  const texts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== "object" || Array.isArray(block)) return undefined
    const textBlock = block as { type?: unknown; text?: unknown }
    if (textBlock.type !== "text" || typeof textBlock.text !== "string") return undefined
    if (Object.keys(block).some(key => key !== "type" && key !== "text")) return undefined
    texts.push(textBlock.text)
  }
  return texts.join("\n")
}

function messageRole(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined
  const role = (message as MessageLike).role
  return typeof role === "string" ? role : undefined
}

function isHeartbeatPoll(message: unknown): boolean {
  return messageRole(message) === "user"
    && plainMessageText(message)?.startsWith(HEARTBEAT_POLL_PREFIX) === true
}

function isDisposableHeartbeatReply(message: unknown): boolean {
  if (messageRole(message) !== "assistant") return false
  const text = plainMessageText(message)?.trim()
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
 * and preserve alerts, tool turns, attachments and unrecognized content.
 *
 * Returns the original array reference when no change is needed.
 */
export function scrubOpenClawHeartbeatHistory(messages: unknown[]): unknown[] {
  const heartbeatIndexes = messages
    .map((message, index) => isHeartbeatPoll(message) ? index : -1)
    .filter(index => index >= 0)
  if (heartbeatIndexes.length <= 1) return messages

  const drop = new Set<number>()
  for (let position = 0; position < heartbeatIndexes.length - 1; position++) {
    const index = heartbeatIndexes[position]!
    const nextPoll = heartbeatIndexes[position + 1]!
    const next = messages[index + 1]
    if (nextPoll === index + 2) {
      // Only a lone, fully understood empty/ack reply is disposable. A tool
      // turn, attachment or unknown payload must keep its whole transcript.
      if (!isDisposableHeartbeatReply(next)) continue
      drop.add(index + 1)
    } else if (nextPoll !== index + 1) {
      // Intervening messages may contain tool results or another useful turn.
      continue
    }
    drop.add(index)
  }
  if (drop.size === 0) return messages
  return messages.filter((_, index) => !drop.has(index))
}
