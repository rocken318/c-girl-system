// @ts-nocheck
/**
 * POST /api/line/attendance-confirm
 * 本日の確定シフト全員へ「出欠確認」LINEをワンクリック一斉送信する。
 * - 管理者(admin) / 黒服(kurofuku) / 統合ビューアのSupabase JWTを検証してから実行。
 * - クライアントは { storeId, date } のみ送信。源氏名・line_user_id はサーバ側で解決。
 * - line_user_id はサーバ内でのみ扱い、クライアントへは返さない（権限分離）。
 * - 文面生成は app/src/lib/attendanceConfirm.ts が source of truth。
 *   api/ は依存ゼロ方針のためここにインライン複製する。
 */

// ── 個別文面生成（source of truth は app/src/lib/attendanceConfirm.ts）──
function buildAttendanceConfirmMessage({ sourceName, startTime, endTime, hairMakeTime, douhanTime }) {
  const lines = [
    `${sourceName}さん、おはようございます。`,
    `本日は ${startTime}〜${endTime} の出勤です。よろしくお願いします🙇`,
  ];
  if (hairMakeTime) lines.push(`ヘアメイクは ${hairMakeTime} のご予約です。`);
  if (douhanTime) lines.push(`本日は ${douhanTime} に同伴のご予定です。`);
  return lines.join('\n');
}

/** Supabase REST GET */
async function supabaseGet(supabaseUrl, serviceRoleKey, path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} failed: ${res.status}`);
  return res.json();
}

/** LINE push メッセージ送信 */
async function pushLine(lineUserId, text, channelAccessToken) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  // --- 認証: Bearer トークンを Supabase で検証 ---
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  let uid;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'apikey': anonKey, 'Authorization': `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'unauthorized' });
    const userData = await userRes.json();
    uid = userData?.id;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
  } catch (err) {
    console.error('[attendance-confirm] auth check error:', err);
    return res.status(401).json({ error: 'unauthorized' });
  }

  // --- リクエストボディ検証 ---
  const { storeId, date } = req.body ?? {};
  if (typeof storeId !== 'string' || !storeId || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  // --- 権限: admin / kurofuku / 統合ビューア、かつ自店スコープ ---
  try {
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=role,is_integrated_viewer,store_id,active_store_id`,
      { headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` } }
    );
    const profiles = await profileRes.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;

    const roleOk = profile && (profile.role === 'admin' || profile.role === 'kurofuku' || profile.is_integrated_viewer);
    if (!roleOk) {
      return res.status(403).json({ error: 'forbidden' });
    }
    // 統合ビューアは全店可。それ以外は所属店(store_id/active_store_id)のみ。
    const ownStore = profile.active_store_id ?? profile.store_id;
    if (!profile.is_integrated_viewer && storeId !== ownStore) {
      return res.status(403).json({ error: 'forbidden_store' });
    }
  } catch (err) {
    console.error('[attendance-confirm] profile check error:', err);
    return res.status(403).json({ error: 'forbidden' });
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // 当日・自店・確定(approved/published)のシフトを取得
    const shifts = await supabaseGet(
      supabaseUrl,
      serviceRoleKey,
      `shifts?select=cast_id,data&store_id=eq.${encodeURIComponent(storeId)}&date=eq.${date}&status=in.(approved,published)`
    );

    if (!Array.isArray(shifts) || shifts.length === 0) {
      return res.status(200).json({ sent, skipped, failed });
    }

    // 源氏名マップ（本名等は取得しない）
    const casts = await supabaseGet(
      supabaseUrl,
      serviceRoleKey,
      `casts?select=id,source_name&store_id=eq.${encodeURIComponent(storeId)}`
    );
    const sourceNameById = new Map((casts ?? []).map((c) => [c.id, c.source_name ?? '担当者']));

    // 対象 cast の line_user_id を取得
    const castIds = [...new Set(shifts.map((s) => s.cast_id))];
    const orFilter = castIds.map((id) => `cast_id.eq.${id}`).join(',');
    const lineLinks = await supabaseGet(
      supabaseUrl,
      serviceRoleKey,
      `line_links?select=cast_id,line_user_id&or=(${orFilter})`
    );
    const lineUserByCast = new Map(
      (lineLinks ?? []).filter((l) => l.line_user_id).map((l) => [l.cast_id, l.line_user_id])
    );

    for (const shift of shifts) {
      const lineUserId = lineUserByCast.get(shift.cast_id);
      if (!lineUserId || !channelAccessToken) { skipped++; continue; }
      const d = shift.data ?? {};
      const message = buildAttendanceConfirmMessage({
        sourceName: sourceNameById.get(shift.cast_id) ?? '担当者',
        startTime: d.startTime ?? '20:00',
        endTime: d.endTime ?? '01:00',
        hairMakeTime: d.hairMakeTime,
        douhanTime: d.douhanPlanTime,
      });
      try {
        await pushLine(lineUserId, message, channelAccessToken);
        sent++;
      } catch (err) {
        console.error(`[attendance-confirm] push error for cast_id=${shift.cast_id}:`, err);
        failed++;
      }
    }
  } catch (err) {
    console.error('[attendance-confirm] error:', err);
    return res.status(200).json({ sent, skipped, failed });
  }

  return res.status(200).json({ sent, skipped, failed });
}
