export interface AuthBackend {
  /**
   * true = stay signed in. false only for no stored user or a REAL invalid/expired session (which is also cleared).
   * A transient failure (offline, timeout) resolves true WITHOUT clearing storage; the first API call surfaces it.
   */
  restore(): Promise<boolean>;
  signIn(id: string, secret?: string): Promise<'ok' | 'newPassword'>;
  completeNewPassword(pw: string): Promise<void>;
  /** null = no usable session (invalid/signed out). THROWS on a transient error so no request goes out unauthenticated. */
  getAccessToken(): Promise<string | null>;
  /**
   * New access token, or null when the session is really invalid (the client then calls onAuthFailure → sign-out).
   * THROWS on a transient error and never signs out itself: the client rejects the request with a NETWORK ApiError.
   */
  refresh(): Promise<string | null>;
  signOut(): void;
}
export type AuthStatus = 'loading' | 'signedOut' | 'newPassword' | 'signedIn';
