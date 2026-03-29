import { db } from "./db.js";

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "detail_json_serialize_failed" });
  }
}

export function logAdminAction(params: {
  actorUserId?: number | null;
  action: string;
  targetType: string;
  targetId?: string | number | null;
  summary?: string | null;
  detail?: unknown;
}) {
  db.prepare(`
    INSERT INTO admin_action_logs (actor_user_id, action, target_type, target_id, summary, detail_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.actorUserId ?? null,
    params.action,
    params.targetType,
    params.targetId == null ? null : String(params.targetId),
    params.summary ?? null,
    safeJson(params.detail),
  );
}
