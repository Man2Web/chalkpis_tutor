import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useIdempotencyKey } from '../../api/idempotency';
import { useInstituteId } from '../../data/hooks';
import type { CalendarEvent, CalendarRange, EventKind } from './logic';

export interface EventInput {
  title: string;
  kind: EventKind;
  startsOn: string;
  endsOn: string;
  batchId: string | null;
  notes: string;
}

/** The centre's events, tests and homework due days between two days (two months at most). */
export function useCalendar(from: string, to: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['calendar', id, from, to],
    queryFn: () => api<CalendarRange>('GET', `/calendar?from=${from}&to=${to}`),
    placeholderData: (prev) => prev,
  });
}

export function useCalendarEvent(eventId: string | undefined) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['calendarEvent', id, eventId],
    enabled: !!eventId,
    queryFn: () => api<CalendarEvent>('GET', `/calendar/events/${eventId}`),
  });
}

export function useCalendarActions() {
  const qc = useQueryClient();
  const id = useInstituteId();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['calendar', id] }),
      qc.invalidateQueries({ queryKey: ['calendarEvent', id] }),
    ]);
  // one key per new event, so a retry after a lost answer cannot add it twice
  const idem = useIdempotencyKey();
  const create = useMutation({
    mutationFn: (input: EventInput) =>
      api<{ id: string }>('POST', '/calendar/events', input, { idempotencyKey: idem.key }),
    onSuccess: () => {
      idem.reset();
      return refresh();
    },
    onError: idem.settle,
  });
  const update = useMutation({
    mutationFn: ({ id: eventId, ...patch }: Partial<EventInput> & { id: string }) =>
      api('PATCH', `/calendar/events/${eventId}`, patch),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (eventId: string) => api('DELETE', `/calendar/events/${eventId}`),
    onSuccess: refresh,
  });
  return { create, update, remove };
}
