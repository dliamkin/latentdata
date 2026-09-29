// vitest-axe 0.1 augments the pre-1.0 `Vi` namespace; this is the same matcher on today's types
declare module 'vitest' {
  interface Assertion {
    toHaveNoViolations(): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}

export {};
