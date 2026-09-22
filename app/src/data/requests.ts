import { supabase } from '../lib/supabase';

export type RequestStatus = 'pending' | 'approved' | 'rejected';
export interface RequestRow {
  id: string; storeId: string; castId: string; castName: string;
  type: string; date: string; detail: string; status: RequestStatus; createdAt: string;
}

type Row = {
  id: string; store_id: string; cast_id: string; type: string; date: string;
  detail: string; status: RequestStatus; created_at: string;
  casts?: { source_name?: string | null } | null;
};

function mapRow(r: Row): RequestRow {
  return {
    id: r.id, storeId: r.store_id, castId: r.cast_id,
    castName: r.casts?.source_name ?? '',
    type: r.type, date: r.date, detail: r.detail,
    status: r.status, createdAt: (r.created_at ?? '').slice(0, 10),
  };
}

const SEL = 'id, store_id, cast_id, type, date, detail, status, created_at, casts(source_name)';

export async function fetchMyRequests(castId: string): Promise<RequestRow[]> {
  const { data, error } = await supabase.from('requests').select(SEL)
    .eq('cast_id', castId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => mapRow(r as unknown as Row));
}

export async function fetchStoreRequests(storeId: string): Promise<RequestRow[]> {
  const { data, error } = await supabase.from('requests').select(SEL)
    .eq('store_id', storeId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => mapRow(r as unknown as Row));
}

export async function createRequest(input: {
  storeId: string; castId: string; type: string; date: string; detail: string;
}): Promise<void> {
  const { error } = await supabase.from('requests').insert({
    store_id: input.storeId, cast_id: input.castId,
    type: input.type, date: input.date, detail: input.detail, status: 'pending',
  });
  if (error) throw error;
}

export async function updateRequestStatus(id: string, status: RequestStatus): Promise<void> {
  const { error } = await supabase.from('requests').update({ status }).eq('id', id);
  if (error) throw error;
}
