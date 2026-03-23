// TypeScript augmentation: add the `inert` HTML attribute to React's type definitions.
//
// The `inert` attribute (HTML spec) makes an element and all its descendants
// completely non-interactive: pointer events, keyboard navigation, and focus are
// all blocked, and the element is removed from the accessibility tree.
//
// This is the correct tool for "freezing" the test content while an auto-submit
// blocking overlay is visible — pointer-events:none alone does not block keyboard.
//
// Browser support: Chrome 102+, Firefox 112+, Safari 15.5+, all modern mobile.
// Fallback for older iOS: pair with style={{ pointerEvents:'none', userSelect:'none' }}.

declare module 'react' {
  interface HTMLAttributes<T> {
    /**
     * The HTML `inert` boolean attribute.
     * Pass an empty string `""` to activate: `inert=""` or `{...(active ? { inert: '' } : {})}`.
     * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inert
     */
    inert?: string
  }
}

export {}
