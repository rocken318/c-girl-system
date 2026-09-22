// @ts-nocheck
/**
 * POST /api/ai/exec-summary
 * 当月の経営サマリ（今月の要点）をAIで2〜3文生成。
 * - 管理者(admin/統合)のSupabase JWTを検証してから実行。
 * - AIへ渡すのは集計数値と店名のみ（個人情報・源氏名は一切渡さない）。
 */

// buildExecSummaryMessages 相当をインラインで実装（クロスディレクトリ import を避ける）
function buildExecSummaryMessages({ storeName, month, sales, target, achievement, yoyRate, projection, atRiskCount, isPartial, asOf }) {
  const yoyLabel = isPartial ? '前年同月比(同日数まで)' : '前年比';
  const lines = [
    `店舗: ${storeName}`,
    `対象月: ${month}${isPartial && asOf ? `（${asOf}時点・月途中）` : ''}`,
    `当月売上: ¥${Number(sales).toLocaleString()}`,
    `目標: ${target != null ? '¥' + Number(target).toLocaleString() : '未設定'}`,
    `達成率: ${achievement != null ? achievement + '%' : '—'}`,
    `${yoyLabel}: ${yoyRate != null ? (yoyRate >= 0 ? '+' : '') + yoyRate + '%' : '—'}`,
    `着地見込: ${projection != null ? '¥' + Number(projection).toLocaleString() : '—'}`,
    `離脱リスク該当: ${atRiskCount}名`,
  ];
  if (isPartial) {
    lines.push(
      '注意: これは月の途中の実績です。前年比は前年同月の「同じ日数まで」で比較済みのため単純比較して問題ありません。' +
      '当月売上(部分)を前年の丸ひと月と比べて「減少」と断定しないこと。評価は前年同日比・着地見込・達成ペースで行うこと。',
    );
  }
  return [
    {
      role: 'system',
      content:
        'あなたは高級キャバクラの経営参謀です。以下の当月指標から、経営者向けに「今月の要点」を日本語2〜3文で簡潔に要約します。' +
        '良い点と注意点をバランスよく、具体的な次アクションを1つ添えます。誇張や不確実な断定は避けます。' +
        '月の途中の場合は、部分実績を前年の満月と単純比較して「売上が落ちている」と述べてはいけません。前年同日比や着地見込、達成ペースで評価してください。',
    },
    {
      role: 'user',
      content: lines.join('\n') + '\n\nこの状況の要点を2〜3文で。',
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
    console.error('[exec-summary] auth check error:', err);
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
    console.error('[exec-summary] profile check error:', err);
    return res.status(403).json({ error: 'forbidden' });
  }

  // --- リクエストボディ検証（集計値のみ使用・個人情報なし） ---
  const { storeName, month, sales, target, achievement, yoyRate, projection, atRiskCount, isPartial, asOf } = req.body ?? {};

  if (typeof storeName !== 'string' || !storeName) {
    return res.status(400).json({ error: 'invalid_body' });
  }
  if (typeof month !== 'string' || !month) {
    return res.status(400).json({ error: 'invalid_body' });
  }
  if (typeof sales !== 'number') {
    return res.status(400).json({ error: 'invalid_body' });
  }
  if (typeof atRiskCount !== 'number') {
    return res.status(400).json({ error: 'invalid_body' });
  }

  // --- OpenAI 呼び出し（集計値のみ渡す・個人情報なし） ---
  const messages = buildExecSummaryMessages({
    storeName, month, sales,
    target: target ?? null,
    achievement: achievement ?? null,
    yoyRate: yoyRate ?? null,
    projection: projection ?? null,
    atRiskCount,
    isPartial: isPartial === true,
    asOf: typeof asOf === 'string' ? asOf : null,
  });

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
        max_tokens: 200,
        temperature: 0.6,
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => '');
      console.error('[exec-summary] OpenAI error:', aiRes.status, errBody);
      return res.status(200).json({ summary: null, error: 'ai_unavailable' });
    }

    const aiData = await aiRes.json();
    const summary = aiData?.choices?.[0]?.message?.content?.trim() ?? null;

    return res.status(200).json({ summary });
  } catch (err) {
    console.error('[exec-summary] OpenAI fetch error:', err);
    return res.status(200).json({ summary: null, error: 'ai_unavailable' });
  }
}
