/* AL CUTS booking flow: 5-step stepper (service, barber, date/time,
   details, review) + confirmation with calendar actions.
   Query params preselect: ?service=<id>&barber=<id>&offer=first30.
   Steps live in the URL hash (#step-N) so the browser back button and
   refresh mid-flow work; field progress is kept in sessionStorage. */
(function () {
  "use strict";

  var flow = document.getElementById("flow");
  if (!flow || !window.ALCUTS_SERVICES || !window.ALCUTS_CAL || !window.ALCUTS_STORE) return;

  var CAL = window.ALCUTS_CAL;
  var STORE = window.ALCUTS_STORE;
  var OFFER = window.ALCUTS_OFFER || { code: "first30", amount: 30 };

  var params = new URLSearchParams(window.location.search || "");
  var offerOn = params.get("offer") === OFFER.code;

  var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MO = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  var MO_S = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var state = { service: null, barber: "any", date: null, time: null,
    name: "", email: "", phone: "", notes: "", calYm: null };

  // Restore mid-flow progress (refresh), then let URL params win.
  try {
    var saved = JSON.parse(window.sessionStorage.getItem("alcuts_flow") || "null");
    if (saved && typeof saved === "object") {
      Object.keys(state).forEach(function (k) { if (saved[k] != null) state[k] = saved[k]; });
    }
  } catch (e) { /* ignore */ }
  var qSvc = params.get("service"), qBar = params.get("barber");
  if (qSvc && window.ALCUTS_SERVICES.some(function (s) { return s.id === qSvc; })) state.service = qSvc;
  if (qBar === "any" || (window.ALCUTS_BARBERS || []).some(function (b) { return b.id === qBar; })) state.barber = qBar;

  var offerNote = document.getElementById("offer-note");
  if (offerOn && offerNote) offerNote.hidden = false;

  function persist() {
    try { window.sessionStorage.setItem("alcuts_flow", JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function svc() {
    return window.ALCUTS_SERVICES.find(function (s) { return s.id === state.service; }) || null;
  }
  function barName(id) {
    if (!id || id === "any") return "Any available";
    var b = (window.ALCUTS_BARBERS || []).find(function (x) { return x.id === id; });
    return b ? b.name : "Any available";
  }
  function dateLabel(ds) {
    var p = ds.split("-");
    return WD[CAL.dowOf(ds)] + " " + (+p[2]) + " " + MO_S[+p[1] - 1] + " " + p[0];
  }
  function setErr(id, msg) {
    var el = document.getElementById(id);
    if (el) el.textContent = msg || "";
  }

  /* ---------- step navigation ---------- */
  var stepper = document.getElementById("stepper");

  function currentStep() {
    var m = /step-([1-5])/.exec(window.location.hash || "");
    return m ? +m[1] : 1;
  }

  function showStep(n) {
    for (var i = 1; i <= 5; i++) {
      document.getElementById("step-" + i).hidden = (i !== n);
    }
    Array.prototype.forEach.call(stepper.children, function (li) {
      var s = +li.getAttribute("data-s");
      li.classList.toggle("done", s < n);
      if (s === n) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
    if (n === 3) renderCal();
    if (n === 5) renderReview();
    var h = document.getElementById("h-" + n);
    if (h) h.focus({ preventScroll: true });
    flow.scrollIntoView({ block: "start" });
  }

  window.addEventListener("hashchange", function () { showStep(currentStep()); });

  function go(n) {
    if (("#step-" + n) === window.location.hash) showStep(n);
    else window.location.hash = "step-" + n;
  }

  /* ---------- step 1: services ---------- */
  var svcOpts = document.getElementById("svc-opts");
  window.ALCUTS_SERVICES.forEach(function (s) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "opt";
    b.dataset.id = s.id;
    b.setAttribute("aria-pressed", state.service === s.id ? "true" : "false");
    b.innerHTML = "<strong></strong><span class='od'></span><span class='om'></span>";
    b.querySelector("strong").textContent = s.name;
    b.querySelector(".od").textContent = s.desc;
    b.querySelector(".om").textContent = s.mins + " min · R" + s.price;
    b.addEventListener("click", function () {
      state.service = s.id;
      state.time = null; // duration may change slot validity
      persist(); paintOpts(); setErr("e-1", "");
    });
    svcOpts.appendChild(b);
  });

  /* ---------- step 2: barbers ---------- */
  var barOpts = document.getElementById("bar-opts");
  [{ id: "any", name: "Any available", role: "First free chair", bio: "We assign the first free barber at confirmation." }]
    .concat(window.ALCUTS_BARBERS || []).forEach(function (b) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "opt";
      el.dataset.id = b.id;
      el.setAttribute("aria-pressed", state.barber === b.id ? "true" : "false");
      el.innerHTML = "<strong></strong><span class='od'></span><span class='om'></span>";
      el.querySelector("strong").textContent = b.name;
      el.querySelector(".od").textContent = b.bio || b.role;
      el.querySelector(".om").textContent = b.role;
      el.addEventListener("click", function () {
        state.barber = b.id;
        persist(); paintOpts(); setErr("e-2", "");
      });
      barOpts.appendChild(el);
    });

  function paintOpts() {
    Array.prototype.forEach.call(svcOpts.children, function (b) {
      var on = b.dataset.id === state.service;
      b.classList.toggle("sel", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    Array.prototype.forEach.call(barOpts.children, function (b) {
      var on = b.dataset.id === state.barber;
      b.classList.toggle("sel", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  /* ---------- step 3: calendar + slots ---------- */
  var calBox = document.getElementById("cal");
  var slotBox = document.getElementById("slots");

  function currentYm() {
    var s = CAL.sastParts(Date.now());
    return s.y + "-" + String(s.m).padStart(2, "0");
  }

  function shiftYm(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) + n;
    while (m < 1) { m += 12; y--; }
    while (m > 12) { m -= 12; y++; }
    return y + "-" + String(m).padStart(2, "0");
  }

  function scrollSlots() {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("slots").scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }

  /* One month at a time with prev/next paging (no long scroll). */
  function renderCal() {
    var open = {};
    CAL.bookableDates().forEach(function (d) { open[d] = true; });
    // Drop a restored date that has since passed.
    if (state.date && !open[state.date]) { state.date = null; state.time = null; }
    var keys = Object.keys(open);
    var cur = currentYm();
    var max = keys[keys.length - 1].slice(0, 7);
    var ym = state.calYm;
    if (!ym || ym < cur || ym > max) {
      ym = state.date ? state.date.slice(0, 7) : cur;
      if (ym < cur) ym = cur;
      if (ym > max) ym = max;
      state.calYm = ym;
    }
    persist();
    calBox.innerHTML = "";
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7);

    var pager = document.createElement("div");
    pager.className = "pager";
    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "pagenav";
    prev.textContent = "‹";
    prev.setAttribute("aria-label", "Previous month");
    prev.disabled = (ym <= cur);
    var ptitle = document.createElement("p");
    ptitle.className = "mtitle";
    ptitle.setAttribute("aria-live", "polite");
    ptitle.textContent = MO[m - 1] + " " + y;
    var next = document.createElement("button");
    next.type = "button";
    next.className = "pagenav";
    next.textContent = "›";
    next.setAttribute("aria-label", "Next month");
    next.disabled = (ym >= max);
    prev.addEventListener("click", function () { state.calYm = shiftYm(ym, -1); persist(); renderCal(); });
    next.addEventListener("click", function () { state.calYm = shiftYm(ym, 1); persist(); renderCal(); });
    pager.appendChild(prev);
    pager.appendChild(ptitle);
    pager.appendChild(next);
    calBox.appendChild(pager);

    var wrap = document.createElement("div");
    wrap.className = "month";
    var grid = document.createElement("div");
    grid.className = "days";
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", MO[m - 1] + " " + y + " bookable days");
    ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].forEach(function (d) {
      var s = document.createElement("span");
      s.className = "dow"; s.textContent = d; s.setAttribute("aria-hidden", "true");
      grid.appendChild(s);
    });
    var first = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday-first
    for (var i = 0; i < first; i++) {
      var padEl = document.createElement("span");
      padEl.className = "pad"; padEl.setAttribute("aria-hidden", "true");
      grid.appendChild(padEl);
    }
    var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (var d = 1; d <= dim; d++) {
      var ds = y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "day";
      btn.textContent = d;
      if (open[ds]) {
        btn.setAttribute("data-date", ds);
        btn.setAttribute("aria-label", dateLabel(ds));
        if (ds === state.date) { btn.classList.add("sel"); btn.setAttribute("aria-pressed", "true"); }
        else btn.setAttribute("aria-pressed", "false");
        (function (date) {
          btn.addEventListener("click", function () {
            state.date = date; state.time = null;
            persist(); paintDaySel(); renderSlots(); setErr("e-3", "");
            scrollSlots();
          });
        })(ds);
      } else {
        btn.disabled = true;
        btn.setAttribute("aria-label", d + " " + MO[m - 1] + ": closed or unavailable");
      }
      grid.appendChild(btn);
    }
    wrap.appendChild(grid);
    calBox.appendChild(wrap);
    renderSlots();
  }

  /* Selection paints in place (no rebuild) so focus is never dropped. */
  function paintDaySel() {
    Array.prototype.forEach.call(calBox.querySelectorAll(".day:not(:disabled)"), function (btn) {
      var on = btn.getAttribute("data-date") === state.date;
      btn.classList.toggle("sel", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function renderSlots() {
    var s = svc();
    var slots = (state.date && s) ? CAL.slotsFor(state.date, s.mins) : [];
    var inner = document.createElement("div");
    inner.className = "slot-in";
    if (!state.date) {
      inner.innerHTML = "<p class='hint'>Select a date above to see times.</p>";
    } else if (!s) {
      inner.innerHTML = "<p class='hint'>Pick a service in step 1 first — times depend on duration.</p>";
    } else if (!slots.length) {
      inner.innerHTML = "<p class='hint'>No times left on " + dateLabel(state.date) + " for a " +
        s.mins + "-minute service. Try another day.</p>";
    } else {
      slots.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "slot" + (t === state.time ? " sel" : "");
        b.textContent = t;
        b.setAttribute("aria-pressed", t === state.time ? "true" : "false");
        b.setAttribute("aria-label", t + " Johannesburg time");
        b.addEventListener("click", function () {
          state.time = t;
          persist(); paintSlotSel(); setErr("e-3", "");
        });
        inner.appendChild(b);
      });
    }
    slotBox.innerHTML = "";
    slotBox.appendChild(inner);
    // Force a reflow between the content swap and .open so the slide-down animates
    void slotBox.offsetHeight;
    slotBox.classList.toggle("open", !!state.date);
  }

  function paintSlotSel() {
    Array.prototype.forEach.call(slotBox.querySelectorAll(".slot"), function (b) {
      var on = b.textContent === state.time;
      b.classList.toggle("sel", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  /* ---------- step 4: details ---------- */
  var form = document.getElementById("details");
  ["f-name", "f-email", "f-phone", "f-notes"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", function (e) {
      state[{ "f-name": "name", "f-email": "email", "f-phone": "phone", "f-notes": "notes" }[id]] = e.target.value;
      persist();
    });
  });
  // Restore field values into inputs.
  document.getElementById("f-name").value = state.name;
  document.getElementById("f-email").value = state.email;
  document.getElementById("f-phone").value = state.phone;
  document.getElementById("f-notes").value = state.notes;

  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); }
  function validPhone(v) {
    var d = v.replace(/[\s\-()]/g, "");
    return /^(\+27|0)\d{9}$/.test(d);
  }

  function validateDetails() {
    var ok = true;
    setErr("e-name", ""); setErr("e-email", ""); setErr("e-phone", ""); setErr("e-terms", "");
    var name = document.getElementById("f-name").value.trim();
    var email = document.getElementById("f-email").value;
    var phone = document.getElementById("f-phone").value;
    state.name = name; state.email = email; state.phone = phone;
    state.notes = document.getElementById("f-notes").value;
    persist();
    if (name.length < 2) { setErr("e-name", "Please enter your full name."); ok = false; }
    if (!validEmail(email)) { setErr("e-email", "Enter a valid email address."); ok = false; }
    if (!validPhone(phone)) { setErr("e-phone", "Enter a valid SA number, e.g. 082 555 0142 or +27 82 555 0142."); ok = false; }
    if (!document.getElementById("f-terms").checked) { setErr("e-terms", "Please accept the Terms and Conditions to continue."); ok = false; }
    return ok;
  }

  /* ---------- step 5: review + confirm ---------- */
  function totals() {
    var s = svc();
    var price = s ? s.price : 0;
    var disc = offerOn && s ? Math.min(OFFER.amount, price) : 0;
    return { price: price, disc: disc, total: price - disc };
  }

  function renderReview() {
    var s = svc(), t = totals();
    var box = document.getElementById("review");
    if (!s || !state.date || !state.time) {
      box.innerHTML = "<p class='hint'>Something is missing — please go back and complete each step.</p>";
      return;
    }
    var end = CAL.endTime(state.time, s.mins);
    box.innerHTML =
      "<h3>Booking summary</h3>" +
      "<div class='row'><span>Service</span><span>" + esc(s.name) + "</span></div>" +
      "<div class='row'><span>Barber</span><span>" + esc(barName(state.barber)) + "</span></div>" +
      "<div class='row'><span>Date</span><span>" + esc(dateLabel(state.date)) + "</span></div>" +
      "<div class='row'><span>Time</span><span>" + esc(state.time) + " – " + esc(end) + " SAST</span></div>" +
      "<div class='row'><span>Price</span><span>R" + t.price + "</span></div>" +
      (t.disc ? "<div class='row off'><span>First-visit offer</span><span>−R" + t.disc + "</span></div>" : "") +
      "<div class='row total'><span>Total at chair</span><span>R" + t.total + "</span></div>" +
      "<div class='row'><span>Name</span><span>" + esc(state.name) + "</span></div>" +
      "<div class='row'><span>Contact</span><span>" + esc(state.email) + " · " + esc(state.phone) + "</span></div>";
  }

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var confirmBtn = document.getElementById("confirm");
  confirmBtn.addEventListener("click", function () {
    if (confirmBtn.disabled) return; // no double submission
    setErr("e-5", "");
    var s = svc();
    if (!s || !state.date || !state.time) {
      setErr("e-5", "Please complete steps 1–3 first.");
      return;
    }
    // Fresh availability check at confirm time (slot may have filled).
    var fresh = CAL.slotsFor(state.date, s.mins);
    if (fresh.indexOf(state.time) === -1) {
      setErr("e-5", "That time is no longer available. Please pick another time.");
      go(3);
      return;
    }
    var end = CAL.endTime(state.time, s.mins);
    var barberId = state.barber === "any"
      ? STORE.assignBarber(state.date, state.time, end)
      : state.barber;
    if (!barberId) {
      setErr("e-5", "All barbers are booked at that time. Please pick another time.");
      go(3);
      return;
    }
    if (!STORE.isFree(barberId, state.date, state.time, end)) {
      setErr("e-5", "That slot was just taken for " + barName(barberId) + ". Please pick another time.");
      go(3);
      return;
    }
    confirmBtn.disabled = true;
    var t = totals();
    var res = STORE.create({
      ref: STORE.makeRef(), serviceId: s.id, service: s.name,
      barberId: barberId, barber: barName(barberId),
      date: state.date, start: state.time, end: end,
      name: state.name.trim(), email: state.email.trim(), phone: state.phone.trim(),
      notes: state.notes.trim(), price: t.price, discount: t.disc, total: t.total,
      at: new Date().toISOString()
    });
    if (!res.ok) {
      confirmBtn.disabled = false;
      setErr("e-5", "That slot was just taken. Please pick another time.");
      go(3);
      return;
    }
    try { window.sessionStorage.removeItem("alcuts_flow"); } catch (e) { /* ignore */ }
    showConfirmation(res.booking);
  });

  /* ---------- confirmation + calendar actions ---------- */
  function downloadICS(booking) {
    var ics = CAL.buildICS({
      ref: booking.ref, date: booking.date, start: booking.start, end: booking.end,
      service: booking.service, barber: booking.barber, total: booking.total, phone: booking.phone
    });
    var blob = new Blob([ics], { type: "text/calendar" }); // iOS/macOS open .ics directly
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "al-cuts-booking-" + booking.ref + ".ics";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function showConfirmation(b) {
    flow.hidden = true;
    var done = document.getElementById("bookdone");
    done.hidden = false;
    var calArgs = {
      date: b.date, start: b.start, end: b.end, service: b.service,
      barber: b.barber, total: b.total, ref: b.ref, phone: b.phone
    };
    // Mobile Android: deep-link into the Calendar app (web fallback included).
    // iOS keeps https, which the app opens itself when installed.
    var isAndroid = /Android/i.test(window.navigator.userAgent || "");
    var gUrl = isAndroid ? CAL.googleCalendarIntentUrl(calArgs) : CAL.googleCalendarUrl(calArgs);
    done.innerHTML =
      "<div class='success'><p class='kicker'>Booking confirmed</p>" +
      "<h2>See you soon, " + esc(b.name.split(" ")[0]) + ".</h2>" +
      "<span class='ref'>" + esc(b.ref) + "</span>" +
      "<div class='summary' style='text-align:left'>" +
      "<div class='row'><span>Service</span><span>" + esc(b.service) + "</span></div>" +
      "<div class='row'><span>Barber</span><span>" + esc(b.barber) + "</span></div>" +
      "<div class='row'><span>Date</span><span>" + esc(dateLabel(b.date)) + "</span></div>" +
      "<div class='row'><span>Time</span><span>" + esc(b.start) + " – " + esc(b.end) + " SAST</span></div>" +
      "<div class='row total'><span>Pay at chair</span><span>R" + b.total + "</span></div></div>" +
      "<p style='color:var(--muted)'>We will contact " + esc(b.phone) + " if anything changes. " +
      "Free rebooking up to 24 hours before. Arrive 5 minutes early.</p>" +
      "<div class='cta' style='justify-content:center'>" +
      "<a class='btn' id='gcal' href='" + gUrl.replace(/'/g, "%27") + "'" + (isAndroid ? "" : " target='_blank'") + " rel='noopener'>Add to Google Calendar</a>" +
      "<button class='btn line' id='applecal' type='button'>Add to Apple Calendar</button></div>" +
      "<p><a class='more' href='./'>Book another →</a></p></div>";
    document.getElementById("applecal").addEventListener("click", function () { downloadICS(b); });
    done.scrollIntoView({ block: "start" });
  }

  /* ---------- nav buttons ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-next]"), function (btn) {
    btn.addEventListener("click", function () {
      var next = +btn.getAttribute("data-next");
      if (next === 2 && !state.service) { setErr("e-1", "Choose a service to continue."); return; }
      if (next === 3 && !state.barber) { setErr("e-2", "Choose a barber to continue."); return; }
      if (next === 4 && (!state.date || !state.time)) { setErr("e-3", "Pick a date and time to continue."); return; }
      if (next === 5 && !validateDetails()) {
        var first = document.querySelector("#step-4 .err:not(:empty)");
        if (first) first.scrollIntoView({ block: "center" });
        return;
      }
      go(next);
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-back]"), function (btn) {
    btn.addEventListener("click", function () { go(+btn.getAttribute("data-back")); });
  });

  paintOpts();
  showStep(currentStep());
})();
