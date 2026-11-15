// Deterministic film: window.renderAt(t) draws the frame for time t (seconds).
const TL = window.TIMELINE, T = TL.starts, END = TL.end, GAP = 3200;
const SHOTS = "../../artifacts/screenshots/";
const cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ph = (t, a, b) => cl((t - a) / (b - a));
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eo = (x) => 1 - Math.pow(1 - x, 3);
const back = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
const lerp = (a, b, k) => a + (b - a) * k;
const world = document.getElementById("world");
let focusZ = 0, camZ = 0;

function mk(parent, cls, html) {
  const e = document.createElement("div");
  e.className = "n " + (cls || "");
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}
function put(e, p) {
  const { x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1, o = 1, dof = false, blur = 0 } = p;
  if (o <= 0.003) { e.style.display = "none"; return; }
  e.style.display = "";
  e.style.opacity = o;
  e.style.transform = `translate3d(${x}px,${y}px,${z}px) rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${s}) translate(-50%,-50%)`;
  let b = blur;
  if (dof) b += Math.min(6, Math.max(0, Math.abs(z - focusZ) - 160) / 110);
  e.style.filter = b > 0.25 ? `blur(${b.toFixed(2)}px)` : "";
}
function panel(parent, img, cls) {
  const e = mk(parent, "panel " + (cls || ""));
  e.style.backgroundImage = `url(${SHOTS}${img})`;
  return e;
}
const scenes = T.map((_, i) => { const s = mk(world, "scene"); s.style.transform = `translate3d(${i * GAP}px,0,0)`; return s; });

/* ---------- drawings ---------- */
const docSvg = (tag, hl) => `<svg width="170" height="216" viewBox="0 0 170 216"><path d="M8 0h112l50 50v158a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8z" fill="#f1f4ea"/><path d="M120 0l50 50h-42a8 8 0 0 1-8-8z" fill="#c9d1c1"/>
<rect x="20" y="70" width="112" height="9" rx="4.5" fill="#c3cabd"/><rect x="20" y="92" width="130" height="${hl ? 18 : 9}" rx="4.5" fill="${hl ? "#c8f05a" : "#c3cabd"}"/><rect x="20" y="${hl ? 123 : 114}" width="96" height="9" rx="4.5" fill="#c3cabd"/><rect x="20" y="${hl ? 145 : 136}" width="122" height="9" rx="4.5" fill="#c3cabd"/>
<rect x="20" y="176" width="52" height="24" rx="5" fill="#172623"/><text x="46" y="193" font-family="Plex" font-size="13" fill="#c8f05a" text-anchor="middle">${tag}</text></svg>`;
function avatar(kind) {
  // Original, faceless, geometric figures in brand colours.
  const hair = kind === 0
    ? `<path d="M64 74c0-26 18-42 37-42s37 16 37 42c-10-14-24-20-37-20s-27 6-37 20z" fill="#172623"/><circle cx="101" cy="26" r="13" fill="#172623"/>`
    : `<path d="M66 70c-2-24 14-38 35-38s37 14 35 38c-6-12-18-18-35-18s-29 6-35 18z" fill="#172623"/><rect x="74" y="72" width="22" height="14" rx="6" fill="none" stroke="#172623" stroke-width="3"/><rect x="106" y="72" width="22" height="14" rx="6" fill="none" stroke="#172623" stroke-width="3"/><path d="M96 78h10" stroke="#172623" stroke-width="3"/>`;
  const body = kind === 0 ? "#c8f05a" : "#3d6157";
  return `<svg width="202" height="202" viewBox="0 0 202 202"><defs><clipPath id="c${kind}"><circle cx="101" cy="101" r="94"/></clipPath></defs>
<circle cx="101" cy="101" r="98" fill="#10201c" stroke="#c8f05a" stroke-width="3"/><g clip-path="url(#c${kind})">
<path d="M30 210c0-48 30-76 71-76s71 28 71 76z" fill="${body}"/><path d="M83 132h36v14a18 18 0 0 1-36 0z" fill="#dfe9d8"/>
${kind === 1 ? '<path d="M83 140l18 22 18-22" fill="none" stroke="#c8f05a" stroke-width="5"/>' : ""}
<circle cx="101" cy="82" r="36" fill="#dfe9d8"/>${hair}</g></svg>`;
}

