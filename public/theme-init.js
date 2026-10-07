(() => {
  let preference = 'system';
  try { const saved = localStorage.getItem('repo-arcade-theme'); if (['light', 'dark', 'system'].includes(saved)) preference = saved; } catch { /* Storage is optional. */ }
  document.documentElement.dataset.theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
})();
