import { escapeHtml } from '../utils/html.js';

export function renderLayout({ title, user = null, content, scripts = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | AI Integration Slice</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --card-border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #a855f7;
      --primary-hover: #9333ea;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --focus-ring: #c084fc;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background-color: var(--card-bg);
      border-bottom: 1px solid var(--card-border);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand { font-size: 1.15rem; font-weight: 700; color: #fff; text-decoration: none; }
    .nav-links { display: flex; gap: 1.5rem; align-items: center; }
    .nav-links a { color: var(--text-muted); text-decoration: none; font-size: 0.925rem; }
    .nav-links a:hover { color: var(--text); }
    main { flex: 1; max-width: 800px; width: 100%; margin: 2rem auto; padding: 0 1.5rem; }
    .card {
      background-color: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    p.subtitle { color: var(--text-muted); margin-bottom: 1.5rem; }
    .btn {
      display: inline-block;
      padding: 0.75rem 1.25rem;
      background-color: var(--primary);
      color: #fff;
      font-weight: 600;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      font-size: 0.95rem;
      transition: background 0.15s;
    }
    .btn:hover:not(:disabled) { background-color: var(--primary-hover); }
    .btn-secondary { background-color: transparent; border: 1px solid var(--card-border); color: var(--text); }
    .btn-secondary:hover { background-color: rgba(255,255,255,0.05); }
    button:focus-visible, a:focus-visible, input:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-pending { background-color: rgba(245, 158, 11, 0.2); color: var(--warning); border: 1px solid var(--warning); }
    .badge-processing { background-color: rgba(168, 85, 247, 0.2); color: var(--primary); border: 1px solid var(--primary); }
    .badge-done { background-color: rgba(16, 185, 129, 0.2); color: var(--success); border: 1px solid var(--success); }
    .badge-failed { background-color: rgba(239, 68, 68, 0.2); color: var(--danger); border: 1px solid var(--danger); }
    .chip {
      display: inline-block;
      padding: 0.35rem 0.75rem;
      background: #0f172a;
      border: 1px solid var(--card-border);
      border-radius: 6px;
      font-size: 0.85rem;
      margin: 0.25rem 0.25rem 0.25rem 0;
    }
    .alert { padding: 1rem; border-radius: 8px; margin-bottom: 1.25rem; }
    .alert-error { background: #450a0a; border: 1px solid #991b1b; color: #fca5a5; }
    .alert-success { background: #064e3b; border: 1px solid #059669; color: #6ee7b7; }
  </style>
</head>
<body>
  <header>
    <a href="/upload" class="brand">AI Job Description Slice</a>
    ${user ? `
      <nav class="nav-links">
        <a href="/upload">Upload Job Spec</a>
        <a href="/jobs">My Analyses</a>
        <span style="font-size: 0.85rem; color: var(--text-muted);">Signed in as <strong>${escapeHtml(user.name)}</strong></span>
        <form method="POST" action="/api/auth/signout" style="display:inline;">
          <button type="submit" class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">Sign out</button>
        </form>
      </nav>
    ` : `
      <nav class="nav-links">
        <a href="/signin">Sign in</a>
        <a href="/signup">Sign up</a>
      </nav>
    `}
  </header>
  <main>
    ${content}
  </main>
  ${scripts}
  </body>
</html>`;
}
