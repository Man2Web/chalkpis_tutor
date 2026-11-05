import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useIdempotencyKey } from '../../api/idempotency';
import { useInstituteId } from '../../data/hooks';
import type { Source, Stage } from './logic';

export interface Enquiry {
  id: string;
  name: string;
  parentName: string;
  /** +91… */
  phone: string;
  class: string;
  interest: string;
  batchId: string | null;
  batchName: string | null;
  source: Source;
  status: Stage;
  /** yyyy-mm-dd */
  nextFollowUp: string | null;
  lostReason: string;
  studentId: string | null;
  createdAt: string;
  notes: number;
  lastNote: string | null;
}

export interface EnquiryList {
  enquiries: Enquiry[];
  counts: Record<Stage, number>;
  dueFollowUps: number;
  thisMonth: { enquiries: number; joined: number };
}

export interface EnquiryInput {
  name: string;
  parentName: string;
  phone: string;
  class: string;
  interest: string;
  batchId: string | null;
  source: Source;
  nextFollowUp: string | null;
  note?: string;
}

/** Every enquiry (the board and the counts). */
export function useEnquiries() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['enquiries', id],
    queryFn: () => api<EnquiryList>('GET', '/enquiries'),
  });
}

/** One enquiry with its notes, newest first. */
export interface EnquiryDetail {
  enquiry: Enquiry;
  notes: { id: string; note: string; createdAt: string }[];
}

export function useEnquiry(enquiryId: string | undefined) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['enquiry', id, enquiryId],
    enabled: !!enquiryId,
    queryFn: () => api<EnquiryDetail>('GET', `/enquiries/${enquiryId}`),
  });
}

/** The student fields confirmed when an enquiry joins. */
export interface JoinInput {
  name: string;
  parentName: string;
  parentPhone: string;
  class: string;
  monthlyFee: number;
  batchIds: string[];
}

export function useEnquiryActions() {
  const qc = useQueryClient();
  const id = useInstituteId();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['enquiries', id] }),
      qc.invalidateQueries({ queryKey: ['enquiry', id] }),
    ]);
  // one key per new enquiry and per admission, so a retry after a lost answer cannot add it twice
  const idem = useIdempotencyKey();
  const joinIdem = useIdempotencyKey();
  const create = useMutation({
    mutationFn: (input: EnquiryInput) =>
      api<{ id: string }>('POST', '/enquiries', input, { idempotencyKey: idem.key }),
    onSuccess: () => {
      idem.reset();
      return refresh();
    },
    onError: idem.settle,
  });
  const update = useMutation({
    mutationFn: ({
      id: eid,
      ...patch
    }: Partial<Omit<EnquiryInput, 'note'>> & { id: string; status?: Stage; lostReason?: string }) =>
      api('PATCH', `/enquiries/${eid}`, patch),
    // Show the change at once, so a second tap (another follow-up day, another stage) builds on the first instead
    // of on the copy from before it; the server's answer then confirms it, or a failure puts it back.
    onMutate: async ({ id: eid, ...patch }) => {
      const key = ['enquiry', id, eid];
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<EnquiryDetail>(key);
      if (before)
        qc.setQueryData<EnquiryDetail>(key, {
          ...before,
          enquiry: { ...before.enquiry, ...patch },
        });
      return { key, before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(ctx.key, ctx.before);
    },
    onSettled: refresh,
  });
  const addNote = useMutation({
    mutationFn: ({ id: eid, note }: { id: string; note: string }) =>
      api('POST', `/enquiries/${eid}/notes`, { note }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (eid: string) => api('DELETE', `/enquiries/${eid}`),
    onSuccess: refresh,
  });
  const join = useMutation({
    mutationFn: ({ id: eid, student }: { id: string; student: JoinInput }) =>
      api<{ studentId: string }>('POST', `/enquiries/${eid}/convert`, student, {
        idempotencyKey: joinIdem.key,
      }),
    onSuccess: () => {
      joinIdem.reset();
      void qc.invalidateQueries({ queryKey: ['students'] });
      return refresh();
    },
    onError: joinIdem.settle,
  });
  return { create, update, addNote, remove, join };
}
