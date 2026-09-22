/** 未提出者＝アクティブcastのうち提出済に含まれないcast_id */
export function unsubmittedCasts(
  activeCastIds: string[],
  submittedCastIds: string[]
): string[] {
  const done = new Set(submittedCastIds);
  return activeCastIds.filter((id) => !done.has(id));
}
