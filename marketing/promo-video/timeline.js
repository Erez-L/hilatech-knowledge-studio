// Scene start times in seconds. Retime here to fit the narration; everything else follows.
// Each scene's narration line should begin ~0.5s after its start.
window.TIMELINE = {
  fps: 30,
  starts: [0, 5.6, 11.6, 18.2, 24.2, 28.8],
  end: 35,
  captions: [
    { he: 'כל הידע של העסק שלכם, <span class="k"><span>במקום אחד</span></span>', en: "All your business knowledge, in one place." },
    { he: 'שואלים שאלה, <span class="k"><span>בעברית או באנגלית</span></span>, ומקבלים תשובה תוך שניות', en: "Ask in Hebrew or English. Get an answer in seconds." },
    { he: 'כל תשובה מגיעה עם <span class="k"><span>המקור המדויק</span></span>', en: "Every answer comes with its exact source: the document, the page, the line." },
    { he: 'ספרייה פרטית לכל ארגון. <span class="k"><span>מבודדת. מאובטחת.</span></span>', en: "A private library for every organization. Isolated. Secured." },
    { he: 'בדסקטופ, בנייד, <span class="k"><span>בכל מקום</span></span>', en: "On desktop, on mobile, anywhere." },
    null,
  ],
};
