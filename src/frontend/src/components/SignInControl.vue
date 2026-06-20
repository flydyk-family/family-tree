<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/authStore';
import {
  loadGisScript,
  initGis,
  renderSignInButton,
  disableAutoSelect,
  type CredentialResponse
} from '../auth/googleIdentity';

const { t } = useI18n({ useScope: 'global' });
const auth = useAuthStore();

// Public-by-nature client ID, injected at build time. Absent in plain local dev →
// the control renders nothing rather than erroring.
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const configured = clientId.length > 0;

const buttonEl = ref<HTMLElement | null>(null);
// GIS initialize() registers the credential callback. It is idempotent, but we
// guard so a re-render (e.g. after sign-out) doesn't re-register it.
let gisInitialized = false;

async function onCredential(response: CredentialResponse): Promise<void> {
  // signIn never rejects — it records failures in auth.error, shown below.
  await auth.signIn(response.credential);
}

// Render the GIS button whenever we are signed out and configured. GIS draws into
// the mount element, so (re)render after it exists and after sign-out returns us to it.
async function renderButton(): Promise<void> {
  if (!configured || auth.signedIn || !buttonEl.value) {
    return;
  }
  try {
    await loadGisScript();
    if (!gisInitialized) {
      initGis(clientId, onCredential);
      gisInitialized = true;
    }
    renderSignInButton(buttonEl.value);
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

onMounted(renderButton);
watch(() => auth.signedIn, renderButton, { flush: 'post' });
</script>

<template>
  <div v-if="configured" class="signin" data-test="sign-in-control">
    <template v-if="auth.signedIn">
      <span class="signin__identity" data-test="sign-in-identity">
        {{ t('auth.signedInAs', { name: auth.name || auth.email }) }}
      </span>
      <span v-if="auth.canEdit" class="signin__badge" data-test="editor-badge">{{ t('auth.editorBadge') }}</span>
      <button type="button" class="signin__out" data-test="sign-out" @click="signOut">
        {{ t('auth.signOut') }}
      </button>
    </template>
    <template v-else>
      <div ref="buttonEl" class="signin__gis" data-test="gis-button" :aria-label="t('auth.signIn')" />
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
.signin__identity {
  font-size: 15px;
  color: var(--ink-soft);
  white-space: nowrap;
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
