document.addEventListener('DOMContentLoaded', () => {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question');
    const panel = item.querySelector('.faq-panel');

    if (!questionBtn || !panel) return;

    questionBtn.addEventListener('click', () => {
      const isExpanded = questionBtn.getAttribute('aria-expanded') === 'true';

      // Close all other panels
      faqItems.forEach(otherItem => {
        const otherBtn = otherItem.querySelector('.faq-question');
        const otherPanel = otherItem.querySelector('.faq-panel');
        if (otherBtn && otherPanel) {
          otherBtn.setAttribute('aria-expanded', 'false');
          otherPanel.style.maxHeight = null;
          otherItem.classList.remove('active');
        }
      });

      if (!isExpanded) {
        questionBtn.setAttribute('aria-expanded', 'true');
        panel.style.maxHeight = panel.scrollHeight + 'px';
        item.classList.add('active');
      }
    });
  });
});