/* ---------- scene 1: books open, pages fly out and become glass panels ---------- */
const s1 = {};
{
  const S = scenes[0];
  s1.book = mk(S, "", "");
  s1.book.style.width = "500px"; s1.book.style.height = "330px";
  s1.book.innerHTML = `<div class="cover" style="left:250px"><b style="top:70px"></b><b class="l" style="top:110px"></b><b style="top:164px;right:90px"></b></div>
    <div class="leaf" style="left:250px"><i style="top:50px"></i><i style="top:76px"></i><i style="top:102px;right:80px"></i><i style="top:150px"></i><i style="top:176px"></i></div>
    <div class="leaf" id="lf2" style="left:250px"><i style="top:50px"></i><i style="top:76px"></i><i style="top:128px"></i></div>
    <div class="leaf" id="lf1" style="left:250px"><i style="top:50px"></i><i style="top:76px"></i><i style="top:128px"></i></div>
    <div class="cover" id="cv" style="left:250px"><b style="top:70px"></b><b class="l" style="top:110px"></b><b style="top:164px;right:90px"></b></div>`;
  s1.docs = [[-760, "PDF", 1], [-900, "DOCX", 0], [760, "PDF", 0], [900, "TXT", 1]].map(([x, tag, hl], i) => ({ e: mk(S, "", docSvg(tag, hl)), x, i }));
  const targets = [
    ["landing-hero-desktop.png", -700, -200, -260, 26, 0.8],
    ["workspace-hebrew-rtl-desktop.png", 0, -230, -120, 0, 0.84],
    ["app/library-desktop.png", 700, -200, -260, -26, 0.8],
    ["workspace-dark-desktop.png", -420, -430, -820, 12, 0.8],
    ["app/library-hebrew-desktop.png", 430, -430, -820, -12, 0.8],
  ];
  s1.pages = targets.map(([img, x, y, z, ry, s], i) => {
    const e = panel(S, img);
    const paper = document.createElement("div"); paper.className = "paper";
    paper.innerHTML = [14, 24, 34, 44, 58, 68, 78].map((top, j) => `<i class="${j === 2 ? "hl" : ""}" style="top:${top}%;width:${[70, 82, 60, 78, 82, 66, 74][j]}%"></i>`).join("");
    e.appendChild(paper);
    return { e, paper, x, y, z, ry, s, i };
  });
}
function scene1(u) {
  focusZ = lerp(120, -160, eio(ph(u, 1.2, 3.2)));
  const open = eio(ph(u, 0.35, 1.5));
  put(s1.book, { x: 0, y: 95, z: 140, rx: 60, s: 0.9, o: ph(u, 0, 0.4) * (1 - ph(u, 3.3, 4.1)), dof: true });
  s1.book.querySelector("#cv").style.transform = `rotateY(${lerp(0, -172, open)}deg)`;
  s1.book.querySelector("#lf1").style.transform = `rotateY(${lerp(0, -168, eio(ph(u, 0.7, 1.9)))}deg)`;
  s1.book.querySelector("#lf2").style.transform = `rotateY(${lerp(0, -164, eio(ph(u, 1.3, 2.6)))}deg)`;
  s1.docs.forEach((d) => {
    const k = eo(ph(u, 0.15 + d.i * 0.12, 1.0 + d.i * 0.12));
    put(d.e, { x: d.x, y: lerp(430, 150 + (d.i % 2) * 70, k) + Math.sin(u * 1.1 + d.i) * 6, z: d.i % 2 ? -60 : 160, ry: d.x < 0 ? 24 : -24, rz: (d.i - 1.5) * 5, o: k, dof: true });
  });
  s1.pages.forEach((p) => {
    const a = 1.0 + p.i * 0.32, k = ph(u, a, a + 1.7), e = eio(k);
    const arc = Math.sin(Math.PI * k) * 170;
    const fl = Math.sin(u * 0.9 + p.i * 1.7) * 7;
    put(p.e, {
      x: lerp(30, p.x, e), y: lerp(80, p.y, e) - arc + fl * e, z: lerp(160, p.z, e),
      ry: lerp(0, p.ry, e) + (1 - e) * Math.sin(k * 7 + p.i) * 50, rx: (1 - e) * (64 + Math.cos(k * 9 + p.i) * 40), rz: (1 - e) * (p.i - 2) * 16,
      s: lerp(0.12, p.s, eio(k)), o: ph(k, 0, 0.06), dof: true,
    });
    p.paper.style.opacity = 1 - eio(ph(k, 0.5, 0.92));
  });
}

