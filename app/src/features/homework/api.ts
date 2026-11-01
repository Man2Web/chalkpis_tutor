import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useIdempotencyKey } from '../../api/idempotency';
import { useInstituteId } from '../../data/hooks';
import type { Check } from './logic';

export interface Homework {
  id: string;
  batchId: string;
  batchName: string;
  title: string;
  subject: string;
  details: string;
  /** yyyy-mm-dd */
  setOn: string;
  dueOn: string;
}

export interface HomeworkListItem extends Homework {
  done: number;
  missing: number;
  /** Active students in the batch now. */
  students: number;
}

export interface HomeworkInput {
  batchId: string;
  title: string;
  subject: string;
  details: string;
  dueOn: string;
}

/** The centre's homework, latest due first; one batch's when `batchId` is given. */
export function useHomeworkList(batchId?: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['homework', id, batchId ?? 'all'],
    queryFn: async () =>
      (
        await api<{ homework: HomeworkListItem[] }>(
          'GET',
          `/homework${batchId ? `?batchId=${encodeURIComponent(batchId)}` : ''}`,
        )
      ).homework,
  });
}

/** One piece of homework with who should hand it in and the ticks so far. */
export function useHomework(homeworkId: string | undefined) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['homeworkOne', id, homeworkId],
    enabled: !!homeworkId,
    queryFn: () =>
      api<{ homework: Homework; roster: string[]; checks: { studentId: string; status: Check }[] }>(
        'GET',
        `/homework/${homeworkId}`,
      ),
  });
}

/** A student's homework, latest due first, with their own tick. */
export function useStudentHomework(studentId: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['studentHomework', id, studentId],
    queryFn: async () =>
      (
        await api<{ homework: (Homework & { status: Check | null })[] }>(
          'GET',
          `/students/${studentId}/homework`,
        )
      ).homework,
  });
}

export function useHomeworkActions() {
  const qc = useQueryClient();
  const id = useInstituteId();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['homework', id] }),
      qc.invalidateQueries({ queryKey: ['homeworkOne', id] }),
      qc.invalidateQueries({ queryKey: ['studentHomework', id] }),
    ]);
  // one key per new piece of homework, so a retry after a lost answer cannot set it twice
  const idem = useIdempotencyKey();
  const create = useMutation({
    mutationFn: (input: HomeworkInput) =>
      api<{ id: string }>('POST', '/homework', input, { idempotencyKey: idem.key }),
    onSuccess: () => {
      idem.reset();
      return refresh();
    },
    onError: idem.settle,
  });
  const update = useMutation({
    mutationFn: ({ id: hwId, ...patch }: Partial<HomeworkInput> & { id: string }) =>
      api('PATCH', `/homework/${hwId}`, patch),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (hwId: string) => api('DELETE', `/homework/${hwId}`),
    onSuccess: refresh,
  });
  const saveChecks = useMutation({
    mutationFn: ({
      id: hwId,
      checks,
    }: {
      id: string;
      checks: { studentId: string; status: Check | null }[];
    }) => api('PUT', `/homework/${hwId}/checks`, { checks }),
    onSuccess: refresh,
  });
  return { create, update, remove, saveChecks };
}
