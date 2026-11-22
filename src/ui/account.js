import { cloud } from '../cloud.js';
import { el, toast } from '../core/util.js';
import { field, openDialog } from './widgets.js';

const phaseText = {
  unconfigured: 'Cloud saving is not available yet. You can keep working in this browser and save backup files.',
  loading: 'Opening your account…',
  'signed-out': 'Sign in with the same email on each device to see your flats everywhere.',
  pending: 'Your changes are waiting to save. They will save when you finish editing and are online.',
  saving: 'Saving your flats, catalogue and floorplan pictures…',
  saved: 'Everything is saved to your account.',
  error: 'Cloud saving could not finish. Your changes stay on this device. Check your connection and try again.',
};

export function bindAccount() {
  document.querySelectorAll('[data-account]').forEach((button) => button.addEventListener('click', accountDialog));
  cloud.subscribe((state) => {
    // A scope change must finish before an edit can be written to its account.
    for (const screen of document.querySelectorAll('.screen')) screen.inert = state.phase === 'loading';
    const label = state.user ? ({ saved: 'Saved to account', saving: 'Saving…', loading: 'Opening account…' }[state.phase] || 'Cloud save pending')
      : state.phase === 'loading' ? 'Opening account…' : state.configured ? 'Sign in to save' : 'Cloud saving';
    for (const button of document.querySelectorAll('[data-account]')) { button.textContent = label; button.title = phaseText[state.phase]; }
    const status = document.getElementById('cloud-status');
    status.textContent = phaseText[state.phase];
  });
}

export function accountDialog() {
  return openDialog((form, close) => {
    const state = cloud.state;
    if (!state.configured) {
      form.append(el('h2', {}, 'Save across devices'), el('p', { class: 'lead' }, phaseText.unconfigured),
        el('div', { class: 'foot-btns' }, el('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Close')));
      return;
    }
    if (state.user) {
      const message = el('p', { class: 'lead', role: 'status' }, phaseText[state.phase]);
      const signOut = el('button', { type: 'button', class: 'btn', onclick: async () => {
        signOut.disabled = true;
        try { await cloud.signOut(); close(); toast('Signed out on this device.'); }
        catch { message.textContent = 'We couldn’t sign you out. Try again.'; signOut.disabled = false; }
      } }, 'Sign out');
      form.append(el('h2', {}, 'Your account'), el('p', { class: 'account-email' }, state.user.email), message,
        el('p', { class: 'note' }, 'Sign in with this email on your other devices. You can keep editing offline. If two devices change the same flat, both versions are kept.'),
        el('div', { class: 'foot-btns' }, signOut,
          el('button', { type: 'button', class: 'btn primary', onclick: () => { close(); cloud.syncNow(); } }, 'Save now')));
      return;
    }
    let emailValue = '', stage = 'email';
    const email = el('input', { type: 'email', autocomplete: 'email', inputmode: 'email', required: true, maxlength: 254, autofocus: true, placeholder: 'you@example.com' });
    const code = el('input', { type: 'text', autocomplete: 'one-time-code', inputmode: 'numeric', minlength: 6, maxlength: 10, pattern: '[0-9]{6,10}', required: true });
    const codeField = field('Email code', code); codeField.hidden = true;
    const message = el('p', { class: 'note', role: 'status' });
    const submit = el('button', { type: 'button', class: 'btn primary', onclick: async () => {
      if (stage === 'email' && !email.reportValidity()) return;
      if (stage === 'code' && !code.reportValidity()) return;
      submit.disabled = true; message.textContent = '';
      try {
        if (stage === 'email') {
          emailValue = email.value.trim(); await cloud.sendCode(emailValue);
          stage = 'code'; email.readOnly = true; codeField.hidden = false;
          message.textContent = 'Check your email for a code. It may take a minute to arrive. Check your junk folder too.';
          submit.textContent = 'Sign in'; change.hidden = false; code.focus();
        } else { await cloud.verifyCode(emailValue, code.value.trim()); close(); }
      } catch {
        message.textContent = stage === 'email' ? 'We couldn’t send a code. Check your email address and connection, then try again.' : 'That code didn’t work. Check it and try again, or request a new code.';
      } finally { submit.disabled = false; }
    } }, 'Send email code');
    const change = el('button', { type: 'button', class: 'btn', hidden: true, onclick: () => {
      stage = 'email'; email.readOnly = false; codeField.hidden = true; code.value = ''; message.textContent = '';
      submit.textContent = 'Send email code'; change.hidden = true; email.focus();
    } }, 'Change email or resend');
    form.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); if (!submit.disabled) submit.click(); } });
    form.append(el('h2', {}, 'Save across devices'),
      el('p', { class: 'lead' }, 'Sign in to save your flats and catalogue to your private account. Use the same email in each browser.'),
      el('p', { class: 'note' }, 'The flats already in this browser will be added to the first account you sign in to.'),
      field('Email address', email), codeField, message,
      el('div', { class: 'foot-btns' }, el('button', { type: 'button', class: 'btn', onclick: () => close() }, 'Cancel'), change, submit));
  });
}
