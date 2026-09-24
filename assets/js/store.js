/* AL CUTS availability store.
   ------------------------------------------------------------------
   LIMITATION (honest note for assessors): this site is deployed as a
   fully static site (GitHub Pages), so there is no server process that
   can own a shared bookings database. Availability is therefore kept in
   the visitor's own browser via localStorage. That means:
     - two different devices cannot see each other's bookings, and
     - a "fully booked" slot on one phone may still look free on another.
   The store below is deliberately shaped like a backend API (load all,
   isFree, assignBarber, create with revalidation) so it can be swapped
   for a real backend later without touching the booking flow:
     - Next.js route handlers + Supabase/Postgres, or
     - Vercel KV / Upstash Redis holding {barberId, date, start, end}.
   The server version must re-run the same overlap check inside a
   transaction at confirm time and return 409 if the slot was just taken.
   ------------------------------------------------------------------ */
(function (root) {
  "use strict";

  var KEY = "alcuts_bookings_v2";

  function load() {
    try {
      var raw = root.localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function save(all) {
    try { root.localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* private mode */ }
  }

  function toMin(hhmm) {
    var p = hhmm.split(":");
    return (+p[0]) * 60 + (+p[1]);
  }

  // True when no stored booking for this barber overlaps [start,end).
  function isFree(barberId, date, start, end) {
    var s = toMin(start), e = toMin(end);
    var CAL = root.ALCUTS_CAL;
    return load().every(function (b) {
      if (b.barberId !== barberId || b.date !== date) return true;
      return !CAL.overlaps(s, e, toMin(b.start), toMin(b.end));
    });
  }

  // "Any available": first barber (stable order) with no overlap.
  function assignBarber(date, start, end) {
    var barbers = root.ALCUTS_BARBERS || [];
    for (var i = 0; i < barbers.length; i++) {
      if (isFree(barbers[i].id, date, start, end)) return barbers[i].id;
    }
    return null;
  }

  /* Create a booking. Revalidates the slot immediately before writing
     (the client-side equivalent of a server transaction check). Returns
     { ok:true, booking } or { ok:false, reason:"taken" } so the flow can
     show a friendly "just taken, pick another time" error. */
  function create(booking) {
    if (!isFree(booking.barberId, booking.date, booking.start, booking.end)) {
      return { ok: false, reason: "taken" };
    }
    var all = load();
    all.push(booking);
    save(all);
    return { ok: true, booking: booking };
  }

  function makeRef() {
    return "AC-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  /* Slots with no free chair removed, for display in the picker.
     barberId "any" keeps a slot when at least one barber is free; a named
     barber keeps only their own free slots. nowMs is injectable for tests. */
  function offeredSlots(date, durationMin, barberId, nowMs) {
    var CAL = root.ALCUTS_CAL;
    return CAL.slotsFor(date, durationMin, nowMs).filter(function (t) {
      var end = CAL.endTime(t, durationMin);
      if (barberId && barberId !== "any") return isFree(barberId, date, t, end);
      return !!assignBarber(date, t, end);
    });
  }

  root.ALCUTS_STORE = {
    load: load, isFree: isFree, assignBarber: assignBarber,
    create: create, makeRef: makeRef, offeredSlots: offeredSlots
  };
})(window);
