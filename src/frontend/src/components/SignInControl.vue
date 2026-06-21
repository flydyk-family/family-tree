<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/authStore';
import { usePopover } from '../composables/usePopover';
import {
  loadGisScript,
  initGis,
  renderSignInButton,
  disableAutoSelect,
  type CredentialResponse
} from '../auth/googleIdentity';

// `compact` renders the signed-out Google button as the small circular icon
// (for the mobile top bar); the desktop slot uses the full standard button.
const props = defineProps<{ compact?: boolean }>();

const { t } = useI18n({ useScope: 'global' });
const auth = useAuthStore();

// Public-by-nature client ID, injected at build time. Absent in plain local dev →
// the control renders nothing rather than erroring.
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const configured = clientId.length > 0;

const buttonEl = ref<HTMLElement | null>(null);

async function onCredential(response: CredentialResponse): Promise<void> {
  // signIn never rejects — it records failures in auth.error, shown below.
  await auth.signIn(response.credential);
}

// Render the GIS button whenever we are signed out and configured. GIS draws into
// the mount element, so (re)render after it exists and after sign-out returns us to it.
// initGis is idempotent + module-guarded, so the two SignInControl instances
// (desktop slot + mobile bar) don't fight over the global credential callback.
async function renderButton(): Promise<void> {
  if (!configured || auth.signedIn || !buttonEl.value) {
    return;
  }
  try {
    await loadGisScript();
    initGis(clientId, onCredential);
    renderSignInButton(buttonEl.value, props.compact ? 'icon' : 'standard');
  } catch (e) {
    // A failed script load shouldn't throw out of a lifecycle hook (unhandled
    // rejection). loadGisScript clears its cache on error, so a later call retries.
    console.warn('Google Identity Services failed to load.', e);
  }
}

async function signOut(): Promise<void> {
  try {
    await auth.signOut();
  } finally {
    // Always clear GIS auto-select, even if the sign-out call above fails.
    disableAutoSelect();
  }
}

// Account dropdown: a small popover with the signed-in identity + sign-out, so
// it carries dialog semantics (outside-click + Esc dismissal, focus management).
const accountEl = ref<HTMLElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);
const avatarEl = ref<HTMLElement | null>(null);
const {
  open: menuOpen,
  toggle: toggleMenu,
  closeAndRestoreFocus: closeMenu
} = usePopover({ root: accountEl, panel: menuEl, trigger: avatarEl });

// Two-letter initials for the avatar: first letters of the first two name words,
// else the first two characters of the name/email. Falls back to "?".
const initials = computed(() => {
  const source = (auth.name || auth.email || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
});

onMounted(renderButton);
watch(() => auth.signedIn, renderButton, { flush: 'post' });
</script>

<template>
  <div v-if="configured" class="signin" data-test="sign-in-control">
    <template v-if="auth.signedIn">
      <div
        ref="accountEl"
        class="signin__account"
        @keydown.esc.stop="closeMenu"
      >
        <button
          ref="avatarEl"
          type="button"
          class="signin__avatar"
          :aria-label="t('auth.signedInAs', { name: auth.name || auth.email })"
          :aria-expanded="menuOpen"
          aria-haspopup="dialog"
          :aria-controls="menuOpen ? 'account-menu' : undefined"
          data-test="account-avatar"
          @click="toggleMenu"
        >{{ initials }}</button>

        <div
          v-if="menuOpen"
          ref="menuEl"
          id="account-menu"
          class="signin__menu"
          role="dialog"
          :aria-label="t('auth.signedInAs', { name: auth.name || auth.email })"
          tabindex="-1"
          data-test="account-menu"
        >
          <span class="signin__identity" data-test="sign-in-identity">
            {{ t('auth.signedInAs', { name: auth.name || auth.email }) }}
          </span>
          <span v-if="auth.canEdit" class="signin__badge" data-test="editor-badge">{{ t('auth.editorBadge') }}</span>
          <button type="button" class="signin__out" data-test="sign-out" @click="signOut">
            {{ t('auth.signOut') }}
          </button>
        </div>
      </div>
    </template>
    <template v-else>
      <!-- GIS renders its own labelled button inside this mount; no aria-label
           here (a non-interactive div's label is ignored by assistive tech). -->
      <div ref="buttonEl" class="signin__gis" data-test="gis-button" />
      <span v-if="auth.error" class="signin__error" data-test="sign-in-error" role="alert">{{ t('auth.signInFailed') }}</span>
    </template>
  </div>
</template>

<style scoped lang="scss">
.signin {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-display);
}
.signin__account { position: relative; display: inline-flex; }
.signin__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--gilt);
  background: var(--bark);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.5px;
  cursor: pointer;
  display: grid;
  place-items: center;
  &:hover { filter: brightness(1.08); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.signin__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  min-width: 200px;
  background: var(--panel);
  border: 1px solid var(--panel-edge);
  border-radius: 10px;
  box-shadow: 0 6px 18px var(--shadow);
  // Focus is moved here programmatically on open (dialog pattern); no ring needed.
  &:focus { outline: none; }
}
.signin__identity {
  font-size: 15px;
  color: var(--ink-soft);
}
.signin__badge {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--bark);
  color: var(--on-accent);
}
.signin__out {
  font-family: var(--font-display);
  font-size: 15px;
  padding: 6px 12px;
  border: 1px solid var(--panel-edge);
  border-radius: 8px;
  background: var(--control-grad-top);
  color: var(--ink-soft);
  cursor: pointer;
  &:hover { background: var(--control-hover); }
  &:focus-visible { outline: 2px solid var(--gilt); outline-offset: 2px; }
}
.signin__gis { display: inline-flex; }
.signin__error {
  font-size: 13px;
  color: var(--danger, #b3322c);
  white-space: nowrap;
}
</style>
