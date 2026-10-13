// Opens Cashfree's hosted payment page for this order. Cashfree's own script (sdk.cashfree.com) loads just before
// this one; the payment session comes from our server, which created the order. Nothing else happens on this page.
(function () {
  var btn = document.getElementById('pay');
  var fail = document.getElementById('fail');
  if (!btn) return;
  function open() {
    if (typeof Cashfree !== 'function') {
      fail.hidden = false;
      return;
    }
    try {
      Cashfree({ mode: btn.getAttribute('data-mode') }).checkout({
        paymentSessionId: btn.getAttribute('data-session'),
        redirectTarget: '_self',
      });
    } catch (e) {
      fail.hidden = false;
    }
  }
  btn.addEventListener('click', open);
  open();
})();
