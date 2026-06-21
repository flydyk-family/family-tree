// Minimal typings for the Google Identity Services client we use (ID-token flow).
// Only the surface our wrapper calls is declared.
export {};

interface GisIdConfiguration {
  client_id: string;
  callback: (response: { credential: string }) => void;
}

interface GisButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'small' | 'medium' | 'large';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  // BCP-47 tag (e.g. 'ru', 'be', 'en') — localizes the button label. We pass the
  // app's active i18n locale so the button text follows the language switcher.
  locale?: string;
}

interface GisIdClient {
  initialize(config: GisIdConfiguration): void;
  renderButton(parent: HTMLElement, options: GisButtonOptions): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GisIdClient } };
  }
}
