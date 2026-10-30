import type { RemoteCommand, RemoteControllerEvent } from "../app/domain/remote-controller.ts";

/** One atomic D1 round trip: deduplication, sequence allocation and durable audit.
 * No acknowledgement or execution is allowed before this batch commits.
 */
export async function storeRealtimeCommand(db: D1Database, session: { accountId: string; sessionId: string; keyHash: string | null }, adultId: string, command: RemoteCommand, allowed: boolean, now: number) {
  const results = await db.batch([
    db.prepare(`INSERT INTO remote_controller_events (account_id, session_id, server_sequence, client_event_id, adult_id, origin, command, payload_json, created_at)
      SELECT account_id, session_id, latest_sequence + 1, ?, ?, 'mobile', ?, ?, ? FROM remote_controller_sessions
      WHERE account_id = ? AND session_id = ? AND controller_key_hash = ? AND status = 'connected' AND ? = 1
      ON CONFLICT(account_id, session_id, client_event_id) DO NOTHING`)
      .bind(command.clientEventId, adultId, command.command, JSON.stringify(command.payload ?? {}), now, session.accountId, session.sessionId, session.keyHash, allowed ? 1 : 0),
    db.prepare(`UPDATE remote_controller_sessions SET latest_sequence = COALESCE((SELECT MAX(server_sequence) FROM remote_controller_events WHERE account_id = ? AND session_id = ?), latest_sequence), updated_at = ? WHERE account_id = ? AND session_id = ?`)
      .bind(session.accountId, session.sessionId, now, session.accountId, session.sessionId),
    db.prepare("SELECT server_sequence, created_at, adult_id, command, payload_json FROM remote_controller_events WHERE account_id = ? AND session_id = ? AND client_event_id = ?")
      .bind(session.accountId, session.sessionId, command.clientEventId),
  ]);
  const saved = results[2].results[0] as { server_sequence: number; created_at: number; adult_id: string; command: RemoteControllerEvent["command"]; payload_json: string } | undefined;
  if (!saved) return null;
  return {
    inserted: results[0].meta.changes === 1,
    event: { clientEventId: command.clientEventId, command: saved.command, payload: JSON.parse(saved.payload_json), serverSequence: saved.server_sequence, adultId: saved.adult_id, createdAt: saved.created_at } as RemoteControllerEvent,
  };
}
