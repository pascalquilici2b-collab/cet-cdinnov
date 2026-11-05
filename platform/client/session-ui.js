/* Shared session lifecycle. The cookie is HttpOnly; only display metadata is read here. */
(function installSessionUI() {
  if (typeof window === 'undefined') return;
  if (window.CDISession) return;
  const storageKey = 'cet_auth_session';
  const message = 'Vous êtes resté inactif trop longtemps. Veuillez vous reconnecter';
  let active = null, locked = false, configured = false, timer = 0, revision = 0, attempt = 0;
  let callbacks = {}, dialog = null, previousFocus = null;
  function metadata(value) {
    if (!value || typeof value.email !== 'string' || !value.email || typeof value.sessionId !== 'string' || !value.sessionId || !Number.isFinite(value.expiresAt)) return null;
    return {email: value.email.trim().toLowerCase(), expiresAt: value.expiresAt, sessionId: value.sessionId};
  }
  function stored() {
    try { const value = JSON.parse(localStorage.getItem(storageKey) || 'null'); return metadata(value?.budgets); } catch { return null; }
  }
  function persist(session) {
    try { localStorage.setItem(storageKey, JSON.stringify({email: session.email, t: Math.min(Date.now(), session.expiresAt - 8 * 3600000), budgets: session})); sessionStorage.removeItem('cdi-budgets-session'); } catch {}
  }
  function event(name, detail = {}) { window.dispatchEvent(new CustomEvent(name, {detail: {...detail, source: 'cdi-session-ui'}})); }
  function forgetPrivateNavigation() {
    try { for (const key of ['cdinnov-recents','cdinnov-quick-links']) localStorage.removeItem(key); } catch {}
  }
  function check() { if (active && !locked && active.expiresAt <= Date.now()) expire({sessionId: active.sessionId, reason: 'timeout'}); }
  function schedule() { clearTimeout(timer); if (active && !locked) timer = setTimeout(check, Math.min(2147483647, Math.max(0, active.expiresAt - Date.now()))); }
  function close() {
    if (dialog) { dialog.close(); dialog.remove(); dialog = null; }
    document.body.classList.remove('cdi-session-locked');
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }
  function accept(value, options = {}) {
    const session = metadata(value);
    if (!session || session.expiresAt <= Date.now()) throw new Error('Connexion invalide. Réessayez.');
    const previous = active, wasLocked = locked;
    if (previous && previous.email !== session.email) {forgetPrivateNavigation();callbacks.onAccountChange?.(session, previous);}
    active = session; locked = false; revision++; attempt++;
    if (options.persist !== false) persist(session);
    close(); schedule();
    callbacks.onRestored?.(session, previous);
    event('cdinnov-session-restored', {...session, resumed: wasLocked});
    return session;
  }
  function show() {
    if (dialog || !document.body) return;
    if (!document.getElementById('cdi-session-style')) {
      const style = document.createElement('link'); style.id = 'cdi-session-style'; style.rel = 'stylesheet'; style.href = '/platform/session-ui.css'; document.head.append(style);
    }
    previousFocus = document.activeElement;
    dialog = document.createElement('dialog'); dialog.id = 'cdi-session-dialog'; dialog.className = 'cdi-session-dialog';
    dialog.setAttribute('aria-labelledby', 'cdi-session-title'); dialog.setAttribute('aria-describedby', 'cdi-session-description');
    dialog.innerHTML = '<div class="cdi-session-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m8 40 7-7m18-18 7-7M13 24l11 11-3 3a5 5 0 0 1-7 0l-4-4a5 5 0 0 1 0-7zm11-11 11 11 3-3a5 5 0 0 0 0-7l-4-4a5 5 0 0 0-7 0zm-6 7 4-4m6 16 4-4M9 12l3 3m21 21 3 3M8 22H4m22 22v-4"/></svg></div><h2 id="cdi-session-title">Session expirée</h2><p id="cdi-session-description"></p><button class="cdi-session-primary" type="button" data-reconnect>Se reconnecter</button><form hidden><label for="cdi-session-email">Adresse e-mail</label><input id="cdi-session-email" name="username" type="email" autocomplete="username" required><label for="cdi-session-password">Mot de passe</label><input id="cdi-session-password" name="password" type="password" autocomplete="current-password" required><p class="cdi-session-error" role="alert" hidden></p><button class="cdi-session-primary" type="submit">Se reconnecter</button></form>';
    dialog.querySelector('#cdi-session-description').textContent = message;
    const form = dialog.querySelector('form'), email = dialog.querySelector('#cdi-session-email'), password = dialog.querySelector('#cdi-session-password');
    email.value = active?.email || '';
    dialog.querySelector('[data-reconnect]').addEventListener('click', e => { e.currentTarget.hidden = true; form.hidden = false; password.focus(); });
    dialog.addEventListener('cancel', e => e.preventDefault());
    form.addEventListener('submit', async e => {
      e.preventDefault(); const currentDialog = dialog, requestAttempt = ++attempt;
      const error = form.querySelector('[role=alert]'), button = form.querySelector('button');
      error.hidden = true; button.disabled = true; button.textContent = 'Connexion…'; email.readOnly = true; password.readOnly = true;
      try {
        if (!callbacks.reconnect) throw new Error('Rechargez la page pour vous reconnecter.');
        const session = await callbacks.reconnect(email.value.trim().toLowerCase(), password.value);
        if (requestAttempt !== attempt || dialog !== currentDialog) return;
        password.value = ''; accept(session);
      } catch (failure) {
        if (requestAttempt !== attempt || dialog !== currentDialog) return;
        error.textContent = failure?.message || 'Connexion impossible. Réessayez.'; error.hidden = false; password.value = ''; password.focus();
      } finally {
        if (dialog === currentDialog) { button.disabled = false; button.textContent = 'Se reconnecter'; email.readOnly = false; password.readOnly = false; }
      }
    });
    document.body.append(dialog); document.body.classList.add('cdi-session-locked'); dialog.showModal(); dialog.querySelector('[data-reconnect]').focus();
  }
  function expire(options = {}) {
    if (!active || locked || options.sessionId && options.sessionId !== active.sessionId) return false;
    locked = true; revision++; attempt++; clearTimeout(timer);
    callbacks.onExpired?.(active);
    event('cdinnov-session-expired', {...active, reason: options.reason || 'unauthorized'});
    show(); return true;
  }
  function logout(options = {}) {
    const previous = active; active = null; locked = false; revision++; attempt++; clearTimeout(timer);
    forgetPrivateNavigation();
    if (options.persist !== false) try { localStorage.removeItem(storageKey); sessionStorage.removeItem('cdi-budgets-session'); } catch {}
    close(); callbacks.onLogout?.(previous); event('cdinnov-session-logout', previous || {});
  }
  function configure(options = {}) {
    configured = true;
    callbacks = {...callbacks, ...options};
    // Remove the former JavaScript-readable bearer session on upgrade.
    try {
      sessionStorage.removeItem('cdi-budgets-session');
      const old = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (old?.budgets?.token) { const safe = metadata(old.budgets); if (safe) persist(safe); else localStorage.removeItem(storageKey); }
    } catch {}
    if (!active) { active = stored(); if (active) { schedule(); check(); } }
    return window.CDISession;
  }
  window.CDISession = {configure, read: () => {check(); return locked ? null : active || storedValid();}, current: () => active, accept, expire, logout, generation: () => revision, isExpired: () => locked};
  function storedValid() { const value = stored(); return value && value.expiresAt > Date.now() ? value : null; }
  window.addEventListener('cdinnov-session-expired', e => { if (e.detail?.source !== 'cdi-session-ui') expire(e.detail || {}); });
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('storage', e => {
    // Embedded budget frames delegate authentication to the portal. Importing
    // the shared API must not create a second modal inside those frames.
    if (!configured) return;
    if (e.key !== storageKey && e.key !== null) return;
    const next = stored();
    if (!next) { if (active) logout({persist: false}); return; }
    if (next.sessionId === active?.sessionId) { check(); return; }
    if (next.expiresAt <= Date.now()) { if (!active) active = next; expire({sessionId: next.sessionId, reason: 'timeout'}); return; }
    accept(next, {persist: false});
  });
})();
