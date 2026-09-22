// @ts-nocheck
import crypto from 'node:crypto';

// 生のボディが署名検証に必要なため bodyParser を無効化
export const config = { api: { bodyParser: false } };

/**
 * LINE webhook 署名検証（HMAC-SHA256, base64）
 * lineSignature.ts と同ロジックをインラインで実装（クロスディレクトリ import を避ける）
 */
function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature) return false;
  const mac = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  const a = Buffer.from(mac);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** req ストリームから rawBody 文字列を取得 */
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** LINE reply message を送信 */
async function sendReply(replyToken, channelAccessToken, text) {
  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [{ type: 'text', text }],
      }),
    });
  } catch (err) {
    console.error('LINE reply error:', err);
  }
}

/**
 * テキストメッセージで連携コードを受信した場合に cast_id / profile_id を紐付ける。
 * 成功すれば line_links を upsert して返信メッセージを送る。
 */
async function handleLinkCode(lineUserId, code, replyToken, supabaseUrl, serviceRoleKey, channelAccessToken) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
  };

  // 1) profiles からコードで検索
  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?line_link_code=eq.${encodeURIComponent(code)}&select=id,store_id,role`,
    { headers }
  );
  const profiles = await profileRes.json();

  if (!Array.isArray(profiles) || profiles.length === 0) {
    // コード不一致
    if (replyToken && channelAccessToken) {
      await sendReply(
        replyToken,
        channelAccessToken,
        '連携コードが確認できませんでした。アプリの「LINE連携」画面のコードを送信してください。'
      );
    }
    return;
  }

  const profile = profiles[0];
  const profileId = profile.id;
  const storeId = profile.store_id ?? null;

  // 2) role=cast の場合のみ cast_id を解決
  let castId = null;
  if (profile.role === 'cast' || profile.role === 'kurofuku') {
    try {
      const castRes = await fetch(
        `${supabaseUrl}/rest/v1/casts?user_id=eq.${encodeURIComponent(profileId)}&select=id`,
        { headers }
      );
      const casts = await castRes.json();
      if (Array.isArray(casts) && casts.length > 0) {
        castId = casts[0].id;
      }
    } catch (err) {
      console.error('cast lookup error:', err);
    }
  }

  // 3) line_links を upsert（on_conflict=line_user_id, merge）
  await fetch(`${supabaseUrl}/rest/v1/line_links`, {
    method: 'POST',
    headers: {
      ...headers,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      line_user_id: lineUserId,
      profile_id: profileId,
      cast_id: castId,
      store_id: storeId,
    }),
  });

  // 4) 成功返信
  if (replyToken && channelAccessToken) {
    await sendReply(
      replyToken,
      channelAccessToken,
      'LINE連携が完了しました。通知をお送りします。'
    );
  }
}

export default async function handler(req, res) {
  // GET: 疎通確認用
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok' });
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    console.error('LINE_CHANNEL_SECRET is not set');
    return res.status(500).end();
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers['x-line-signature'];

  if (!verifyLineSignature(rawBody, signature, channelSecret)) {
    return res.status(403).end();
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return res.status(400).end();
  }

  const events = Array.isArray(body.events) ? body.events : [];
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  for (const event of events) {
    const lineUserId = event?.source?.userId;
    if (!lineUserId) continue;

    const isFollow = event.type === 'follow';
    const isTextMessage = event.type === 'message' && event.message?.type === 'text';

    if (isFollow) {
      // follow イベント：line_user_id を保存（cast 未特定のまま）
      if (supabaseUrl && serviceRoleKey) {
        try {
          await fetch(`${supabaseUrl}/rest/v1/line_links`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Prefer': 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify({ line_user_id: lineUserId }),
          });
        } catch (err) {
          console.error('Supabase upsert error (follow):', err);
        }
      }
    } else if (isTextMessage) {
      // テキストメッセージ：連携コードとして照合を試みる
      const text = (event.message.text ?? '').trim().toUpperCase();
      const replyToken = event.replyToken ?? null;

      // 8桁英数字パターンかどうかを確認（簡易フィルタ）
      const isLinkCode = /^[A-Z0-9]{8}$/.test(text);

      if (isLinkCode && supabaseUrl && serviceRoleKey) {
        try {
          await handleLinkCode(lineUserId, text, replyToken, supabaseUrl, serviceRoleKey, channelAccessToken);
        } catch (err) {
          console.error('handleLinkCode error:', err);
          // エラーでも LINE には 200 を返す
        }
      } else if (supabaseUrl && serviceRoleKey) {
        // 連携コードでないテキスト：line_user_id のみ保存（既存動作）
        try {
          await fetch(`${supabaseUrl}/rest/v1/line_links`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': serviceRoleKey,
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Prefer': 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify({ line_user_id: lineUserId }),
          });
        } catch (err) {
          console.error('Supabase upsert error (text):', err);
        }
      }
    }
  }

  // LINE は常に 200 を期待する
  return res.status(200).json({ ok: true });
}
