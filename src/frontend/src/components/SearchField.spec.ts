import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SearchField from './SearchField.vue';
import { i18n } from '../i18n';
import { useUiStore } from '../stores/uiStore';

beforeEach(() => { setActivePinia(createPinia()); });

describe('SearchField', () => {
  it('writes the query into the store', async () => {
    const wrapper = mount(SearchField, { global: { plugins: [i18n] } });
    const ui = useUiStore();
    await wrapper.get('[data-test="search-input"]').setValue('Anna');
    expect(ui.search).toBe('Anna');
  });
});
