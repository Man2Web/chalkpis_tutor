/** A failure with a status code and a short machine-readable reason, safe to send to the client. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export const notFound = () => new AppError(404, 'not_found');
export const badRequest = (code = 'bad_request', extra: Record<string, unknown> = {}) =>
  new AppError(400, code, extra);
