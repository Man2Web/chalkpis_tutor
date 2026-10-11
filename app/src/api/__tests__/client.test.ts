import { renderHook, act } from '@testing-library/react-native';
import { api, ApiError } from '../client';
import { newIdempotencyKey, outcomeUnknown, useIdempotencyKey } from '../idempotency';

jest.mock('../tokens', () => ({
  tokens: {
    getAccess: jest.fn().mockResolvedValue('acc'),
    getRefresh: jest.fn().mockResolvedValue('ref'),
    peekAccess: () => 'acc',
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

const reply = (status: number, body?: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  }) as unknown as Response;

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => jest.useRealTimers());

const headersOf = (call: number) =>
  (fetchMock.mock.calls[call][1] as { headers: Record<string, string> }).headers;

describe('api with an idempotency key', () => {
  it('sends the Idempotency-Key header only when given', async () => {
    fetchMock.mockResolvedValue(reply(200, { id: 'x' }));
    await api('POST', '/tasks', { title: 'a' }, { idempotencyKey: 'k'.repeat(24) });
    expect(headersOf(0)['Idempotency-Key']).toBe('k'.repeat(24));
    expect(headersOf(0)['Content-Type']).toBe('application/json');
    expect(headersOf(0).Authorization).toBe('Bearer acc');
    await api('POST', '/tasks', { title: 'b' });
    expect(headersOf(1)['Idempotency-Key']).toBeUndefined();
  });

  it('waits a moment and asks once more while the first request is still running', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(reply(409, { error: 'request_in_progress' }))
      .mockResolvedValueOnce(reply(201, { id: 'p1' }));
    const p = api('POST', '/fees/dues/d/payments', {}, { idempotencyKey: 'key-0123456789abcdef' });
    await jest.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toEqual({ id: 'p1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headersOf(1)['Idempotency-Key']).toBe('key-0123456789abcdef');
  });

  it('retries only once', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(reply(409, { error: 'request_in_progress' }));
    const p = api('POST', '/x', {}, { idempotencyKey: 'key-0123456789abcdef' }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(1000);
    const e = await p;
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe('request_in_progress');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry other conflicts, or requests without a key', async () => {
    fetchMock.mockResolvedValue(reply(409, { error: 'exceeds_balance' }));
    await expect(api('POST', '/x', {}, { idempotencyKey: 'key-0123456789abcdef' })).rejects.toThrow(
      'exceeds_balance',
    );
    fetchMock.mockResolvedValue(reply(409, { error: 'request_in_progress' }));
    await expect(api('POST', '/x', {})).rejects.toThrow('request_in_progress');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('idempotency keys', () => {
  it('are at least 24 characters the server accepts, and differ each time', () => {
    const keys = new Set(Array.from({ length: 500 }, newIdempotencyKey));
    expect(keys.size).toBe(500);
    for (const k of keys) expect(k).toMatch(/^[A-Za-z0-9_-]{24,100}$/);
  });

  it('only an unknown outcome keeps the key', () => {
    expect(outcomeUnknown(new ApiError(0, 'network'))).toBe(true);
    expect(outcomeUnknown(new ApiError(502, 'unknown'))).toBe(true);
    expect(outcomeUnknown(new ApiError(409, 'request_in_progress'))).toBe(true);
    expect(outcomeUnknown(new ApiError(409, 'exceeds_balance'))).toBe(false);
    expect(outcomeUnknown(new Error('exceeds'))).toBe(false);
  });

  it('useIdempotencyKey keeps one key across retries and gives a new one after reset', async () => {
    const { result } = await renderHook(() => useIdempotencyKey());
    const first = result.current.key;
    await act(async () => result.current.settle(new ApiError(0, 'network')));
    expect(result.current.key).toBe(first);
    await act(async () => result.current.reset());
    const second = result.current.key;
    expect(second).not.toBe(first);
    await act(async () => result.current.settle(new ApiError(400, 'bad_amount')));
    expect(result.current.key).not.toBe(second);
  });
});
