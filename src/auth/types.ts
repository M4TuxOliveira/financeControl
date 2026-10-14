export interface AuthBackend {
  restore(): Promise<boolean>;
  signIn(id: string, secret?: string): Promise<'ok' | 'newPassword'>;
  completeNewPassword(pw: string): Promise<void>;
  getAccessToken(): Promise<string | null>;
  refresh(): Promise<string | null>;
  signOut(): void;
}
export type AuthStatus = 'loading' | 'signedOut' | 'newPassword' | 'signedIn';
