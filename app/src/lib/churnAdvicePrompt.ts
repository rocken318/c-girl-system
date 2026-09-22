export interface ChurnAdviceCtx {
  sourceName: string;
  level: 'high' | 'medium';
  reasons: string[];
  storeName: string;
}

/**
 * AIに渡すメッセージ配列を組み立てる。
 * 本名・連絡先・LINE ID・cast_id は含めない（呼び出し側で源氏名等のみ渡すこと）。
 */
export function buildChurnAdviceMessages(
  c: ChurnAdviceCtx,
): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content:
        'あなたは高級キャバクラの店舗マネージャーです。離脱の兆候があるキャストへの、思いやりがあり実行可能な対策を日本語で1〜2文だけ提案します。断定や責めは避け、担当黒服が取れる具体的アクション（声かけ/面談/シフト相談など）を示します。',
    },
    {
      role: 'user',
      content: `源氏名: ${c.sourceName}\n店舗: ${c.storeName}\nリスク: ${c.level}\n兆候: ${c.reasons.join(' / ')}\nこのキャストへの対策を1〜2文で。`,
    },
  ];
}
