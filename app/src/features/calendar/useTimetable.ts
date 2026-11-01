import { useMemo } from 'react';
import { useBatches, useStaff } from '../../data/hooks';
import { clashes } from './logic';

/**
 * The batches with who takes each: helpers come from the staff list (each helper lists their batches), and a batch
 * with no helper is the owner's. Also the clashes this makes.
 */
export function useTimetable() {
  const batches = useBatches();
  const staff = useStaff();
  return useMemo(() => {
    const all = batches.data ?? [];
    const teachers: Record<string, string[]> = {};
    const names: Record<string, string> = {};
    for (const s of staff.data ?? []) {
      names[s.id] = s.name || s.phone;
      for (const b of s.batchIds) (teachers[b] ??= []).push(s.id);
    }
    return {
      batches: all,
      loading: batches.isLoading,
      error: batches.isError,
      refetch: () => void batches.refetch(),
      helpersOf: (batchId: string) => (teachers[batchId] ?? []).map((id) => names[id] ?? ''),
      nameOf: (staffId: string) => names[staffId] ?? '',
      clashes: clashes(all, teachers),
    };
  }, [batches, staff.data]);
}
