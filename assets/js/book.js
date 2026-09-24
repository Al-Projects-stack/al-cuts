/* AL CUTS booking flow. Reads ?service=&barber=&offer=, reuses
   window.ALCUTS_SERVICES as the single source of truth. No backend:
   bookings are validated client-side and confirmed with a reference. */
(function () {
  "use strict";

  var form = document.getElementById("bookform");
  if (!form || !window.ALCUTS_SERVICES) return;

  var svcSel = document.getElementById("f-service");
  var barSel = document.getElementById("f-barber");
  var dateEl = document.getElementById("f-date");
  var timeEl = document.getElementById("f-time");
  var nameEl = document.getElementById("f-name");
  var phoneEl = document.getElementById("f-phone");
  var notesEl = document.getElementById("f-notes");
  var sumBox = document.getElementById("summary");
  var offerBox = document.getElementById("offer-note");
  var doneBox = document.getElementById("bookdone");

  var OFFER = window.ALCUTS_OFFER || { code: "first30", amount: 30 };
  var params = new URLSearchParams(window.location.search || "");
  var offerOn = params.get("offer") === OFFER.code;

  // Populate selects from single source of truth
  window.ALCUTS_SERVICES.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s.id;
    o.textContent = s.name + " — R" + s.price + " · " + s.mins + " min";
    svcSel.appendChild(o);
  });
  (window.ALCUTS_BARBERS || []).forEach(function (b) {
    var o = document.createElement("option");
    o.value = b.id;
    o.textContent = b.name + " — " + b.role;
    barSel.appendChild(o);
  });

  var preSvc = params.get("service");
  var preBar = params.get("barber");
  if (preSvc && window.ALCUTS_SERVICES.some(function (s) { return s.id === preSvc; })) svcSel.value = preSvc;
  if (preBar && (window.ALCUTS_BARBERS || []).some(function (b) { return b.id === preBar; })) barSel.value = preBar;
  if (offerOn && offerBox) offerBox.hidden = false;

  // Date limits: today .. +60 days
  var today = new Date();
  function iso(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  dateEl.min = iso(today);
  var max = new Date(today); max.setDate(max.getDate() + 60);
  dateEl.max = iso(max);

  // Opening hours: Tue–Fri 9:00–18:00, Sat 8:00–16:00, Sun+Mon closed
  function slotsFor(dateStr) {
    if (!dateStr) return [];
    var d = new Date(dateStr + "T12:00:00");
    var dow = d.getDay(); // 0 Sun, 1 Mon, 6 Sat
    if (dow === 0 || dow === 1) return [];
    var open = dow === 6 ? 8 : 9;
    var close = dow === 6 ? 16 : 18;
    var out = [];
    for (var h = open; h < close; h++) {
      out.push(String(h).padStart(2, "0") + ":00");
      out.push(String(h).padStart(2, "0") + ":30");
    }
    return out;
  }

  function refreshTimes() {
    var slots = slotsFor(dateEl.value);
    timeEl.innerHTML = "";
    if (!dateEl.value) {
      timeEl.appendChild(new Option("Pick a date first", ""));
      timeEl.disabled = true;
      return;
    }
    if (!slots.length) {
      timeEl.appendChild(new Option("Closed Sun & Mon — pick another day", ""));
      timeEl.disabled = true;
      return;
    }
    timeEl.disabled = false;
    timeEl.appendChild(new Option("Select a time", ""));
    slots.forEach(function (t) { timeEl.appendChild(new Option(t, t)); });
  }

  function svc() {
    return window.ALCUTS_SERVICES.find(function (s) { return s.id === svcSel.value; }) || null;
  }
  function barName() {
    var b = (window.ALCUTS_BARBERS || []).find(function (x) { return x.id === barSel.value; });
    return b ? b.name : "First available";
  }
  function rand(n) { return "R" + n; }

  function renderSummary() {
    var s = svc();
    var price = s ? s.price : 0;
    var disc = offerOn && s ? Math.min(OFFER.amount, price) : 0;
    var total = price - disc;
    sumBox.innerHTML =
      "<h3>Booking summary</h3>" +
      "<div class='row'><span>Service</span><span>" + (s ? s.name : "—") + "</span></div>" +
      "<div class='row'><span>Duration</span><span>" + (s ? s.mins + " min" : "—") + "</span></div>" +
      "<div class='row'><span>Barber</span><span>" + barName() + "</span></div>" +
      "<div class='row'><span>Date</span><span>" + (dateEl.value || "—") + "</span></div>" +
      "<div class='row'><span>Time</span><span>" + (timeEl.value || "—") + "</span></div>" +
      (disc ? "<div class='row off'><span>First-visit offer</span><span>−" + rand(disc) + "</span></div>" : "") +
      "<div class='row total'><span>Total at chair</span><span>" + rand(total) + "</span></div>";
  }

  function setErr(id, msg) {
    var el = document.getElementById(id);
    if (el) el.textContent = msg || "";
  }

  dateEl.addEventListener("change", function () { refreshTimes(); renderSummary(); });
  [svcSel, barSel, timeEl].forEach(function (el) {
    el.addEventListener("change", renderSummary);
  });

  refreshTimes();
  renderSummary();

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var ok = true;
    setErr("e-service", ""); setErr("e-date", ""); setErr("e-time", "");
    setErr("e-name", ""); setErr("e-phone", "");

    var s = svc();
    if (!s) { setErr("e-service", "Choose a service."); ok = false; }
    if (!dateEl.value) { setErr("e-date", "Pick a date."); ok = false; }
    if (timeEl.disabled || !timeEl.value) { setErr("e-time", "Pick an open day and time (Tue–Sat)."); ok = false; }
    if (!nameEl.value.trim()) { setErr("e-name", "Tell us your name."); ok = false; }
    var digits = phoneEl.value.replace(/\D/g, "");
    if (digits.length < 9) { setErr("e-phone", "Enter a valid phone number."); ok = false; }

    if (!ok) {
      var first = form.querySelector(".err:not(:empty)");
      if (first) first.scrollIntoView({ block: "center" });
      return;
    }

    var ref = "ALC-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    var disc = offerOn ? Math.min(OFFER.amount, s.price) : 0;
    try {
      var all = JSON.parse(window.localStorage.getItem("alcuts_bookings") || "[]");
      all.push({ ref: ref, service: s.id, barber: barSel.value || "any", date: dateEl.value, time: timeEl.value, name: nameEl.value.trim(), phone: phoneEl.value.trim(), notes: notesEl.value.trim(), total: s.price - disc, at: new Date().toISOString() });
      window.localStorage.setItem("alcuts_bookings", JSON.stringify(all));
    } catch (err) { /* storage unavailable — still confirm */ }

    form.hidden = true;
    doneBox.hidden = false;
    doneBox.innerHTML =
      "<div class='success'><p class='kicker'>Booking received</p>" +
      "<h2>See you soon, " + escapeHtml(nameEl.value.trim().split(" ")[0]) + ".</h2>" +
      "<p class='sub' style='color:var(--muted)'>" + escapeHtml(s.name) + " with " + escapeHtml(barName()) +
      " · " + escapeHtml(dateEl.value) + " at " + escapeHtml(timeEl.value) +
      " · Pay " + rand(s.price - disc) + " at the chair.</p>" +
      "<span class='ref'>" + ref + "</span>" +
      "<p style='color:var(--muted)'>We will call " + escapeHtml(phoneEl.value.trim()) + " to confirm. " +
      "Free rebooking within 24 hours.</p>" +
      "<p><a class='btn line' href='./'>Back to home</a></p></div>";
    doneBox.scrollIntoView({ block: "start" });
  });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
