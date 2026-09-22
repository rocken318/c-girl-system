import { describe, it, expect } from 'vitest';
import {
  statusToFields,
  fieldsToStatus,
  countsAsAttended,
} from '../lib/attendanceStatus';

describe('statusToFields', () => {
  it('出勤', () => {
    expect(statusToFields('present')).toEqual({
      attended: true, isLate: false, isAbsent: false, attendanceType: 'normal',
    });
  });
  it('同伴出勤', () => {
    expect(statusToFields('douhan')).toEqual({
      attended: true, isLate: false, isAbsent: false, attendanceType: 'douhan',
    });
  });
  it('遅刻', () => {
    expect(statusToFields('late')).toEqual({
      attended: true, isLate: true, isAbsent: false, attendanceType: 'late',
    });
  });
  it('欠勤', () => {
    expect(statusToFields('absent')).toEqual({
      attended: false, isLate: false, isAbsent: true, attendanceType: 'absent',
    });
  });
  it('当欠', () => {
    expect(statusToFields('same_day_absence')).toEqual({
      attended: false, isLate: false, isAbsent: true, attendanceType: 'same_day_absence',
    });
  });
});

describe('fieldsToStatus', () => {
  it('未確認: 出勤も欠勤もマークなし', () => {
    expect(fieldsToStatus({ attended: false, isLate: false, isAbsent: false, attendanceType: 'normal' }))
      .toBe('unconfirmed');
  });
  it('当欠を区別', () => {
    expect(fieldsToStatus({ attended: false, isLate: false, isAbsent: true, attendanceType: 'same_day_absence' }))
      .toBe('same_day_absence');
  });
  it('事前欠勤', () => {
    expect(fieldsToStatus({ attended: false, isLate: false, isAbsent: true, attendanceType: 'absent' }))
      .toBe('absent');
  });
  it('同伴出勤', () => {
    expect(fieldsToStatus({ attended: true, isLate: false, isAbsent: false, attendanceType: 'douhan' }))
      .toBe('douhan');
  });
  it('遅刻', () => {
    expect(fieldsToStatus({ attended: true, isLate: true, isAbsent: false, attendanceType: 'late' }))
      .toBe('late');
  });
  it('通常出勤', () => {
    expect(fieldsToStatus({ attended: true, isLate: false, isAbsent: false, attendanceType: 'normal' }))
      .toBe('present');
  });
});

describe('countsAsAttended', () => {
  it('出勤・同伴・遅刻は出勤扱い', () => {
    expect(countsAsAttended('present')).toBe(true);
    expect(countsAsAttended('douhan')).toBe(true);
    expect(countsAsAttended('late')).toBe(true);
  });
  it('欠勤・当欠・未確認は非出勤', () => {
    expect(countsAsAttended('absent')).toBe(false);
    expect(countsAsAttended('same_day_absence')).toBe(false);
    expect(countsAsAttended('unconfirmed')).toBe(false);
  });
});

import { mergeAttendanceData } from '../lib/attendanceStatus';

describe('mergeAttendanceData', () => {
  const existing = {
    id: 'dr_1', castId: 'cast_1', storeId: 'store_1', date: '2026-09-15',
    nominatedSales: 50000, freeSales: 20000, honShimei: 3, banaiShimei: 1,
    drinks: 5, bottles: 1, extensions: 2, hours: 5, advancePay: 0,
    attended: false, isLate: false, isAbsent: false, attendanceType: 'normal', douhan: 0,
  };

  it('売上フィールドを破壊しない', () => {
    const merged = mergeAttendanceData(existing, 'present');
    expect(merged.nominatedSales).toBe(50000);
    expect(merged.freeSales).toBe(20000);
    expect(merged.honShimei).toBe(3);
    expect(merged.attended).toBe(true);
    expect(merged.attendanceType).toBe('normal');
  });

  it('同伴出勤: douhanTime を保存し douhan を1に（未計上時）', () => {
    const merged = mergeAttendanceData({ ...existing, douhan: 0 }, 'douhan', '19:00');
    expect(merged.attendanceType).toBe('douhan');
    expect(merged.douhanTime).toBe('19:00');
    expect(merged.douhan).toBe(1);
  });

  it('同伴出勤の再マークは冪等（既存件数を維持）', () => {
    const merged = mergeAttendanceData({ ...existing, douhan: 2 }, 'douhan', '19:00');
    expect(merged.douhan).toBe(2);
  });

  it('欠勤・当欠は douhan を0に', () => {
    const merged = mergeAttendanceData({ ...existing, douhan: 1 }, 'absent');
    expect(merged.douhan).toBe(0);
    expect(merged.isAbsent).toBe(true);
  });

  it('当欠も douhan を0に', () => {
    const merged = mergeAttendanceData({ ...existing, douhan: 1 }, 'same_day_absence');
    expect(merged.douhan).toBe(0);
    expect(merged.isAbsent).toBe(true);
    expect(merged.attendanceType).toBe('same_day_absence');
  });

  it('同伴出勤で時刻未指定なら既存の douhanTime を保持', () => {
    const merged = mergeAttendanceData({ ...existing, douhanTime: '18:00' }, 'douhan');
    expect(merged.douhanTime).toBe('18:00');
    expect(merged.douhan).toBe(1);
  });

  it('入力オブジェクトを破壊しない（非破壊）', () => {
    const snapshot = { ...existing };
    mergeAttendanceData(existing, 'present');
    expect(existing).toEqual(snapshot);
  });

  it('既存レコードが空でも新規フィールドを組める', () => {
    const merged = mergeAttendanceData({}, 'late');
    expect(merged.attended).toBe(true);
    expect(merged.isLate).toBe(true);
    expect(merged.attendanceType).toBe('late');
  });

  it('同伴以外に切替えると douhanTime を消す', () => {
    const merged = mergeAttendanceData({ ...existing, douhanTime: '19:00', douhan: 1 }, 'present');
    expect(merged.douhanTime).toBeUndefined();
  });
});
