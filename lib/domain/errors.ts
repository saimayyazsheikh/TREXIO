/** Expected failure with a message that is safe to show to the user. `status` maps to the HTTP response. */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 | 502 | 503 = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