/* ---------- scene 2: users ask, the question travels to the documents, an answer returns ---------- */
const s2 = {};
{
  const S = scenes[1];
  s2.docs = [0, 1, 2].map((i) => mk(S, "", docSvg(["PDF", "DOCX", "PDF"][i], i === 1)));
  s2.glow = mk(S, "", `<div style="width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(220,255,150,.95),rgba(200,240,90,.3) 38%,transparent 68%)"></div>`);
  s2.av = [mk(S, "", avatar(0)), mk(S, "", avatar(1))];
  s2.bub = [mk(S, "", `<div class="bubble he"></div>`), mk(S, "", `<div class="bubble en"></div>`)];
  s2.txt = ["מהו חלון ההחזר במסלולים שנתיים?", "What is the refund window for annual plans?"];
  s2.orbs = [0, 1].map(() => [0, 1, 2, 3, 4].map(() => mk(S, "orb")));
  s2.pEn = panel(S, "workspace-desktop.png");
  s2.pHe = panel(S, "workspace-hebrew-rtl-desktop.png");
}
function scene2(u) {
  focusZ = lerp(lerp(300, -300, eio(ph(u, 1.9, 2.7))), 20, eio(ph(u, 2.9, 3.6)));
  const hit = ph(u, 2.75, 2.95) * (1 - ph(u, 2.95, 3.9));
  s2.docs.forEach((d, i) => put(d, { x: (i - 1) * 96, y: -70 + Math.sin(u * 1.3 + i) * 7, z: -320 - Math.abs(i - 1) * 40, ry: (1 - i) * 22, rz: (i - 1) * 6, s: 1.5 + hit * 0.12, o: eo(ph(u, -0.6, 0.3)) * (1 - ph(u, 3.2, 4.0) * 0.75), dof: true }));
  put(s2.glow, { x: 0, y: -70, z: -300, o: hit, s: 0.6 + hit * 1.2 });
  const src = [[640, 190, 300], [-640, 190, 300]];
  s2.av.forEach((a, i) => {
    const k = back(ph(u, 0.05 + i * 0.3, 0.75 + i * 0.3));
    put(a, { x: src[i][0], y: src[i][1] + (1 - k) * 160, z: src[i][2], ry: i ? 14 : -14, s: 1.05, o: ph(u, 0.05 + i * 0.3, 0.4 + i * 0.3) * (1 - ph(u, 2.9, 3.7)), dof: true });
  });
  s2.bub.forEach((b, i) => {
    const a = 0.55 + i * 0.4, k = back(ph(u, a, a + 0.45)), send = eio(ph(u, 1.9 + i * 0.15, 2.3 + i * 0.15));
    const n = Math.round(s2.txt[i].length * ph(u, a + 0.15, a + 0.95));
    b.firstChild.textContent = s2.txt[i].slice(0, Math.max(1, n));
    put(b, { x: src[i][0] + (i ? 120 : -140), y: src[i][1] - 210, z: src[i][2], s: k * (1 - send * 0.85), o: ph(u, a, a + 0.2) * (1 - send), dof: true });
    s2.orbs[i].forEach((o, j) => {
      const kk = ph(u, 1.95 + i * 0.15 + j * 0.035, 2.8 + i * 0.1 + j * 0.035), e = eio(kk);
      put(o, { x: lerp(src[i][0] + (i ? 120 : -140), 0, e), y: lerp(src[i][1] - 210, -70, e) - Math.sin(Math.PI * kk) * 190, z: lerp(src[i][2], -300, e), s: (1 - j * 0.17) * (0.6 + Math.sin(Math.PI * kk) * 0.9), o: (kk > 0 && kk < 1 ? 1 : 0) * (1 - j * 0.16) });
    });
  });
  const r = eo(ph(u, 2.9, 3.9));
  put(s2.pEn, { x: lerp(0, -445, r), y: lerp(-70, -120, r), z: lerp(-300, 20, r), ry: lerp(0, 17, r), s: lerp(0.15, 0.8, r), o: ph(u, 2.9, 3.15), dof: true });
  const r2 = eo(ph(u, 3.15, 4.15));
  put(s2.pHe, { x: lerp(0, 445, r2), y: lerp(-70, -120, r2), z: lerp(-300, 20, r2), ry: lerp(0, -17, r2), s: lerp(0.15, 0.8, r2), o: ph(u, 3.15, 3.4), dof: true });
}

