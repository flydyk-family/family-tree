import { defineStore } from 'pinia';
import { postSession, getMe, postLogout } from '../api/authApi';
import type { AuthUser } from '../types/auth';

interface AuthState {
  signedIn: boolean;
  email: string;
  name: string;
  canEdit: boolean;
}

function emptyState(): AuthState {
  return { signedIn: false, email: '', name: '', canEdit: false };
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
    async signIn(idToken: string): Promise<void> {
      this.apply(await postSession(idToken));
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
      } finally {
        this.reset();
      }
    }
  }
});
