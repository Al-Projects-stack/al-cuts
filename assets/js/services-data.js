/* AL CUTS — single source of truth for services + barbers.
   Reused by the Services page and the booking form. Prices in rand. */
window.ALCUTS_SERVICES = [
  { id: "classic", name: "Classic haircut", desc: "Consultation, precision cut, hot-towel finish and styling.", mins: 30, price: 180 },
  { id: "fade", name: "Skin fade", desc: "Zero-blend fade, sharpened hairline, styled to finish.", mins: 45, price: 220 },
  { id: "kids", name: "Kids cut, under 12", desc: "Patient, parent-approved cut with a gentle finish.", mins: 30, price: 130 },
  { id: "beard", name: "Beard trim and shape", desc: "Shape, line-up and conditioning oils.", mins: 20, price: 110 },
  { id: "shave", name: "Hot towel shave", desc: "Traditional straight-razor shave, fresh blade every time.", mins: 30, price: 160 },
  { id: "package", name: "Cut and beard package", desc: "Any cut plus full beard sculpt in one chair session.", mins: 60, price: 290 }
];

window.ALCUTS_BARBERS = [
  { id: "al", name: "Al Mujati", role: "Founder, fades", bio: "Founded AL CUTS in 2014. Skin fades and sharp hairlines are his signature." },
  { id: "sipho", name: "Sipho Dlamini", role: "Classic cuts, hot towel", bio: "Old-school craft: scissor work, classic tapers and the full hot-towel ritual." },
  { id: "lerato", name: "Lerato Naidoo", role: "Beards, kids", bio: "Beard architecture and patient kids cuts. Detail-obsessed finisher." }
];

window.ALCUTS_OFFER = { code: "first30", label: "First-visit offer", amount: 30 };
