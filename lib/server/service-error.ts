/** Expected failure with a message that is safe to show the admin. */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
