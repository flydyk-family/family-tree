import { defineStore } from 'pinia';
import { postSession, getMe, postLogout } from '../api/authApi';
import type { AuthUser } from '../types/auth';

interface AuthState {
  signedIn: boolean;
  email: string;
  name: string;
  canEdit: boolean;
  // Set when an interactive sign-in fails, so the UI can show feedback. GIS calls
  // the credential handler fire-and-forget, so the error has nowhere else to surface.
  error: string | null;
}

function emptyState(): AuthState {
  return { signedIn: false, email: '', name: '', canEdit: false, error: null };
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => emptyState(),
  actions: {
    apply(user: AuthUser): void {
      this.signedIn = true;
      this.email = user.email;
      this.name = user.name;
      this.canEdit = user.canEdit;
    },
    reset(): void {
      Object.assign(this, emptyState());
    },
    // Resolves on success or failure (never rejects): GIS invokes the caller
    // fire-and-forget, so a thrown error would become an unhandled rejection.
    // A failure is recorded in `error` for the UI instead.
    async signIn(idToken: string): Promise<void> {
      try {
        this.apply(await postSession(idToken));
        this.error = null;
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Sign-in failed.';
      }
    },
    // Called on app load to learn authoritative state from the session cookie.
    // Tolerant by design: a missing session or a backend blip must not break boot.
    async fetchMe(): Promise<void> {
      try {
        const user = await getMe();
        if (user) {
          this.apply(user);
        } else {
          this.reset();
        }
      } catch {
        this.reset();
      }
    },
    async signOut(): Promise<void> {
      try {
        await postLogout();
      } catch (e) {
        // Clear local state regardless (below), but surface the failure for
        // observability — the server session may outlive the local sign-out.
        console.warn('Sign-out request failed; clearing local session anyway.', e);
      } finally {
        this.reset();
      }
    }
  }
});