/* ---------- scene 3: a line of light ties the answer to the cited passage ---------- */
const s3 = {};
{
  const S = scenes[2];
  s3.back = panel(S, "workspace-hebrew-rtl-desktop.png");
  s3.main = panel(S, "workspace-desktop.png");
  const inner = document.createElement("div"); inner.className = "inner"; inner.style.transform = `scale(${1000 / 1440})`;
  inner.innerHTML = `<svg width="1440" height="900" viewBox="0 0 1440 900" style="position:absolute;overflow:visible">
    <defs><filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g filter="url(#gl)" fill="none" stroke-linecap="round">
      <path id="beam" pathLength="1" d="M818 302 C 930 300, 900 470, 960 560 S 1080 640, 1166 628" stroke="#c8f05a" stroke-width="5" stroke-dasharray="1" stroke-dashoffset="1"/>
      <path id="beamw" pathLength="1" d="M818 302 C 930 300, 900 470, 960 560 S 1080 640, 1166 628" stroke="#fbffe8" stroke-width="2" stroke-dasharray="1" stroke-dashoffset="1"/>
      <circle id="ra" cx="807" cy="302" r="20" stroke="#c8f05a" stroke-width="4"/>
      <circle id="spark" r="9" fill="#fbffe8" stroke="none"/>
      <rect id="r1" pathLength="1" x="988" y="380" width="424" height="48" rx="8" stroke="#c8f05a" stroke-width="3.5" stroke-dasharray="1"/>
      <rect id="r2" pathLength="1" x="1146" y="439" width="108" height="30" rx="8" stroke="#c8f05a" stroke-width="3.5" stroke-dasharray="1"/>
      <rect id="r3" pathLength="1" x="996" y="598" width="404" height="112" rx="8" stroke="#c8f05a" stroke-width="3.5" stroke-dasharray="1"/>
    </g></svg>
    <div class="pill" id="p1" style="left:1262px;top:346px">המסמך<small>Document</small></div>
    <div class="pill" id="p2" style="left:1266px;top:438px">העמוד<small>Page</small></div>
    <div class="pill" id="p3" style="left:1290px;top:722px">השורה<small>Line</small></div>`;
  s3.main.appendChild(inner);
  s3.q = (id) => inner.querySelector(id);
  s3.len = null;
}
function scene3(u) {
  focusZ = 60;
  put(s3.back, { x: -1040, y: -140, z: -560, ry: 34, s: 0.9, o: 0.85, dof: true });
  put(s3.main, { x: 0, y: -42, z: 60, ry: lerp(9, -5, eio(ph(u, 0, 5.5))), rx: 1.5, s: 1.12, dof: true });
  const b = eio(ph(u, 1.0, 2.3));
  s3.q("#beam").style.strokeDashoffset = 1 - b; s3.q("#beamw").style.strokeDashoffset = 1 - b;
  const path = s3.q("#beam"); s3.len = s3.len || path.getTotalLength();
  const pt = path.getPointAtLength(s3.len * b);
  const sp = s3.q("#spark"); sp.setAttribute("cx", pt.x); sp.setAttribute("cy", pt.y); sp.style.opacity = b > 0 && b < 1 ? 1 : 0;
  const ra = s3.q("#ra"), pr = ph(u, 0.55, 1.2); ra.setAttribute("r", 14 + pr * 22); ra.style.opacity = pr > 0 ? 1 - pr * 0.75 : 0;
  [["#r1", "#p1", 3.0], ["#r2", "#p2", 3.75], ["#r3", "#p3", 2.3]].forEach(([r, p, a], i) => {
    const pill = i === 2 ? 4.5 : a + 0.25;
    s3.q(r).style.strokeDashoffset = 1 - eio(ph(u, a, a + 0.55));
    const k = back(ph(u, pill, pill + 0.4));
    s3.q(p).style.opacity = ph(u, pill, pill + 0.15); s3.q(p).style.transform = `scale(${k})`;
  });
}

