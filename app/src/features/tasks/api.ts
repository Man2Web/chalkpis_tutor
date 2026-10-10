import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useInstituteId } from '../../data/hooks';

export interface Task {
  id: string;
  title: string;
  dueOn: string;
  done: boolean;
}

/** The day's to-do list; unfinished older tasks carry over. */
export function useTasks(date: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['tasks', id, date],
    queryFn: async () => (await api<{ tasks: Task[] }>('GET', `/tasks?date=${date}`)).tasks,
  });
}

export function useTaskActions(date: string) {
  const qc = useQueryClient();
  const id = useInstituteId();
  const key = ['tasks', id, date];
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const add = useMutation({
    mutationFn: (title: string) => api('POST', '/tasks', { title, dueOn: date }),
    onSuccess: refresh,
  });
  const toggle = useMutation({
    mutationFn: (t: Task) => api('PATCH', `/tasks/${t.id}`, { done: !t.done }),
    // Tick at once; the server answer confirms it.
    onMutate: async (t: Task) => {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<Task[]>(key, (old) =>
        old?.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
      );
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (t: Task) => api('DELETE', `/tasks/${t.id}`),
    onSuccess: refresh,
  });
  return { add, toggle, remove };
}
