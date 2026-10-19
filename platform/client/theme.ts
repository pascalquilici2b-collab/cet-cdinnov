type Theme = 'light' | 'dark';
const key = 'cdinnov-color-scheme';
const preference = matchMedia('(prefers-color-scheme: dark)');
function saved(): Theme | null {
  try { const value = localStorage.getItem(key); return value === 'dark' || value === 'light' ? value : null; }
  catch { return null; }
}
function current(): Theme { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
function renderButtons() {
  const dark = current() === 'dark';
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach(button => {
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'Activer le mode clair' : 'Activer le mode nuit');
    const label = button.querySelector('[data-theme-label]');
    if (label) label.textContent = dark ? 'Mode nuit' : 'Mode clair';
  });
}
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#161617' : '#f5f5f7');
  renderButtons();
  document.dispatchEvent(new CustomEvent('cdi-theme-change', { detail: theme }));
  document.querySelectorAll('iframe').forEach(frame => {
    try { if (frame.contentWindow && new URL(frame.src, location.href).origin === location.origin) frame.contentWindow.postMessage({type:'cdi-theme',theme}, location.origin); } catch { /* An unrelated frame has no theme bridge. */ }
  });
}
function set(theme: Theme) {
  try { localStorage.setItem(key, theme); } catch { /* The switch still works when local storage is unavailable. */ }
  apply(theme);
}
apply(saved() || (preference.matches ? 'dark' : 'light'));
document.addEventListener('click', event => {
  if ((event.target as Element)?.closest('[data-theme-toggle]')) set(current() === 'dark' ? 'light' : 'dark');
});
document.addEventListener('DOMContentLoaded', renderButtons);
document.addEventListener('cdi-theme-controls-ready', renderButtons);
window.addEventListener('storage', event => { if (event.key === key || event.key === null) apply(saved() || (preference.matches ? 'dark' : 'light')); });
window.addEventListener('message', event => {
  if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'cdi-theme' && ['light','dark'].includes(event.data.theme)) apply(event.data.theme);
});
preference.addEventListener('change', () => { if (!saved()) apply(preference.matches ? 'dark' : 'light'); });
export { current, set };