/* ---------- scene 4: a private, isolated, secured library ---------- */
const s4 = {};
{
  const S = scenes[3];
  s4.l = panel(S, "app/library-desktop.png");
  s4.r = panel(S, "app/auth-sign-in-hebrew-desktop.png");
  s4.ring = mk(S, "ring");
  s4.main = panel(S, "app/library-hebrew-desktop.png");
  s4.frame = mk(S, "", `<svg width="1090" height="716" viewBox="0 0 1090 716" style="overflow:visible"><defs><filter id="g4" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <g filter="url(#g4)" fill="none"><rect id="fr" pathLength="1" x="6" y="6" width="1078" height="704" rx="34" stroke="#c8f05a" stroke-width="4" stroke-dasharray="1" stroke-dashoffset="1"/>
    <rect id="frd" x="-16" y="-16" width="1122" height="748" rx="50" stroke="rgba(200,240,90,.55)" stroke-width="2" stroke-dasharray="3 14"/></g></svg>`);
  s4.shield = mk(S, "", `<svg width="340" height="400" viewBox="0 0 300 360" style="overflow:visible"><defs>
    <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c4f45"/><stop offset="1" stop-color="#0d1a17"/></linearGradient>
    <filter id="g5" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path id="shf" d="M150 18 L272 58 V172 C272 252 216 312 150 342 C84 312 28 252 28 172 V58 Z" fill="url(#sg)" opacity="0"/>
    <path d="M150 18 L150 342 C84 312 28 252 28 172 V58 Z" fill="rgba(255,255,255,.06)" id="shs" opacity="0"/>
    <path id="sho" pathLength="1" filter="url(#g5)" d="M150 18 L272 58 V172 C272 252 216 312 150 342 C84 312 28 252 28 172 V58 Z" fill="none" stroke="#c8f05a" stroke-width="6" stroke-linejoin="round" stroke-dasharray="1" stroke-dashoffset="1"/>
    <g id="lock" opacity="0"><path id="shk" d="M122 176 V146 a28 28 0 0 1 56 0 V176" fill="none" stroke="#eaf7c8" stroke-width="12" stroke-linecap="round"/>
    <rect x="102" y="172" width="96" height="78" rx="14" fill="#c8f05a"/><circle cx="150" cy="204" r="10" fill="#172623"/><rect x="146" y="208" width="8" height="22" rx="4" fill="#172623"/></g></svg>`);
}
function scene4(u) {
  focusZ = lerp(-120, 80, eio(ph(u, 1.4, 3.0)));
  put(s4.l, { x: -900, y: -110, z: -620, ry: 32, s: 0.9, dof: true });
  put(s4.r, { x: 900, y: -110, z: -620, ry: -32, s: 0.9, dof: true });
  put(s4.main, { x: -150, y: -50, z: -120, ry: 7, s: 1.0, dof: true });
  const f = eio(ph(u, 0.6, 2.0));
  s4.frame.querySelector("#fr").style.strokeDashoffset = 1 - f;
  s4.frame.querySelector("#frd").style.opacity = ph(u, 1.9, 2.5) * 0.9;
  s4.frame.querySelector("#frd").style.strokeDashoffset = -u * 14;
  put(s4.frame, { x: -150, y: -50, z: -110, ry: 7, o: ph(u, 0.5, 0.7) });
  put(s4.ring, { x: -150, y: -30, z: -120, rx: 78, rz: u * 16, o: ph(u, 1.6, 2.6) * 0.75 });
  const d = eio(ph(u, 1.3, 2.4)), lk = ph(u, 2.75, 3.0);
  s4.shield.querySelector("#sho").style.strokeDashoffset = 1 - d;
  s4.shield.querySelector("#shf").style.opacity = ph(u, 2.0, 2.6) * 0.94;
  s4.shield.querySelector("#shs").style.opacity = ph(u, 2.0, 2.6);
  s4.shield.querySelector("#lock").style.opacity = ph(u, 2.3, 2.6);
  s4.shield.querySelector("#shk").setAttribute("transform", `translate(0 ${lerp(-24, 0, eio(lk))}) rotate(${lerp(-24, 0, eio(lk))} 178 176)`);
  const pop = 1 + Math.sin(Math.PI * ph(u, 2.95, 3.3)) * 0.1;
  put(s4.shield, { x: 520, y: 10 + Math.sin(u * 1.2) * 6, z: 230, ry: -16, s: lerp(0.8, 1, eo(ph(u, 1.2, 2.2))) * pop, o: ph(u, 1.2, 1.4), dof: true });
}

