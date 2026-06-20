import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import App from './App.vue';
import { i18n } from './i18n';
import { useAuthStore } from './stores/authStore';

const stub = { template: '<div />' };

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'tree', component: stub }]
  });
}

beforeEach(() => { setActivePinia(createPinia()); });
afterEach(() => { vi.restoreAllMocks(); });

describe('App', () => {
  it('fetches the current session on mount', async () => {
    const store = useAuthStore();
    const spy = vi.spyOn(store, 'fetchMe').mockResolvedValue();
    const router = makeRouter();
    await router.push('/');
    await router.isReady();

    mount(App, {
      global: {
        plugins: [i18n, router],
        stubs: { AppFrame: { template: '<div><slot /></div>' }, AppBar: stub, AppVersion: stub }
      }
    });

    expect(spy).toHaveBeenCalledOnce();
  });
});
