/* AL CUTS shared UI: mobile menu + first-visit offer modal.
   Modal: opens once per session after a short delay, closes via X /
   Escape / click-outside, traps focus while open, returns focus on close. */
(function () {
  "use strict";

  var menu = document.getElementById("menu");
  var nav = document.getElementById("nav");
  if (menu && nav) {
    menu.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target && e.target.tagName === "A") {
        nav.classList.remove("open");
        menu.setAttribute("aria-expanded", "false");
      }
    });
  }

  var modal = document.getElementById("modal");
  if (!modal) return;
  var closeBtn = document.getElementById("close");
  var claimBtn = document.getElementById("claim");
  var lastFocus = null;
  var seen = false;
  try { seen = window.sessionStorage.getItem("alcuts_offer") === "1"; } catch (e) { /* private mode */ }

  function focusables() {
    return Array.prototype.slice.call(
      modal.querySelectorAll('a[href], button:not([disabled])')
    ).filter(function (el) { return el.offsetParent !== null; });
  }

  function trap(e) {
    if (e.key !== "Tab") return;
    var f = focusables();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else trap(e);
  }

  function open() {
    lastFocus = document.activeElement;
    modal.classList.add("open");
    document.addEventListener("keydown", onKey);
    var f = focusables();
    if (f.length) f[0].focus();
  }

  function close() {
    modal.classList.remove("open");
    document.removeEventListener("keydown", onKey);
    try { window.sessionStorage.setItem("alcuts_offer", "1"); } catch (e) { /* ignore */ }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (claimBtn) claimBtn.addEventListener("click", close);
  modal.addEventListener("click", function (e) { if (e.target === modal) close(); });

  if (!seen) {
    window.setTimeout(function () {
      if (!modal.classList.contains("open")) open();
    }, 2500);
  }
})();
