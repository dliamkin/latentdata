# 0009 — PrimeReact 10.9.9, not 11

Status: accepted · 2026-09-29

## Context

The dashboard needs a data table with sorting, filtering, pagination and row expansion, an
inline calendar, tabs, dialogs and a handful of small controls, all keyboard-operable and
themed for light and dark. Building that by hand is weeks of work and the accessibility would be
worse than a maintained library's.

PrimeReact 11 is an unstyled rewrite under a non-OSS licence. PrimeReact 10 is MIT, styled, and
its Lara themes are close to WCAG AA out of the box.

## Decision

`primereact` pinned to exactly `10.9.9`, with `primeicons` and `primeflex`. Dependabot ignores
the package so the pin can only move by hand.

Components are imported by path (`primereact/datatable`) so the public bundle carries only what
the page uses.

Lara Light Blue and Lara Dark Blue are the two themes, swapped at runtime by replacing the
stylesheet `<link>`. Where a Lara token fails 4.5:1 for text, `theme-overrides.css` overrides
the token for that mode; components are never tinted individually. The Inter web font that the
theme declares is never used, because `--font-family` is overridden to the system stack, so the
font files are neither loaded nor precached.

## Consequences

- Stack-mode responsive tables are only reachable through the deprecated `responsiveLayout`
  prop in 10.x. That one use carries a lint suppression with the reason.
- A move to another library later means rewriting the views, not the domain: nothing in
  `packages/core` knows about PrimeReact.
- Bundle size is watched by Lighthouse CI rather than a hard byte budget; the by-path imports
  and the code-split admin panel are what keep it down.
