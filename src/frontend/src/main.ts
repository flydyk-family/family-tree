import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { i18n } from './i18n';
import { useLocaleStore } from './stores/localeStore';
import 'flag-icons/css/flag-icons.min.css';
import './styles/fonts';
import './styles/global.scss';

const app = createApp(App);
app.use(createPinia()).use(i18n).use(router);
// Pinia's install sets the active pinia, so the store is usable here.
useLocaleStore().initLocale();
app.mount('#app');
