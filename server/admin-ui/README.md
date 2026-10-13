# Chalkpis admin dashboard

React + Vite + Tailwind + [shadcn/ui](https://ui.shadcn.com), served by the Chalkpis server at `/admin`.

- `npm install` once, then `npm run build`: builds into `../public/admin` (committed, so the Docker image and
  Coolify need no extra build step). Rebuild and commit after every change here.
- `npm run dev`: http://localhost:5174/admin/ with the API proxied to the local server on :8787.
- The admin pages run under a strict CSP (`script-src 'self'; style-src 'self'`): no CDN, no injected `<style>` tags.
  Charts pass their colours directly (see `src/components/ui/chart.tsx`), and toasts are our own (`toast.tsx`).
