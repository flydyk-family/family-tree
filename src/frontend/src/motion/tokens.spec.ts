import { describe, it, expect } from 'vitest';
import { motionTokens, applyMotionTokensToRoot } from './tokens';

describe('motionTokens', () => {
  it('defines the shared timing language (personality A — calm)', () => {
    expect(motionTokens.fade).toEqual({ duration: 0.15, ease: 'power1.out' });
    expect(motionTokens.feedback).toEqual({ duration: 0.3, ease: 'power1.out' });
    expect(motionTokens.glide).toEqual({ duration: 0.35, ease: 'power2.inOut' });
    expect(motionTokens.cascade).toEqual({ duration: 0.4, ease: 'power1.out' });
    expect(motionTokens.morph).toEqual({ duration: 0.45, ease: 'power2.inOut' });
    expect(motionTokens.layoutSwitch).toEqual({ duration: 0.7, ease: 'power2.inOut' });
    expect(motionTokens.ceremony).toEqual({ duration: 4, ease: 'power2.inOut' });
  });

  it('mirrors every token onto the root as --motion-<name>-ms custom properties', () => {
    const root = document.createElement('div');
    applyMotionTokensToRoot(root);
    expect(root.style.getPropertyValue('--motion-fade-ms')).toBe('150ms');
    expect(root.style.getPropertyValue('--motion-feedback-ms')).toBe('300ms');
    expect(root.style.getPropertyValue('--motion-glide-ms')).toBe('350ms');
    expect(root.style.getPropertyValue('--motion-layout-switch-ms')).toBe('700ms');
    expect(root.style.getPropertyValue('--motion-cascade-ms')).toBe('400ms');
    expect(root.style.getPropertyValue('--motion-morph-ms')).toBe('450ms');
    expect(root.style.getPropertyValue('--motion-ceremony-ms')).toBe('4000ms');
  });
});
