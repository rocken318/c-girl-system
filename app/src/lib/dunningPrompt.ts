export interface DunningContext {
  sourceName: string;
  storeName: string;
  targetMonth: string;
  item: string;
}

/**
 * AIに渡すメッセージ配列を組み立てる。
 * 本名・連絡先・LINE IDは含めない（呼び出し側で源氏名等のみ渡すこと）。
 */
export function buildDunningMessages(
  ctx: DunningContext,
): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content:
        'あなたは高級キャバクラの店舗マネージャーです。キャストへ、未提出物の提出を促す丁寧で親しみやすいLINEメッセージを日本語で1〜2文だけ作成します。絵文字は0〜1個。プレッシャーをかけすぎず、相手を気遣うトーン。署名や宛名の重複は不要。',
    },
    {
      role: 'user',
      content: `源氏名: ${ctx.sourceName}\n店舗: ${ctx.storeName}\n未提出: ${ctx.item}（対象: ${ctx.targetMonth}）\nこの状況の督促文を1〜2文で。`,
    },
  ];
}

/** フォールバック定型文（AI生成失敗時・キー未設定時に使用） */
export function fallbackDunning(ctx: DunningContext): string {
  return `【${ctx.storeName}】${ctx.sourceName}さん、${ctx.targetMonth}の${ctx.item}が未提出です。お早めのご提出をお願いします。`;
}
