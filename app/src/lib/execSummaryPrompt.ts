export interface ExecSummaryCtx {
  storeName: string;
  month: string;
  sales: number;
  target: number | null;
  achievement: number | null;
  yoyRate: number | null;
  projection: number | null;
  atRiskCount: number;
  /** 月の途中か（true の場合、前年比は「前年同月の同じ日数まで」で公平比較している前提） */
  isPartial?: boolean;
  /** 「16日時点」等の集計基準ラベル（isPartial 時に使用） */
  asOf?: string;
}

export function buildExecSummaryMessages(
  c: ExecSummaryCtx,
): { role: 'system' | 'user'; content: string }[] {
  const yoyLabel = c.isPartial ? '前年同月比(同日数まで)' : '前年比';
  const lines = [
    `店舗: ${c.storeName}`,
    `対象月: ${c.month}${c.isPartial && c.asOf ? `（${c.asOf}時点・月途中）` : ''}`,
    `当月売上: ¥${c.sales.toLocaleString()}`,
    `目標: ${c.target != null ? '¥' + c.target.toLocaleString() : '未設定'}`,
    `達成率: ${c.achievement != null ? c.achievement + '%' : '—'}`,
    `${yoyLabel}: ${c.yoyRate != null ? (c.yoyRate >= 0 ? '+' : '') + c.yoyRate + '%' : '—'}`,
    `着地見込: ${c.projection != null ? '¥' + c.projection.toLocaleString() : '—'}`,
    `離脱リスク該当: ${c.atRiskCount}名`,
  ];
  if (c.isPartial) {
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
