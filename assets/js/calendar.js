/* AL CUTS booking engine: SAST-safe slot generation + calendar export.
   All times are Africa/Johannesburg (UTC+2, no daylight saving), regardless
   of the visitor's device timezone. SAST wall-clock math uses a fixed
   +02:00 offset so results are identical on any device. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ALCUTS_CAL = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SAST_OFFSET_MIN = 120; // Africa/Johannesburg is UTC+2 year-round
  var LEAD_MIN = 60; // hide slots starting sooner than this from "now"
  var WINDOW_DAYS = 60;

  // Opening hours by SAST weekday (0=Sun..6=Sat): [openMin, closeMin] or null
  function hoursForWeekday(dow) {
    if (dow === 0 || dow === 1) return null; // Sun + Mon closed
    if (dow === 6) return [8 * 60, 16 * 60]; // Sat 8:00–16:00
    return [9 * 60, 18 * 60]; // Tue–Fri 9:00–18:00
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  // SAST wall-clock parts for any instant (ms epoch).
  function sastParts(ms) {
    var d = new Date(ms + SAST_OFFSET_MIN * 60000);
    return {
      y: d.getUTCFullYear(),
      m: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      dow: d.getUTCDay(),
      mins: d.getUTCHours() * 60 + d.getUTCMinutes()
    };
  }

  function dateStrOf(y, m, day) { return y + "-" + pad(m) + "-" + pad(day); }

  function parseDateStr(ds) {
    var p = ds.split("-");
    return { y: +p[0], m: +p[1], day: +p[2] };
  }

  // Epoch ms of a SAST wall-clock moment.
  function sastToMs(ds, hhmm) {
    var p = parseDateStr(ds);
    var t = hhmm.split(":");
    return Date.UTC(p.y, p.m - 1, p.day, +t[0], +t[1]) - SAST_OFFSET_MIN * 60000;
  }

  function dowOf(ds) {
    var p = parseDateStr(ds);
    return new Date(Date.UTC(p.y, p.m - 1, p.day)).getUTCDay();
  }

  function addDays(ds, n) {
    var p = parseDateStr(ds);
    var d = new Date(Date.UTC(p.y, p.m - 1, p.day + n));
    return dateStrOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  function minToHHMM(mins) { return pad(Math.floor(mins / 60)) + ":" + pad(mins % 60); }

  // End time of a service starting at hhmm with duration minutes.
  function endTime(hhmm, durationMin) {
    var t = hhmm.split(":");
    return minToHHMM((+t[0]) * 60 + (+t[1]) + durationMin);
  }

  /* Time slots for a SAST date + service duration.
     - every 30 minutes from opening
     - only if the FULL duration finishes at or before closing
     - on today's SAST date, hide slots starting < LEAD_MIN from now
     nowMs defaults to Date.now() (injectable for tests). */
  function slotsFor(dateStr, durationMin, nowMs) {
    var now = nowMs == null ? Date.now() : nowMs;
    var dow = dowOf(dateStr);
    var hours = hoursForWeekday(dow);
    if (!hours) return [];
    var open = hours[0], close = hours[1];
    var today = dateStrOf.apply(null, (function () {
      var s = sastParts(now); return [s.y, s.m, s.day];
    })());
    var cutoff = null;
    if (dateStr === today) cutoff = sastParts(now).mins + LEAD_MIN;
    var out = [];
    for (var s = open; s + durationMin <= close; s += 30) {
      if (cutoff != null && s < cutoff) continue;
      out.push(minToHHMM(s));
    }
    return out;
  }

  // Next N bookable SAST dates (open days, today..+WINDOW_DAYS).
  function bookableDates(nowMs, windowDays) {
    var now = nowMs == null ? Date.now() : nowMs;
    var s = sastParts(now);
    var start = dateStrOf(s.y, s.m, s.day);
    var out = [];
    var span = windowDays == null ? WINDOW_DAYS : windowDays;
    for (var i = 0; i <= span; i++) {
      var ds = addDays(start, i);
      if (hoursForWeekday(dowOf(ds))) out.push(ds);
    }
    return out;
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function compact(dateStr, hhmm) {
    return dateStr.replace(/-/g, "") + "T" + hhmm.replace(":", "") + "00";
  }

  function icsEscape(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function dtstampUTC(ms) {
    var d = new Date(ms == null ? Date.now() : ms);
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
      "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
  }

  /* Build the .ics file for a confirmed booking. Never hard-coded: every
     field comes from the booking passed in. SAST wall time via TZID. */
  function buildICS(b) {
    var uid = (b.uid || b.ref + "@alcuts.co.za");
    var stamp = dtstampUTC(b.nowMs);
    var start = compact(b.date, b.start);
    var end = compact(b.date, b.end);
    var summary = "AL CUTS: " + b.service + " with " + b.barber;
    var desc = "Service: " + b.service + "\\nBarber: " + b.barber +
      "\\nPrice: R" + b.total + "\\nBooking ref: " + b.ref +
      "\\nPhone: " + b.phone + "\\nArrive 5 minutes early.";
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AL CUTS//Booking//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VTIMEZONE",
      "TZID:Africa/Johannesburg",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0200",
      "TZNAME:SAST",
      "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:" + icsEscape(uid),
      "DTSTAMP:" + stamp,
      "DTSTART;TZID=Africa/Johannesburg:" + start,
      "DTEND;TZID=Africa/Johannesburg:" + end,
      "SUMMARY:" + icsEscape(summary),
      "DESCRIPTION:" + icsEscape(desc),
      "LOCATION:" + icsEscape("AL CUTS, 12 Oxford Road, Rosebank, Johannesburg"),
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:-PT60M",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + icsEscape("AL CUTS appointment in 1 hour"),
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    return lines.join("\r\n") + "\r\n";
  }

  /* Google Calendar template link from the same booking. Local SAST times
     (no Z suffix) + ctz=Africa/Johannesburg so 3:00 PM stays 3:00 PM. */
  function googleCalendarUrl(b) {
    var q = function (v) { return encodeURIComponent(v); };
    var desc = "Service: " + b.service + "\nBarber: " + b.barber +
      "\nPrice: R" + b.total + "\nBooking ref: " + b.ref +
      "\nPhone: " + b.phone + "\nArrive 5 minutes early.";
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + q("AL CUTS: " + b.service + " with " + b.barber) +
      "&dates=" + compact(b.date, b.start) + "/" + compact(b.date, b.end) +
      "&ctz=" + q("Africa/Johannesburg") +
      "&details=" + q(desc) +
      "&location=" + q("AL CUTS, 12 Oxford Road, Rosebank, Johannesburg");
  }

  /* Android intent URL: opens the Google Calendar APP when it is installed,
     otherwise falls back to the same web template link. iOS keeps the
     https link, which the app opens directly when installed. */
  function googleCalendarIntentUrl(b) {
    var web = googleCalendarUrl(b);
    var query = web.slice(web.indexOf("?") + 1);
    return "intent://calendar.google.com/calendar/render?" + query +
      "#Intent;scheme=https;package=com.google.android.calendar" +
      ";S.browser_fallback_url=" + encodeURIComponent(web) + ";end";
  }

  return {
    SAST_OFFSET_MIN: SAST_OFFSET_MIN,
    LEAD_MIN: LEAD_MIN,
    WINDOW_DAYS: WINDOW_DAYS,
    hoursForWeekday: hoursForWeekday,
    sastParts: sastParts,
    sastToMs: sastToMs,
    dowOf: dowOf,
    addDays: addDays,
    slotsFor: slotsFor,
    bookableDates: bookableDates,
    endTime: endTime,
    overlaps: overlaps,
    buildICS: buildICS,
    googleCalendarUrl: googleCalendarUrl,
    googleCalendarIntentUrl: googleCalendarIntentUrl
  };
});