/* ---------- scene 5: desktop and mobile ---------- */
const s5 = {};
{
  const S = scenes[4];
  s5.d = panel(S, "workspace-dark-desktop.png");
  s5.p1 = panel(S, "workspace-hebrew-rtl-mobile.png", "phone");
  s5.p2 = panel(S, "workspace-mobile-evidence.png", "phone");
}
function scene5(u) {
  focusZ = 120;
  put(s5.d, { x: -360, y: -60 + Math.sin(u * 1.1) * 6, z: -60, ry: 17, s: 1.02, dof: true });
  const a = eo(ph(u, -0.3, 1.0)), b = eo(ph(u, 0.1, 1.4));
  put(s5.p1, { x: 400, y: -20 + (1 - a) * 380 + Math.sin(u * 1.3 + 1) * 7, z: 170, ry: -13, rz: -2, s: 0.92, dof: true });
  put(s5.p2, { x: 740, y: -70 + (1 - b) * 460 + Math.sin(u * 1.2 + 2) * 7, z: 10, ry: -22, rz: 3, s: 0.92, dof: true });
}

/* ---------- camera ---------- */
const drift = [
  (u) => ({ y: lerp(60, -40, eio(ph(u, 0, 5))), z: lerp(260, 60, eio(ph(u, 0, 5.4))), yaw: lerp(-3, 2, ph(u, 0, 5.6)) }),
  (u) => ({ y: 0, z: lerp(380, 380, 0) - eio(ph(u, 2.2, 3.8)) * 300, yaw: lerp(2, -2, ph(u, 0, 6)) }),
  (u) => ({ x: lerp(-60, 150, eio(ph(u, 0.2, 5.2))), y: lerp(-40, 0, eio(ph(u, 0.2, 5.2))), z: lerp(330, -60, eio(ph(u, 0.2, 5.2))), yaw: 0 }),
  (u) => ({ x: lerp(-90, 60, eio(ph(u, 0, 6))), z: lerp(330, 150, eio(ph(u, 0, 6))), yaw: lerp(-2, 2, ph(u, 0, 6)) }),
  (u) => ({ x: lerp(-60, 120, eio(ph(u, 0, 4.6))), z: lerp(360, 200, eio(ph(u, 0, 4.6))), yaw: lerp(2, -1, ph(u, 0, 4.6)) }),
  (u) => ({ z: lerp(300, 0, eo(ph(u, 0, 5))) }),
];
function camera(t) {
  let i = 0; while (i < T.length - 1 && t >= T[i + 1]) i++;
  const get = (j) => ({ x: 0, y: 0, z: 0, yaw: 0, ...drift[j](t - T[j]) });
  let c = get(i), X = i * GAP, sw = 0;
  const blend = (j, k) => { const a = get(j), b = get(j + 1), e = eio(k); sw = Math.sin(Math.PI * k);
    c = { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, e), yaw: lerp(a.yaw, b.yaw, e) }; X = (j + e) * GAP; };
  if (i < T.length - 1 && t > T[i + 1] - 0.65) blend(i, ph(t, T[i + 1] - 0.65, T[i + 1] + 0.65));
  else if (i > 0 && t < T[i] + 0.65) blend(i - 1, ph(t, T[i] - 0.65, T[i] + 0.65));
  return { x: X + c.x, y: c.y, z: c.z + sw * 260, yaw: c.yaw - sw * 5, sw, i };
}

