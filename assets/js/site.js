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
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        nav.classList.remove("open");
        menu.setAttribute("aria-expanded", "false");
        menu.focus();
      }
    });
  }

  /* Legal pages: collapsible table of contents (starts collapsed on mobile) */
  var toc = document.querySelector(".toc");
  var tocToggle = document.querySelector(".toc-toggle");
  if (toc && tocToggle) {
    if (window.matchMedia("(max-width:900px)").matches) {
      toc.classList.remove("open");
      tocToggle.setAttribute("aria-expanded", "false");
    }
    tocToggle.addEventListener("click", function () {
      var open = toc.classList.toggle("open");
      tocToggle.setAttribute("aria-expanded", String(open));
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
  if (claimBtn) claimBtn.addEventListener("click", function (e) {
    e.preventDefault();
    var href = claimBtn.getAttribute("href");
    close();
    showToast(href);
  });

  /* Claiming the offer shows a notification instead of navigating away:
     the R30 off appears later in the booking summary. */
  function showToast(bookHref) {
    var old = document.getElementById("toast");
    if (old) old.remove();
    var t = document.createElement("div");
    t.className = "toast";
    t.id = "toast";
    t.setAttribute("role", "status");
    var p = document.createElement("p");
    p.textContent = "Offer saved. Your R30 off will show in the booking summary when you book.";
    var row = document.createElement("div");
    row.className = "row";
    var a = document.createElement("a");
    a.className = "btn";
    a.href = bookHref;
    a.textContent = "Book now";
    var x = document.createElement("button");
    x.className = "tclose";
    x.setAttribute("aria-label", "Dismiss notification");
    x.textContent = "×";
    x.addEventListener("click", function () {
      t.classList.remove("show");
      window.setTimeout(function () { if (t.parentNode) t.remove(); }, 350);
    });
    row.appendChild(a);
    row.appendChild(x);
    t.appendChild(p);
    t.appendChild(row);
    document.body.appendChild(t);
    window.requestAnimationFrame(function () { t.classList.add("show"); });
    window.setTimeout(function () {
      if (t.parentNode) {
        t.classList.remove("show");
        window.setTimeout(function () { if (t.parentNode) t.remove(); }, 400);
      }
    }, 7000);
  }
  modal.addEventListener("click", function (e) { if (e.target === modal) close(); });

  if (!seen) {
    window.setTimeout(function () {
      if (!modal.classList.contains("open")) open();
    }, 2500);
  }
})();
