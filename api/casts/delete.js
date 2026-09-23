// @ts-nocheck
/**
 * POST /api/casts/delete
 * キャストを完全削除する（管理者専用）。
 *
 * - 呼び出し元(admin) の Supabase JWT を検証し、対象店舗の admin または統合ビューアのみ許可。
 * - 実績・シフト・給与・目標・LINE連携・申請などの履歴がある場合は FK 制約（RESTRICT）で
 *   削除できない → 409 has_history を返す。その場合は「退店（status=inactive）」を使う。
 * - ログインアカウント(user_id)が紐付いていれば auth ユーザーも削除する
 *   （profiles / user_store_memberships は on delete cascade で自動削除）。
 * - api/ は依存ゼロ方針のため supabase-js を使わず REST を直接叩く。
 *
 * Request body: { castId }
 * Response: { deleted: true, loginRemoved: boolean }
 */

function svcHeaders(serviceRoleKey, extra) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...(extra || {}),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  // --- 認証 ---
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  let uid;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'unauthorized' });
    uid = (await userRes.json())?.id;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
  } catch (err) {
    console.error('[delete] auth check error:', err);
    return res.status(401).json({ error: 'unauthorized' });
  }

  const castId = typeof req.body?.castId === 'string' ? req.body.castId : '';
  if (!castId) return res.status(400).json({ error: 'invalid_cast' });

  // --- 対象キャスト取得（store_id / user_id）---
  let cast;
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/casts?id=eq.${encodeURIComponent(castId)}&select=id,store_id,user_id`,
      { headers: svcHeaders(serviceRoleKey) }
    );
    const rows = await r.json();
    cast = Array.isArray(rows) ? rows[0] : null;
  } catch (err) {
    console.error('[delete] fetch cast error:', err);
    return res.status(500).json({ error: 'lookup_failed' });
  }
  if (!cast) return res.status(404).json({ error: 'not_found' });

  // --- 権限: 対象店舗の admin または統合ビューア ---
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=role,is_integrated_viewer,store_id,active_store_id`,
      { headers: svcHeaders(serviceRoleKey) }
    );
    const profiles = await r.json();
    const p = Array.isArray(profiles) ? profiles[0] : null;
    const roleOk = p && (p.role === 'admin' || p.is_integrated_viewer);
    if (!roleOk) return res.status(403).json({ error: 'forbidden' });
    const ownStore = p.active_store_id ?? p.store_id;
    if (!p.is_integrated_viewer && cast.store_id !== ownStore) {
      return res.status(403).json({ error: 'forbidden_store' });
    }
  } catch (err) {
    console.error('[delete] perm check error:', err);
    return res.status(403).json({ error: 'forbidden' });
  }

  // --- casts 行を削除（履歴があると FK 制約で失敗 → has_history）---
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/casts?id=eq.${encodeURIComponent(castId)}`, {
      method: 'DELETE',
      headers: svcHeaders(serviceRoleKey, { Prefer: 'return=representation' }),
    });
    if (!r.ok) {
      const txt = await r.text();
      if (r.status === 409 || /foreign key|23503|violates foreign/i.test(txt)) {
        return res.status(409).json({ error: 'has_history' });
      }
      console.error('[delete] cast delete failed:', r.status, txt);
      return res.status(500).json({ error: 'delete_failed' });
    }
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ error: 'not_found' });
    }
  } catch (err) {
    console.error('[delete] cast delete error:', err);
    return res.status(500).json({ error: 'delete_failed' });
  }

  // --- ログインアカウント(auth ユーザー)を削除（profiles/memberships は cascade）---
  let loginRemoved = false;
  if (cast.user_id) {
    try {
      const r = await fetch(`${supabaseUrl}/auth/v1/admin/users/${cast.user_id}`, {
        method: 'DELETE',
        headers: svcHeaders(serviceRoleKey),
      });
      loginRemoved = r.ok;
      if (!r.ok) {
        console.error('[delete] auth user delete failed:', r.status, await r.text());
      }
    } catch (err) {
      console.error('[delete] auth user delete error:', err);
    }
  }

  return res.status(200).json({ deleted: true, loginRemoved });
}