/* ---------- overlay: captions, particles, flares ---------- */
const capBox = document.getElementById("cap");
const caps = TL.captions.map((c) => {
  if (!c) return null;
  const e = document.createElement("div"); e.className = "cap";
  e.innerHTML = `<div class="he">${c.he}</div><div class="en">${c.en}</div>`; capBox.appendChild(e); return e;
});
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const P = Array.from({ length: 150 }, () => ({ x: rnd() * 2400, y: rnd() * 1080, d: 0.15 + rnd() * 0.95, r: rnd() < 0.14 ? 9 + rnd() * 20 : 0.8 + rnd() * 2.2, a: 0.1 + rnd() * 0.5, w: rnd() * 6.28, lime: rnd() < 0.5 }));
const ctx = document.getElementById("particles").getContext("2d");
function particles(t, cx) {
  ctx.clearRect(0, 0, 1920, 1080);
  for (const p of P) {
    const x = (((p.x - cx * p.d * 0.5 + t * 9 * p.d) % 2400) + 2400) % 2400 - 240;
    const y = (((p.y - t * 14 * p.d + Math.sin(t * 0.7 + p.w) * 16) % 1080) + 1080) % 1080;
    const big = p.r > 6, a = (big ? p.a * 0.16 : p.a) * (0.65 + 0.35 * Math.sin(t * 1.6 + p.w));
    ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.283);
    ctx.fillStyle = p.lime ? `rgba(200,240,90,${a})` : `rgba(235,255,225,${a})`; ctx.fill();
  }
}
const streak = document.getElementById("streak"), burst = document.getElementById("burst"), end = document.getElementById("end"), bg = document.getElementById("bg");
const pulse = (t, at, up, down) => (t < at ? ph(t, at - up, at) : 1 - ph(t, at, at + down));

window.renderAt = function (t) {
  t = cl(t, 0, END);
  const c = camera(t); camZ = c.z;
  world.style.transform = `rotateY(${c.yaw}deg) translate3d(${-c.x}px,${-c.y}px,${-c.z}px)`;
  const fns = [scene1, scene2, scene3, scene4, scene5];
  scenes.forEach((s, i) => {
    const near = Math.abs(i * GAP - c.x) < 2900 && i < 5;
    s.style.display = near ? "" : "none";
    if (near) fns[i](t - T[i]);
  });
  bg.style.setProperty("--gx", 50 + Math.sin(c.x / 1700) * 14 + "%");
  particles(t, c.x);
  // captions
  caps.forEach((e, i) => {
    if (!e) return;
    const a = T[i] + 0.35, z = T[i + 1] - 0.45, o = ph(t, a, a + 0.45) * (1 - ph(t, z, z + 0.35));
    e.style.opacity = o; e.style.transform = `translateY(${(1 - eo(ph(t, a, a + 0.6))) * 26}px)`;
    e.querySelectorAll(".k").forEach((k) => k.style.setProperty("--p", eio(ph(t, a + 1.1, a + 1.7))));
  });
  // light: travel streaks between stations, plus impacts
  let st = 0; for (let i = 1; i < T.length; i++) st = Math.max(st, pulse(t, T[i], 0.5, 0.6) * 0.75);
  st = Math.max(st, pulse(t, T[1] + 2.85, 0.1, 0.6) * 0.55, pulse(t, T[3] + 3.0, 0.08, 0.6) * 0.7, pulse(t, T[2] + 2.3, 0.1, 0.5) * 0.35);
  streak.style.opacity = st; streak.style.transform = `translateY(${-60 + Math.sin(t) * 10}px) scaleX(${0.7 + st * 0.6})`;
  const u6 = t - T[5];
  burst.style.opacity = pulse(t, T[5] + 0.55, 0.5, 1.6) * 0.9 + ph(u6, 1.5, 4) * 0.12;
  end.style.opacity = ph(u6, 0.35, 1.0) * (1 - ph(t, END - 0.45, END - 0.05));
  end.style.transform = `scale(${lerp(0.9, 1.03, eo(ph(u6, 0.3, 6)))})`;
  document.getElementById("endk").style.setProperty("--p", eio(ph(u6, 2.0, 2.7)));
  document.getElementById("note").style.opacity = ph(t, 0.4, 1.0) * (1 - ph(t, END - 0.45, END - 0.05));
};
window.ready = Promise.all([document.fonts.ready, ...[...document.querySelectorAll(".panel")].map((p) => {
  const im = new Image(); im.src = p.style.backgroundImage.slice(5, -2); return im.decode().catch(() => {});
})]).then(() => { ["Heebo", "Jakarta", "Plex"].forEach((f) => document.fonts.load(`700 20px ${f}`, "אA")); return document.fonts.ready; });
renderAt(0);
