/// <reference types="vite/client" />
import type React from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          class?: string;
          placeholder?: string;
          ref?: React.Ref<unknown>;
        },
        HTMLElement
      >;
    }
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          class?: string;
          placeholder?: string;
          ref?: React.Ref<unknown>;
        },
        HTMLElement
      >;
    }
  }
}
