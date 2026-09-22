// @ts-nocheck

/**
 * 未提出シフト確認 cron
 * Vercel Cron から呼ばれる（Authorization: Bearer $CRON_SECRET を自動付与）
 * または ?secret=xxx クエリでも検証（手動テスト用）
 *
 * AI督促文生成：OPENAI_API_KEY が設定されている場合は gpt-4o-mini で生成。
 * 匿名化：AIへ渡すのは源氏名(source_name)・店名・未提出内容・対象月のみ。
 *         本名・電話・line_user_id は渡さない。
 * フォールバック：生成失敗・キー未設定・例外時は fallbackDunning() の定型文を使用。
 * ※ buildDunningMessages/fallbackDunning のロジックは app/src/lib/dunningPrompt.ts が
 *    source of truth。api/ は依存ゼロ方針のためここにインライン複製。
 */

// ── AI督促文生成（インライン実装 / source of truth は app/src/lib/dunningPrompt.ts）──

/** フォールバック定型文 */
function fallbackDunning({ sourceName, storeName, targetMonth, item }) {
  return `【${storeName}】${sourceName}さん、${targetMonth}の${item}が未提出です。お早めのご提出をお願いします。`;
}

/**
 * OpenAI で督促文を生成。失敗・キー無し・例外時は fallbackDunning を返す。
 * 匿名化：源氏名・店名・未提出内容・対象月のみ渡す。本名/電話/line_user_id は渡さない。
 */
async function generateDunning({ sourceName, storeName, targetMonth, item }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { text: fallbackDunning({ sourceName, storeName, targetMonth, item }), aiUsed: false };
  }

  const messages = [
    {
      role: 'system',
      content:
        'あなたは高級キャバクラの店舗マネージャーです。キャストへ、未提出物の提出を促す丁寧で親しみやすいLINEメッセージを日本語で1〜2文だけ作成します。絵文字は0〜1個。プレッシャーをかけすぎず、相手を気遣うトーン。署名や宛名の重複は不要。',
    },
    {
      role: 'user',
      content: `源氏名: ${sourceName}\n店舗: ${storeName}\n未提出: ${item}（対象: ${targetMonth}）\nこの状況の督促文を1〜2文で。`,
    },
  ];

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 120,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      console.error(`OpenAI API error: ${res.status}`);
      return { text: fallbackDunning({ sourceName, storeName, targetMonth, item }), aiUsed: false };
    }
    const data = await res.json();
    const generated = data?.choices?.[0]?.message?.content?.trim();
    if (!generated) {
      return { text: fallbackDunning({ sourceName, storeName, targetMonth, item }), aiUsed: false };
    }
    return { text: generated, aiUsed: true };
  } catch (err) {
    console.error('generateDunning error:', err);
    return { text: fallbackDunning({ sourceName, storeName, targetMonth, item }), aiUsed: false };
  }
}

// ──────────────────────────────────────────────────────────────────────────────

/** 未提出cast差集合（submissionCheck.ts と同ロジックをインライン実装） */
function unsubmittedCasts(activeCastIds, submittedCastIds) {
  const done = new Set(submittedCastIds);
  return activeCastIds.filter((id) => !done.has(id));
}

/** 翌月の YYYY-MM キーを JST で算出 */
function nextMonthKey() {
  const now = new Date();
  // JST = UTC+9
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth() + 1; // 0-indexed → 1-indexed
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

/** Supabase REST GET */
async function supabaseGet(supabaseUrl, serviceRoleKey, path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase GET ${path} failed: ${res.status}`);
  }
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
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${body}`);
  }
}

export default async function handler(req, res) {
  // CRON_SECRET 検証
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // CRON_SECRET 未設定の場合は素通り不可
    return res.status(401).json({ error: 'CRON_SECRET not configured' });
  }

  const authHeader = req.headers['authorization'] ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const querySecret = req.query?.secret ?? null;

  if (bearerToken !== cronSecret && querySecret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase env not configured' });
  }

  const periodKey = nextMonthKey();
  let checked = 0;
  let notified = 0;
  let aiUsed = 0;

  try {
    // アクティブ casts を取得（source_name・store_name はAI督促文の匿名化入力に使用）
    const activeCasts = await supabaseGet(
      supabaseUrl,
      serviceRoleKey,
      'casts?select=id,source_name,store_name&status=eq.active'
    );
    const activeCastIds = activeCasts.map((c) => c.id);
    checked = activeCastIds.length;

    if (activeCastIds.length === 0) {
      return res.json({ checked, notified, aiUsed });
    }

    // cast情報をIDでひける Map（source_name/store_name のみ保持。本名等は含まない）
    const castMap = new Map(
      activeCasts.map((c) => [c.id, { sourceName: c.source_name ?? '担当者', storeName: c.store_name ?? 'KINGYO' }])
    );

    // 翌月のシフトが1件以上あるcasts（=提出済み）を取得
    // shifts テーブルから翌月 period_key に一致する cast_id を distinct で取得
    const submittedShifts = await supabaseGet(
      supabaseUrl,
      serviceRoleKey,
      `shifts?select=cast_id&period_key=eq.${periodKey}&status=in.(approved,published)`
    );
    const submittedCastIds = [...new Set(submittedShifts.map((s) => s.cast_id))];

    // 未提出 cast_id 一覧
    const unsubmitted = unsubmittedCasts(activeCastIds, submittedCastIds);

    if (unsubmitted.length === 0 || !channelAccessToken) {
      return res.json({ checked, notified, aiUsed });
    }

    // 未提出 cast の line_links を取得（line_user_id のみ取得。本名等は取らない）
    const castIdFilter = unsubmitted.map((id) => `cast_id.eq.${id}`).join(',');
    const lineLinks = await supabaseGet(
      supabaseUrl,
      serviceRoleKey,
      `line_links?select=cast_id,line_user_id&or=(${castIdFilter})`
    );

    // LINE 通知を送信（cast ごとに AI 督促文を生成）
    for (const link of lineLinks) {
      if (!link.line_user_id) continue;
      try {
        const castInfo = castMap.get(link.cast_id) ?? { sourceName: '担当者', storeName: 'KINGYO' };
        // 匿名化：generateDunning に渡すのは 源氏名・店名・未提出内容・対象月のみ
        const { text: message, aiUsed: used } = await generateDunning({
          sourceName: castInfo.sourceName,
          storeName: castInfo.storeName,
          targetMonth: periodKey,
          item: 'シフト希望',
        });
        if (used) aiUsed++;
        await pushLine(link.line_user_id, message, channelAccessToken);
        notified++;
      } catch (err) {
        // 個別の送信エラーはログに残して継続
        console.error(`LINE push error for cast_id=${link.cast_id}:`, err);
      }
    }
  } catch (err) {
    // データ無し・LINE未紐付けでもエラーにせず件数0で正常終了
    console.error('check-submissions error:', err);
  }

  return res.json({ checked, notified, aiUsed });
}
