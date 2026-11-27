'use strict';

const feed = document.querySelector('#post-feed');
feed.scrollTop = feed.scrollHeight;

document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(element => {
  new bootstrap.Tooltip(element);
});

const form = document.querySelector('#post-form');
const content = document.querySelector('#content');
const count = document.querySelector('#content-count');
const limit = Number(content.dataset.maxLength);

content.addEventListener('input', () => {
  const length = Array.from(content.value).length;
  count.textContent = `${length} / ${limit}文字`;
  content.setCustomValidity(
    length > limit ? `${limit}文字以内で入力してください。` : ''
  );
});

content.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});
