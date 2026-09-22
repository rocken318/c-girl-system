// @ts-nocheck
/**
 * POST /api/ai/churn-comment
 * 離脱リスクのキャストへのAI対策コメント生成。
 * - 管理者(admin/統合)のSupabase JWTを検証してから実行。
 * - AIへ渡すのは源氏名・リスクレベル・理由・店名のみ（本名/連絡先/LINE ID/cast_id は渡さない）。
 */

// buildChurnAdviceMessages 相当をインラインで実装（クロスディレクトリ import を避ける）
function buildChurnAdviceMessages({ sourceName, level, reasons, storeName }) {
  return [
    {
      role: 'system',
      content:
        'あなたは高級キャバクラの店舗マネージャーです。離脱の兆候があるキャストへの、思いやりがあり実行可能な対策を日本語で1〜2文だけ提案します。断定や責めは避け、担当黒服が取れる具体的アクション（声かけ/面談/シフト相談など）を示します。',
    },
    {
      role: 'user',
      content: `源氏名: ${sourceName}\n店舗: ${storeName}\nリスク: ${level}\n兆候: ${reasons.join(' / ')}\nこのキャストへの対策を1〜2文で。`,
    },
  ];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // --- 認証: Bearer トークンを取り出してSupabaseで検証 ---
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  let uid;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const userData = await userRes.json();
    uid = userData?.id;
    if (!uid) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  } catch (err) {
    console.error('[churn-comment] auth check error:', err);
    return res.status(401).json({ error: 'unauthorized' });
  }

  // --- 権限: admin か is_integrated_viewer かを確認 ---
  try {
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=role,is_integrated_viewer`,
      {
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
      }
    );
    const profiles = await profileRes.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;

    if (!profile || (profile.role !== 'admin' && !profile.is_integrated_viewer)) {
      return res.status(403).json({ error: 'forbidden' });
    }
  } catch (err) {
    console.error('[churn-comment] profile check error:', err);
    return res.status(403).json({ error: 'forbidden' });
  }

  // --- リクエストボディ検証（匿名化：源氏名/level/reasons/storeNameのみ使用） ---
  const { sourceName, level, reasons, storeName } = req.body ?? {};

  if (
    typeof sourceName !== 'string' || !sourceName ||
    (level !== 'high' && level !== 'medium') ||
    !Array.isArray(reasons) || reasons.length === 0 ||
    typeof storeName !== 'string' || !storeName
  ) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  // --- OpenAI 呼び出し（匿名化済みフィールドのみ渡す） ---
  const messages = buildChurnAdviceMessages({ sourceName, level, reasons, storeName });

  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 120,
        temperature: 0.7,
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => '');
      console.error('[churn-comment] OpenAI error:', aiRes.status, errBody);
      return res.status(200).json({ comment: null, error: 'ai_unavailable' });
    }

    const aiData = await aiRes.json();
    const comment = aiData?.choices?.[0]?.message?.content?.trim() ?? null;

    return res.status(200).json({ comment });
  } catch (err) {
    console.error('[churn-comment] OpenAI fetch error:', err);
    return res.status(200).json({ comment: null, error: 'ai_unavailable' });
  }
}
