import { describe, it, expect } from 'vitest';
import { buildAttendanceConfirmMessage } from '../lib/attendanceConfirm';
import type { AttendanceConfirmInput } from '../lib/attendanceConfirm';

const base: AttendanceConfirmInput = {
  sourceName: 'さくら',
  startTime: '20:00',
  endTime: '01:00',
};

describe('buildAttendanceConfirmMessage', () => {
  it('基本（源氏名＋出勤時刻）を含む', () => {
    const msg = buildAttendanceConfirmMessage(base);
    expect(msg).toContain('さくらさん');
    expect(msg).toContain('20:00');
    expect(msg).toContain('01:00');
  });

  it('店名を含めない', () => {
    const msg = buildAttendanceConfirmMessage({ ...base });
    expect(msg).not.toContain('【');
    expect(msg).not.toContain('KINGYO');
  });

  it('ヘアメ時間が無い場合はヘアメ行を出さない', () => {
    const msg = buildAttendanceConfirmMessage(base);
    expect(msg).not.toContain('ヘアメ');
  });

  it('ヘアメ時間がある場合はヘアメ行を出す', () => {
    const msg = buildAttendanceConfirmMessage({ ...base, hairMakeTime: '18:00' });
    expect(msg).toContain('ヘアメ');
    expect(msg).toContain('18:00');
  });

  it('同伴予定が無い場合は同伴行を出さない', () => {
    const msg = buildAttendanceConfirmMessage(base);
    expect(msg).not.toContain('同伴');
  });

  it('同伴予定がある場合は同伴行を出す', () => {
    const msg = buildAttendanceConfirmMessage({ ...base, douhanTime: '19:00' });
    expect(msg).toContain('同伴');
    expect(msg).toContain('19:00');
  });

  it('ヘアメ・同伴の両方がある場合は両方の行を出す', () => {
    const msg = buildAttendanceConfirmMessage({
      ...base,
      hairMakeTime: '18:00',
      douhanTime: '19:00',
    });
    expect(msg).toContain('18:00');
    expect(msg).toContain('19:00');
    // 4 行（挨拶＋出勤／ヘアメ／同伴）を想定：任意行が2本増える
    const lines = msg.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('空文字の任意項目は行を出さない', () => {
    const msg = buildAttendanceConfirmMessage({ ...base, hairMakeTime: '', douhanTime: '' });
    expect(msg).not.toContain('ヘアメ');
    expect(msg).not.toContain('同伴');
  });
});
