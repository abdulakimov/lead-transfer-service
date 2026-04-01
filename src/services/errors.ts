export class FacebookAuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = 'FacebookAuthError';
  }
}

export class FacebookApiError extends Error {
  public retryable: boolean;

  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'FacebookApiError';
    this.retryable = statusCode >= 500;
  }
}

export class BitrixError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'BitrixError';
  }
}

export class DuplicateLeadError extends Error {
  constructor(public field: string, public value: string) {
    super(`Dublikat topildi: ${field} = ${value}`);
    this.name = 'DuplicateLeadError';
  }
}

export class MetaCapiError extends Error {
  public retryable: boolean;

  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'MetaCapiError';
    this.retryable = statusCode >= 500 || statusCode === 429;
  }
}
