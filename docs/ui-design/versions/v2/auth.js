/* Static design only. No network requests, credentials, tokens or account storage. */
(() => {
  const screen = document.querySelector('#auth-screen');
  const scenario = document.querySelector('#auth-scenario');
  const menu = document.querySelector('#account-menu');
  const trigger = document.querySelector('.account-trigger');
  let current = 'signin';
  const brand = '<a class="brand" href="#" data-auth="signin" aria-label="Bike Log sign in"><span class="brand-mark">b<span>↗</span></span>bike log<span class="brand-dot">.</span></a>';
  const field = (label, name, type, placeholder) => `<div class="auth-field"><label for="auth-${name}">${label}</label><div class="auth-input-wrap"><input id="auth-${name}" name="${name}" type="${type}" placeholder="${placeholder}" required autocomplete="off" ${type === 'password' ? 'minlength="8"' : ''}>${type === 'password' ? '<button type="button" class="password-toggle" aria-label="Show password" aria-pressed="false">Show</button>' : ''}</div></div>`;
  const email = () => field('Email address', 'email', 'email', 'alex@example.com');
  const password = () => field('Password', 'password', 'password', 'Enter a fictional password');
  const button = (label) => `<button class="auth-primary" type="submit">${label}<span aria-hidden="true">↗</span></button>`;
  const link = (view, label) => `<button class="auth-link" type="button" data-auth="${view}">${label}</button>`;
  const headings = {
    signin: ['YOUR NEXT RIDE STARTS HERE', 'Welcome back.', 'Your bikes, their history. All in one place.'],
    signup: ['MAKE ROOM FOR MORE MILES', 'A home for your bikes.', 'Create your personal account and start your garage.'],
    recovery: ['LET’S GET YOU BACK IN', 'Forgot your password?', 'Enter your email and we’ll send a reset link.'],
    sent: ['ONE SMALL STEP', 'Check your inbox.', 'If an account exists for that address, you’ll receive a password reset link.'],
    verify: ['ALMOST READY TO RIDE', 'Verify your email.', 'Open the verification link in your email to finish creating your account.'],
    expired: ['WELCOME BACK', 'Pick up where you left off.', 'Your session has expired. Sign in again to return to your garage.'],
    error: ['LET’S TRY THAT AGAIN', 'A small detour.', 'We couldn’t complete your sign-in. Please try again.'],
    signedout: ['UNTIL THE NEXT RIDE', 'You’re signed out.', 'Your bike history will be here when you get back.'],
  };
  function render(view, focus = true) {
    current = view;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    document.body.classList.toggle('auth-signed-out', view !== 'garage');
    scenario.value = [...scenario.options].some(option => option.value === view) ? view : 'signin';
    if (view === 'garage') {
      screen.replaceChildren();
      document.title = 'Bike Log — Your garage · v2 preview';
      if (focus) { const heading = document.querySelector('#page-title'); heading.tabIndex = -1; heading.focus(); }
      return;
    }
    const [eyebrow, title, subtitle] = headings[view] || headings.signin;
    let content = '';
    if (view === 'signin' || view === 'expired') {
      content = `<form id="auth-form">${email()}${password()}<div class="auth-form-links">${link('recovery', 'Forgot password?')}</div><p class="auth-error" id="auth-validation" role="alert"></p>${button('Sign in')}</form><p class="auth-switch">New to Bike Log? ${link('signup', 'Create an account')}</p>`;
    } else if (view === 'signup') {
      content = `<form id="auth-form">${field('Your name', 'name', 'text', 'Alex Rider')}${email()}${password()}<p class="auth-hint">Use at least 8 characters for this preview.</p><p class="auth-error" id="auth-validation" role="alert"></p>${button('Create account')}</form><p class="auth-switch">Already have an account? ${link('signin', 'Sign in')}</p>`;
    } else if (view === 'recovery') {
      content = `<form id="auth-form">${email()}${button('Send reset link')}</form><p class="auth-switch">${link('signin', '← Back to sign in')}</p>`;
    } else if (view === 'sent' || view === 'verify') {
      content = `<div class="auth-message"><span class="auth-message-icon" aria-hidden="true">✉</span><strong>${view === 'sent' ? 'A fresh start is on its way.' : 'Your garage is nearly ready.'}</strong><p>Check your spam folder if you don’t see the email.</p></div><p class="auth-status" role="status"></p><button class="auth-primary" type="button" data-auth="${view === 'sent' ? 'signin' : 'garage'}">${view === 'sent' ? 'Back to sign in' : 'Preview verified account'}<span aria-hidden="true">↗</span></button><p class="auth-switch">Wrong email? ${link(view === 'sent' ? 'recovery' : 'signup', 'Try another address')}</p><p class="auth-simulation">Preview only — no email was sent.</p>`;
    } else {
      content = `<div class="auth-message ${view === 'error' ? 'auth-message-error' : ''}"><span class="auth-message-icon" aria-hidden="true">${view === 'error' ? '↻' : '✓'}</span><strong>${view === 'error' ? 'Your garage is still here.' : 'See you down the road.'}</strong><p>${view === 'error' ? 'You can retry now or come back in a moment.' : 'A little care. A lot more miles.'}</p></div><button class="auth-primary" type="button" data-auth="signin">${view === 'error' ? 'Try sign-in again' : 'Sign in again'}<span aria-hidden="true">↗</span></button>`;
    }
    screen.innerHTML = `<section class="auth-story">${brand}<div class="auth-story-copy"><p class="auth-eyebrow">KEEP THE HISTORY. ENJOY THE RIDE.</p><h1>A little care.<br>A lot more miles.</h1><p>A place for every bike.<br>A story behind every kilometre.</p></div><div class="auth-bike"><span class="auth-orbit"></span><svg viewBox="0 0 600 300" role="img" aria-label="Sage green gravel bicycle"><use href="#bike-art"></use></svg><div class="auth-bike-caption"><span class="auth-caption-dot"></span>Ready for the miles ahead.</div></div><div class="auth-story-foot"><span>YOUR BIKES. YOUR HISTORY.</span><span>Made to go the distance. ↗</span></div></section><section class="auth-form-side"><div class="auth-mobile-brand">${brand}</div><div class="auth-form-card"><p class="auth-eyebrow">${eyebrow}</p><h2 tabindex="-1">${title}</h2><p class="auth-subtitle">${subtitle}</p>${content}<div class="auth-private"><svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><rect x="2" y="7" width="10" height="8" rx="2" fill="none" stroke="currentColor"/><path d="M4 7V4a3 3 0 016 0v3" fill="none" stroke="currentColor"/></svg>A personal space for your bike history.</div></div><footer class="auth-foot">Bike Log <span>Keep riding. We’ll keep the history.</span></footer></section>`;
    document.title = `Bike Log — ${title} · v2 preview`;
    if (focus) screen.querySelector('h2').focus();
  }
  document.addEventListener('click', event => {
    const navigation = event.target.closest('[data-auth]');
    if (navigation) { event.preventDefault(); render(navigation.dataset.auth); }
    const toggle = event.target.closest('.password-toggle');
    if (toggle) {
      const input = screen.querySelector('[name="password"]');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Hide' : 'Show';
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      toggle.setAttribute('aria-pressed', String(show));
    }
    if (!event.target.closest('.account-wrap')) { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
  });
  screen.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    const emailValue = form.elements.email.value;
    if (emailValue.toLowerCase() === 'error@example.com' && ['signin', 'expired'].includes(current)) {
      const error = screen.querySelector('#auth-validation');
      error.textContent = 'We couldn’t sign you in. Check your email and password and try again.';
      form.elements.email.setAttribute('aria-invalid', 'true');
      form.elements.email.setAttribute('aria-describedby', 'auth-validation');
      form.elements.email.focus();
      return;
    }
    // Deliberately discard all entered values. Only predefined fixtures reach the garage.
    const destination = current === 'signup' ? 'verify' : current === 'recovery' ? 'sent' : 'garage';
    form.reset();
    render(destination);
  });
  trigger.addEventListener('click', () => { menu.hidden = !menu.hidden; trigger.setAttribute('aria-expanded', String(!menu.hidden)); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); }
  });
  document.querySelector('#auth-signout').addEventListener('click', () => render('signedout'));
  scenario.addEventListener('change', () => render(scenario.value));
  document.querySelector('#auth-reset').addEventListener('click', () => location.reload());
  render('signin', false);
})();
