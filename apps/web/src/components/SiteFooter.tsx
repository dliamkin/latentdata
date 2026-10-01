import type { DocPageId } from '../routing/tabs.ts';

const LINKS: readonly { id: DocPageId; label: string }[] = [
  { id: 'architecture', label: 'How it works' },
  { id: 'privacy', label: 'Privacy' },
];

// the only way into the doc pages. Real anchors, not buttons, so they can be opened in a new tab
// and copied as links; the click handler only exists to route without a reload.
export function SiteFooter({ onNavigate }: { onNavigate: (page: DocPageId) => void }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="site-footer-copy">Copyright © 2026</p>
        <nav className="site-footer-links" aria-label="Site information">
          {LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={(event) => {
                // let a modified click do what the browser would normally do with it
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                onNavigate(link.id);
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
