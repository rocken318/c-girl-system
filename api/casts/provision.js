// @ts-nocheck
/**
 * POST /api/casts/provision
 * キャストの「名簿 + ログインアカウント」を一括発行する（管理者専用）。
 *
 * - 呼び出し元(admin) の Supabase JWT を検証し、対象店舗の admin または統合ビューアのみ許可。
 * - ログインは ID+パスワード方式：ID を内部で <id>@cgirl.local の合成メールに変換して
 *   Supabase Auth ユーザーを作成（service role の Admin API）。ユーザーは ID だけ入力してログインする。
 * - auth.users → profiles(role=cast) → user_store_memberships(cast) → casts(user_id 紐付け) を順に作成。
 *   途中失敗時は作成済み auth ユーザーを削除してロールバック（profiles/memberships は on delete cascade）。
 * - api/ は依存ゼロ方針のため supabase-js を使わず REST を直接叩く。
 *
 * Request body: { storeId, loginId, password, source_name, rank?, join_date?, status? }
 * Response: { castId, userId, loginId, email }
 */

const LOGIN_ID_RE = /^[a-z0-9._-]{3,32}$/;
const EMAIL_DOMAIN = 'cgirl.local';

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

  // --- 認証: 呼び出し元 JWT を検証 ---
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  let uid;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'unauthorized' });
    const userData = await userRes.json();
    uid = userData?.id;
    if (!uid) return res.status(401).json({ error: 'unauthorized' });
  } catch (err) {
    console.error('[provision] auth check error:', err);
    return res.status(401).json({ error: 'unauthorized' });
  }

  // --- ボディ検証 ---
  const body = req.body ?? {};
  const storeId = typeof body.storeId === 'string' ? body.storeId : '';
  const loginId = typeof body.loginId === 'string' ? body.loginId.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const sourceName = typeof body.source_name === 'string' ? body.source_name.trim() : '';
  const rank = typeof body.rank === 'string' && body.rank.trim() ? body.rank.trim() : null;
  const joinDate = typeof body.join_date === 'string' && body.join_date ? body.join_date : null;
  const status = body.status === 'inactive' ? 'inactive' : 'active';

  if (!storeId) return res.status(400).json({ error: 'invalid_store' });
  if (!LOGIN_ID_RE.test(loginId)) return res.status(400).json({ error: 'invalid_login_id' });
  if (password.length < 6) return res.status(400).json({ error: 'weak_password' });
  if (!sourceName) return res.status(400).json({ error: 'invalid_source_name' });

  // --- 権限: 対象店舗の admin または統合ビューア ---
  try {
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=role,is_integrated_viewer,store_id,active_store_id`,
      { headers: svcHeaders(serviceRoleKey) }
    );
    const profiles = await profileRes.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    const roleOk = profile && (profile.role === 'admin' || profile.is_integrated_viewer);
    if (!roleOk) return res.status(403).json({ error: 'forbidden' });
    const ownStore = profile.active_store_id ?? profile.store_id;
    if (!profile.is_integrated_viewer && storeId !== ownStore) {
      return res.status(403).json({ error: 'forbidden_store' });
    }
  } catch (err) {
    console.error('[provision] profile check error:', err);
    return res.status(403).json({ error: 'forbidden' });
  }

  const email = `${loginId}@${EMAIL_DOMAIN}`;

  // --- 1) auth ユーザー作成（service role Admin API）---
  let newUserId;
  try {
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: svcHeaders(serviceRoleKey),
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const created = await createRes.json();
    if (!createRes.ok) {
      const msg = `${(created && (created.msg || created.message || created.error_description)) || ''}`;
      if (createRes.status === 422 || /registered|exist|already/i.test(msg)) {
        return res.status(409).json({ error: 'login_id_taken' });
      }
      console.error('[provision] createUser failed:', createRes.status, created);
      return res.status(500).json({ error: 'create_user_failed' });
    }
    newUserId = created.id || created.user?.id;
    if (!newUserId) {
      console.error('[provision] createUser: no id in response', created);
      return res.status(500).json({ error: 'create_user_failed' });
    }
  } catch (err) {
    console.error('[provision] createUser error:', err);
    return res.status(500).json({ error: 'create_user_failed' });
  }

  // ロールバック: auth ユーザー削除（profiles / memberships は cascade で消える）
  const rollback = async () => {
    try {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${newUserId}`, {
        method: 'DELETE',
        headers: svcHeaders(serviceRoleKey),
      });
    } catch (e) {
      console.error('[provision] rollback failed:', e);
    }
  };

  // --- 2) profiles ---
  try {
    const pRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: svcHeaders(serviceRoleKey, { Prefer: 'return=minimal' }),
      body: JSON.stringify({
        id: newUserId,
        store_id: storeId,
        role: 'cast',
        display_name: sourceName,
        active_store_id: storeId,
        status: 'active',
      }),
    });
    if (!pRes.ok) {
      console.error('[provision] profile insert failed:', pRes.status, await pRes.text());
      await rollback();
      return res.status(500).json({ error: 'profile_insert_failed' });
    }
  } catch (err) {
    console.error('[provision] profile insert error:', err);
    await rollback();
    return res.status(500).json({ error: 'profile_insert_failed' });
  }

  // --- 3) membership ---
  try {
    const mRes = await fetch(`${supabaseUrl}/rest/v1/user_store_memberships`, {
      method: 'POST',
      headers: svcHeaders(serviceRoleKey, { Prefer: 'return=minimal' }),
      body: JSON.stringify({
        user_id: newUserId,
        store_id: storeId,
        role: 'cast',
        is_primary: true,
        status: 'active',
      }),
    });
    if (!mRes.ok) {
      console.error('[provision] membership insert failed:', mRes.status, await mRes.text());
      await rollback();
      return res.status(500).json({ error: 'membership_insert_failed' });
    }
  } catch (err) {
    console.error('[provision] membership insert error:', err);
    await rollback();
    return res.status(500).json({ error: 'membership_insert_failed' });
  }

  // --- 4) casts（user_id 紐付け）---
  let castId;
  try {
    const cRes = await fetch(`${supabaseUrl}/rest/v1/casts`, {
      method: 'POST',
      headers: svcHeaders(serviceRoleKey, { Prefer: 'return=representation' }),
      body: JSON.stringify({
        store_id: storeId,
        source_name: sourceName,
        rank,
        join_date: joinDate,
        status,
        user_id: newUserId,
      }),
    });
    const rows = await cRes.json();
    if (!cRes.ok || !Array.isArray(rows) || !rows[0]?.id) {
      console.error('[provision] cast insert failed:', cRes.status, rows);
      await rollback();
      return res.status(500).json({ error: 'cast_insert_failed' });
    }
    castId = rows[0].id;
  } catch (err) {
    console.error('[provision] cast insert error:', err);
    await rollback();
    return res.status(500).json({ error: 'cast_insert_failed' });
  }

  return res.status(200).json({ castId, userId: newUserId, loginId, email });
}
