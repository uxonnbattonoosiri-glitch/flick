// 画面が出た瞬間から入力を受け付けるための小さなスクリプト（React より先に動く）。
// 送ったメモはいったん localStorage の「受け箱」に入れ、アプリが起動したら取り出してタスクにする。
(function () {
  var INBOX = 'flick:inbox';
  var form = document.getElementById('composer');
  var memo = document.getElementById('memo');
  if (!form || !memo) return;

  var composing = false;
  memo.addEventListener('compositionstart', function () { composing = true; });
  memo.addEventListener('compositionend', function () { composing = false; });

  function grow() {
    memo.style.height = 'auto';
    memo.style.height = Math.min(memo.scrollHeight, 168) + 'px';
    form.classList.toggle('has-text', memo.value.trim().length > 0);
  }

  function submit() {
    var lines = memo.value.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!lines.length) {
      form.classList.remove('nudge');
      void form.offsetWidth;
      form.classList.add('nudge');
      return;
    }
    var box = [];
    try { box = JSON.parse(localStorage.getItem(INBOX) || '[]'); } catch (e) { box = []; }
    for (var i = 0; i < lines.length; i++) box.push({ text: lines[i], at: Date.now() + i });
    try { localStorage.setItem(INBOX, JSON.stringify(box)); } catch (e) {}
    memo.value = '';
    grow();
    form.classList.remove('sent');
    void form.offsetWidth;
    form.classList.add('sent');
    window.dispatchEvent(new Event('flick:inbox'));
  }

  memo.addEventListener('input', grow);
  memo.addEventListener('keydown', function (e) {
    // 日本語の変換を確定する Enter では送らない
    if (e.key !== 'Enter' || e.shiftKey || composing || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    submit();
    memo.focus({ preventScroll: true });
  });

  // どこからでも「/」で入力欄へ
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      memo.focus();
    }
  });

  grow();
  try { memo.focus({ preventScroll: true }); } catch (e) {}
})();
