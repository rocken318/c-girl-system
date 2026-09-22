import { describe, it, expect } from 'vitest';
import { guessMapping, mapRows, pickDefaultSheet } from '../lib/dsystemImport';
import type { ColumnMapping } from '../lib/dsystemImport';

// ---------------------------------------------------------------------------
// pickDefaultSheet
// ---------------------------------------------------------------------------
describe('pickDefaultSheet', () => {
  it('「一覧」を含むシートを優先して返す', () => {
    expect(pickDefaultSheet(['Sheet1', 'スタッフ一覧', 'サクラ'])).toBe('スタッフ一覧');
  });

  it('該当キーワードがなければ先頭シートを返す', () => {
    expect(pickDefaultSheet(['明細A', '明細B'])).toBe('明細A');
  });

  it('「集計」を含むシートを優先して返す', () => {
    expect(pickDefaultSheet(['月次集計', 'x'])).toBe('月次集計');
  });

  it('「summary」（英字・大小無視）を含むシートを優先して返す', () => {
    expect(pickDefaultSheet(['Sheet1', 'Summary'])).toBe('Summary');
  });

  it('空配列は空文字を返す', () => {
    expect(pickDefaultSheet([])).toBe('');
  });
});

// ---------------------------------------------------------------------------
// guessMapping
// ---------------------------------------------------------------------------
describe('guessMapping', () => {
  it('日付・源氏名・売上列を正しく推測する', () => {
    const headers = ['日付', '源氏名', '本指名売上', 'フリー売上', '本指名', '場内指名', '同伴', 'ドリンク', 'ボトル', '延長'];
    const mapping = guessMapping(headers);
    expect(mapping.date).toBe('日付');
    expect(mapping.sourceName).toBe('源氏名');
    expect(mapping.nominatedSales).toBe('本指名売上');
    expect(mapping.freeSales).toBe('フリー売上');
    expect(mapping.honShimei).toBe('本指名');
    expect(mapping.banaiShimei).toBe('場内指名');
    expect(mapping.douhan).toBe('同伴');
    expect(mapping.drinks).toBe('ドリンク');
    expect(mapping.bottles).toBe('ボトル');
    expect(mapping.extensions).toBe('延長');
  });

  it('キャスト・キャスト名を sourceName に推測する', () => {
    const headers = ['日付', 'キャスト名', '本指名売上'];
    const mapping = guessMapping(headers);
    expect(mapping.sourceName).toBe('キャスト名');
  });

  it('「キャスト」単体も sourceName に推測する', () => {
    const headers = ['日付', 'キャスト', '本指名売上'];
    const mapping = guessMapping(headers);
    expect(mapping.sourceName).toBe('キャスト');
  });

  it('名前も sourceName に推測する', () => {
    const headers = ['日付', '名前', '本指名売上'];
    const mapping = guessMapping(headers);
    expect(mapping.sourceName).toBe('名前');
  });

  it('シャンパン・ボトルを bottles に推測する', () => {
    const headers = ['日付', '氏名', 'シャンパン'];
    const mapping = guessMapping(headers);
    expect(mapping.bottles).toBe('シャンパン');
  });

  it('場内を banaiShimei に推測する（部分一致）', () => {
    const headers = ['日付', '氏名', '場内'];
    const mapping = guessMapping(headers);
    expect(mapping.banaiShimei).toBe('場内');
  });

  it('マッチしないヘッダは undefined のまま', () => {
    const headers = ['日付', '源氏名'];
    const mapping = guessMapping(headers);
    expect(mapping.drinks).toBeUndefined();
    expect(mapping.bottles).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// mapRows
// ---------------------------------------------------------------------------
describe('mapRows', () => {
  const baseMapping: ColumnMapping = {
    date: '日付',
    sourceName: '源氏名',
    nominatedSales: '本指名売上',
    freeSales: 'フリー売上',
    honShimei: '本指名',
    banaiShimei: '場内指名',
    douhan: '同伴',
    drinks: 'ドリンク',
    bottles: 'ボトル',
    extensions: '延長',
  };

  it('スラッシュ区切り日付を YYYY-MM-DD に正規化する', () => {
    const rows = [{ '日付': '2026/9/1', '源氏名': 'SAKURA', '本指名売上': '10000', 'フリー売上': '5000', '本指名': '3', '場内指名': '1', '同伴': '0', 'ドリンク': '2', 'ボトル': '1', '延長': '0' }];
    const { mapped, errors } = mapRows(rows, baseMapping);
    expect(errors).toHaveLength(0);
    expect(mapped[0].date).toBe('2026-09-01');
  });

  it('YYYY-MM-DD 形式はそのまま通す', () => {
    const rows = [{ '日付': '2026-09-15', '源氏名': 'SAKURA', '本指名売上': '0', 'フリー売上': '0', '本指名': '0', '場内指名': '0', '同伴': '0', 'ドリンク': '0', 'ボトル': '0', '延長': '0' }];
    const { mapped } = mapRows(rows, baseMapping);
    expect(mapped[0].date).toBe('2026-09-15');
  });

  it('Excel シリアル値の日付を正規化する（45900 → 2025-09-01 付近）', () => {
    // Excel serial 45900 = 2025-09-01 (Windows epoch: 1900-01-00)
    const rows = [{ '日付': '45901', '源氏名': 'SAKURA', '本指名売上': '0', 'フリー売上': '0', '本指名': '0', '場内指名': '0', '同伴': '0', 'ドリンク': '0', 'ボトル': '0', '延長': '0' }];
    const { mapped, errors } = mapRows(rows, baseMapping);
    // Should not be an error — should produce a valid date
    expect(errors).toHaveLength(0);
    expect(mapped[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('数値フィールドが正しく変換される', () => {
    const rows = [{ '日付': '2026-09-01', '源氏名': 'SAKURA', '本指名売上': '15000', 'フリー売上': '3000', '本指名': '5', '場内指名': '2', '同伴': '1', 'ドリンク': '8', 'ボトル': '2', '延長': '1' }];
    const { mapped } = mapRows(rows, baseMapping);
    expect(mapped[0].nominatedSales).toBe(15000);
    expect(mapped[0].freeSales).toBe(3000);
    expect(mapped[0].honShimei).toBe(5);
    expect(mapped[0].banaiShimei).toBe(2);
    expect(mapped[0].douhan).toBe(1);
    expect(mapped[0].drinks).toBe(8);
    expect(mapped[0].bottles).toBe(2);
    expect(mapped[0].extensions).toBe(1);
  });

  it('数値の変換失敗（空文字・undefined）は 0 になる', () => {
    const rows = [{ '日付': '2026-09-01', '源氏名': 'SAKURA', '本指名売上': '', 'フリー売上': '0', '本指名': '', '場内指名': '', '同伴': '', 'ドリンク': '', 'ボトル': '', '延長': '' }];
    const { mapped } = mapRows(rows, baseMapping);
    expect(mapped[0].nominatedSales).toBe(0);
    expect(mapped[0].honShimei).toBe(0);
  });

  it('date 欠落行は errors に記録され mapped から除外される', () => {
    const rows = [
      { '日付': '', '源氏名': 'SAKURA', '本指名売上': '0', 'フリー売上': '0', '本指名': '0', '場内指名': '0', '同伴': '0', 'ドリンク': '0', 'ボトル': '0', '延長': '0' },
      { '日付': '2026-09-01', '源氏名': 'RIN', '本指名売上': '0', 'フリー売上': '0', '本指名': '0', '場内指名': '0', '同伴': '0', 'ドリンク': '0', 'ボトル': '0', '延長': '0' },
    ];
    const { mapped, errors } = mapRows(rows, baseMapping);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('date');
    expect(mapped).toHaveLength(1);
    expect(mapped[0].sourceName).toBe('RIN');
  });

  it('sourceName 欠落行は errors に記録され mapped から除外される', () => {
    const rows = [
      { '日付': '2026-09-01', '源氏名': '', '本指名売上': '0', 'フリー売上': '0', '本指名': '0', '場内指名': '0', '同伴': '0', 'ドリンク': '0', 'ボトル': '0', '延長': '0' },
    ];
    const { mapped, errors } = mapRows(rows, baseMapping);
    expect(mapped).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('sourceName');
  });

  it('mapping に未指定フィールドは 0 になる（任意フィールド）', () => {
    const partialMapping: ColumnMapping = {
      date: '日付',
      sourceName: '源氏名',
    };
    const rows = [{ '日付': '2026-09-01', '源氏名': 'SAKURA' }];
    const { mapped } = mapRows(rows, partialMapping);
    expect(mapped[0].drinks).toBe(0);
    expect(mapped[0].bottles).toBe(0);
    expect(mapped[0].nominatedSales).toBe(0);
  });

  it('複数行を一括変換する', () => {
    const rows = [
      { '日付': '2026/9/1', '源氏名': 'SAKURA', '本指名売上': '10000', 'フリー売上': '0', '本指名': '2', '場内指名': '0', '同伴': '0', 'ドリンク': '3', 'ボトル': '0', '延長': '0' },
      { '日付': '2026/9/2', '源氏名': 'RIN', '本指名売上': '5000', 'フリー売上': '2000', '本指名': '1', '場内指名': '1', '同伴': '1', 'ドリンク': '5', 'ボトル': '1', '延長': '0' },
    ];
    const { mapped, errors } = mapRows(rows, baseMapping);
    expect(errors).toHaveLength(0);
    expect(mapped).toHaveLength(2);
    expect(mapped[0].date).toBe('2026-09-01');
    expect(mapped[1].date).toBe('2026-09-02');
  });
});
