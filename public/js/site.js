/*
 * Shared page behaviour:
 *  - Progressive reveal: elements with [data-reveal] fade/slide in as they scroll into view.
 *  - Word rotator: "subhrajit.space" swipes through space → designsystem → casestudies → articles.
 */

// --- CONFIG ---
const REVEAL_STAGGER_MS = 90;    // delay between siblings inside a [data-reveal-group]
const ROTATE_EVERY_MS = 2200;    // how long each word stays before swiping

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reveal [data-reveal] elements once they enter the viewport. */
function initReveal() {
  const els = [...document.querySelectorAll("[data-reveal]")];

  // Stagger children of a group so rows/grids cascade in
  document.querySelectorAll("[data-reveal-group]").forEach((group) => {
    [...group.querySelectorAll("[data-reveal]")].forEach((el, i) => {
      el.style.setProperty("--reveal-delay", `${i * REVEAL_STAGGER_MS}ms`);
    });
  });

  if (reduceMotion || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-visible");
        io.unobserve(e.target);
      });
    },
    { threshold: 0 }
  );
  els.forEach((el) => io.observe(el));
}

/** Swipe the word after "subhrajit." through a list, resizing smoothly to each word. */
function initRotator() {
  const rotator = document.querySelector("[data-rotator]");
  if (!rotator) return;
  const words = [...rotator.querySelectorAll(".rotator__word")];
  let index = 0;

  const fit = () => { rotator.style.width = `${words[index].offsetWidth}px`; };
  // Wait for web fonts so widths are measured with Space Grotesk, not the fallback
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(fit);
  window.addEventListener("resize", fit);

  if (reduceMotion) return;
  setInterval(() => {
    const current = words[index];
    index = (index + 1) % words.length;
    const next = words[index];
    current.classList.remove("is-active");
    current.classList.add("is-leaving");
    next.classList.remove("is-leaving");
    next.classList.add("is-active");
    fit();
    // Reset the leaving word below the baseline so it can enter again later
    setTimeout(() => current.classList.remove("is-leaving"), 600);
  }, ROTATE_EVERY_MS);
}

document.documentElement.classList.add("js");
initReveal();
initRotator();
