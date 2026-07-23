document.addEventListener('DOMContentLoaded', () => {
  const dialog = document.getElementById('setup-guide-dialog');
  if (!dialog) return;

  const openBtns = document.querySelectorAll('[data-open-setup-guide]');
  const closeBtn = dialog.querySelector('.setup-guide-close');
  const tabs = dialog.querySelectorAll('.setup-guide-tab');
  const panels = dialog.querySelectorAll('.setup-guide-panel');

  let previouslyFocusedElement = null;

  openBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      previouslyFocusedElement = document.activeElement;
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
      dialog.classList.add('is-open');
      if (closeBtn) closeBtn.focus();
    });
  });

  function closeDialog() {
    dialog.classList.remove('is-open');
    dialog.classList.add('is-closing');
    setTimeout(() => {
      dialog.classList.remove('is-closing');
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
      if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
        previouslyFocusedElement.focus();
      }
    }, 200);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeDialog);
  }

  dialog.addEventListener('click', (e) => {
    const rect = dialog.getBoundingClientRect();
    const isInDialog = (rect.top <= e.clientY && e.clientY <= rect.bottom && rect.left <= e.clientX && e.clientX <= rect.right);
    if (!isInDialog) {
      closeDialog();
    }
  });

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog();
  });

  // Setup Guide Tabs logic
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('aria-controls');
      tabs.forEach(t => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
      panels.forEach(p => {
        if (p.id === targetId) {
          p.classList.add('is-active');
        } else {
          p.classList.remove('is-active');
        }
      });
    });
  });
});
