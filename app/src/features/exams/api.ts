import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useIdempotencyKey } from '../../api/idempotency';
import { useInstituteId } from '../../data/hooks';
import type { Result } from './logic';

export interface Exam {
  id: string;
  batchId: string;
  batchName: string;
  name: string;
  subject: string;
  /** yyyy-mm-dd */
  date: string;
  maxMarks: number;
  passPercent: number;
}

export interface ExamListItem extends Exam {
  /** Results entered so far (marks or absent). */
  entered: number;
  /** Active students in the batch now. */
  students: number;
  average: number | null;
}

export interface ExamResult extends Result {
  remark: string;
}

export interface StudentExam extends Exam {
  marks: number | null;
  absent: boolean;
  remark: string;
  percent: number | null;
  rank: number | null;
  /** How many sat the test (ranked). */
  of: number;
  classAverage: number | null;
}

export interface ExamInput {
  batchId: string;
  name: string;
  subject: string;
  date: string;
  maxMarks: number;
  passPercent: number;
}

/** The centre's tests, newest first; one batch's when `batchId` is given. */
export function useExams(batchId?: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['exams', id, batchId ?? 'all'],
    queryFn: async () =>
      (
        await api<{ exams: ExamListItem[] }>(
          'GET',
          `/exams${batchId ? `?batchId=${encodeURIComponent(batchId)}` : ''}`,
        )
      ).exams,
  });
}

/** One test with who should have a result and the results so far. */
export function useExam(examId: string | undefined) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['exam', id, examId],
    enabled: !!examId,
    queryFn: () =>
      api<{ exam: Exam; roster: string[]; results: ExamResult[] }>('GET', `/exams/${examId}`),
  });
}

/** A student's results, newest first, with rank and class average. */
export function useStudentExams(studentId: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['studentExams', id, studentId],
    queryFn: async () =>
      (await api<{ exams: StudentExam[] }>('GET', `/students/${studentId}/exams`)).exams,
  });
}

export function useExamActions() {
  const qc = useQueryClient();
  const id = useInstituteId();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['exams', id] }),
      qc.invalidateQueries({ queryKey: ['exam', id] }),
      qc.invalidateQueries({ queryKey: ['studentExams', id] }),
    ]);
  // one key per new test, so a retry after a lost answer cannot add it twice
  const idem = useIdempotencyKey();
  const create = useMutation({
    mutationFn: (input: ExamInput) =>
      api<{ id: string }>('POST', '/exams', input, { idempotencyKey: idem.key }),
    onSuccess: () => {
      idem.reset();
      return refresh();
    },
    onError: idem.settle,
  });
  const update = useMutation({
    mutationFn: ({ id: examId, ...patch }: Partial<ExamInput> & { id: string }) =>
      api('PATCH', `/exams/${examId}`, patch),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (examId: string) => api('DELETE', `/exams/${examId}`),
    onSuccess: refresh,
  });
  const saveMarks = useMutation({
    mutationFn: ({ id: examId, marks }: { id: string; marks: ExamResult[] }) =>
      api('PUT', `/exams/${examId}/marks`, { marks }),
    onSuccess: refresh,
  });
  return { create, update, remove, saveMarks };
}
