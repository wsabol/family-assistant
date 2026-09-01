export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface NavItem {
  href: string;
  label: string;
}

export function layout(title: string, nav: NavItem[], body: string): string {
  const navHtml = nav
    .map((item) => `<a href="${item.href}">${escapeHtml(item.label)}</a>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · Family Assistant</title>
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; background: #f4f1ea; color: #1f2933; }
      header { background: #1f2933; color: #fff; padding: 1rem 1.5rem; }
      header nav a { color: #cbd5e1; margin-right: 1rem; text-decoration: none; }
      main { padding: 1.5rem; max-width: 1200px; margin: 0 auto; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      .card { background: #fff; border: 1px solid #d9d3c7; border-radius: 10px; padding: 1rem; margin-bottom: 1rem; }
      .muted-card { opacity: 0.7; }
      table { width: 100%; border-collapse: collapse; background: #fff; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: 0.6rem; text-align: left; vertical-align: top; }
      .badge { background: #e2e8f0; border-radius: 999px; padding: 0.1rem 0.5rem; font-size: 0.85rem; }
      .muted { color: #64748b; }
      .warn { background: #fff7ed; border-left: 4px solid #f59e0b; padding: 0.5rem 0.75rem; }
      .email-body { white-space: pre-wrap; background: #f8fafc; padding: 1rem; border-radius: 8px; max-height: 480px; overflow: auto; }
      label { display: block; margin-bottom: 0.75rem; }
      input, select, textarea, button { font: inherit; }
      input, select, textarea { width: 100%; box-sizing: border-box; padding: 0.45rem; border: 1px solid #cbd5e1; border-radius: 6px; }
      button { border: 1px solid #cbd5e1; background: #fff; padding: 0.45rem 0.8rem; border-radius: 6px; cursor: pointer; }
      button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
      button.danger { background: #fff; color: #b91c1c; border-color: #fecaca; }
      .actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
      .confidence-low { color: #b91c1c; font-weight: 600; }
      .confidence-medium { color: #b45309; font-weight: 600; }
      .confidence-high { color: #15803d; }
      .warn-badge { background: #ffedd5; color: #9a3412; }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <header>
      <strong>Family Assistant</strong>
      <nav>${navHtml}</nav>
    </header>
    <main>${body}</main>
  </body>
</html>`;
}
