(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------
     Header: solid on scroll
  --------------------------------------------------------- */
  const header = document.getElementById("siteHeader");
  const onHeaderScroll = () => {
    header.classList.toggle("scrolled", window.scrollY > 40);
  };
  onHeaderScroll();
  window.addEventListener("scroll", onHeaderScroll, { passive: true });

  /* ---------------------------------------------------------
     Mobile menu
  --------------------------------------------------------- */
  const menuToggle = document.getElementById("menuToggle");
  const mobileMenu = document.getElementById("mobileMenu");

  const closeMenu = () => {
    menuToggle.setAttribute("aria-expanded", "false");
    mobileMenu.classList.remove("open");
  };

  menuToggle.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
    mobileMenu.classList.toggle("open", !isOpen);
  });

  mobileMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  /* ---------------------------------------------------------
     Reveal-on-scroll for content sections
  --------------------------------------------------------- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("in-view"));
  }

  /* ---------------------------------------------------------
     Cinematic scroll-controlled hero video
  --------------------------------------------------------- */
  const heroSection = document.getElementById("cinematicHero");
  const video = document.getElementById("heroVideo");
  const keyframesWrap = document.getElementById("heroKeyframes");
  const kfLayerA = document.getElementById("kfLayerA");
  const kfLayerB = document.getElementById("kfLayerB");
  const brandmark = document.querySelector(".hero-brandmark");
  const scrollCue = document.querySelector(".scroll-cue");
  const endVeil = document.getElementById("heroEndVeil");
  const scenes = Array.from(document.querySelectorAll(".hero-scene"));

  let mode = "video"; // "video" | "keyframes"
  let videoReady = false;
  let targetTime = 0;
  let currentTimeSmoothed = 0;
  let rafId = null;
  let isSeeking = false;
  let pendingSeek = false;

  // Ordered narrative keyframe images, evenly mapped across scroll progress 0..1
  const KEYFRAMES = [
    "assets/keyframes/01-bottle-spotlight.png.jpeg",
    "assets/keyframes/02-cap-opening.png.jpeg",
    "assets/keyframes/03-notes-emerging.png.jpeg",
    "assets/keyframes/04-notes-orbiting.png.jpeg",
    "assets/keyframes/05-notes-vertical-spiral.jpeg",
    "assets/keyframes/06-notes-liquid-transition.jpeg",
    "assets/keyframes/07-liquid-entering-bottle.jpeg",
    "assets/keyframes/08-bottle-filled-glow.jpeg",
    "assets/keyframes/09-hand-reaching.jpeg",
    "assets/keyframes/10-bottle-spray.jpeg"
  ];
  let kfPreloaded = false;
  let kfShowingA = true;
  let kfLastIndex = -1;

  // Scene visibility windows as fractions of total scroll progress (0..1)
  const sceneWindows = [
    { el: scenes[0], start: 0.03, end: 0.19 },
    { el: scenes[1], start: 0.2, end: 0.36 },
    { el: scenes[2], start: 0.37, end: 0.53 },
    { el: scenes[3], start: 0.54, end: 0.7 },
    { el: scenes[4], start: 0.71, end: 0.87 }
  ];

  /* ---- Decide up-front whether this device should even attempt video scrubbing ---- */
  function isLikelyWeakDevice() {
    const smallViewport = window.innerWidth <= 760;
    const lowCores = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
    const lowMemory = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
    const saveData = navigator.connection && navigator.connection.saveData;
    return saveData || (smallViewport && (lowCores || lowMemory));
  }

  function preloadKeyframes() {
    if (kfPreloaded) return;
    kfPreloaded = true;
    KEYFRAMES.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }

  function switchToKeyframeMode() {
    if (mode === "keyframes") return;
    mode = "keyframes";
    preloadKeyframes();
    keyframesWrap.classList.add("active");
    video.classList.add("hidden-video");
    video.pause();
  }

  function updateKeyframes(progress) {
    const idx = Math.min(KEYFRAMES.length - 1, Math.floor(progress * KEYFRAMES.length));
    if (idx === kfLastIndex) return;
    kfLastIndex = idx;
    const src = KEYFRAMES[idx];
    if (kfShowingA) {
      kfLayerB.src = src;
      kfLayerB.style.opacity = "1";
      kfLayerA.style.opacity = "0";
    } else {
      kfLayerA.src = src;
      kfLayerA.style.opacity = "1";
      kfLayerB.style.opacity = "0";
    }
    kfShowingA = !kfShowingA;
  }

  if (isLikelyWeakDevice()) {
    switchToKeyframeMode();
  } else if (!video || !video.canPlayType || video.canPlayType("video/mp4") === "") {
    switchToKeyframeMode();
  } else {
    video.addEventListener("loadedmetadata", () => {
      videoReady = true;
    });
    video.addEventListener("seeking", () => { isSeeking = true; });
    video.addEventListener("seeked", () => {
      isSeeking = false;
      if (pendingSeek) {
        pendingSeek = false;
        applySeek();
      }
    });
    video.addEventListener("error", switchToKeyframeMode);

    // Give the browser a window to prove it can actually deliver metadata;
    // if it never does, fall back to the static keyframe sequence instead of a frozen/broken video.
    // (readyState is intentionally NOT checked here — it legitimately dips during
    // active seeking, so using it as an ongoing health check causes false fallbacks.)
    setTimeout(() => {
      if (mode === "video" && !videoReady) {
        switchToKeyframeMode();
      }
    }, 4000);

    video.load();
  }

  function getScrollProgress() {
    const rect = heroSection.getBoundingClientRect();
    const total = heroSection.offsetHeight - window.innerHeight;
    if (total <= 0) return 0;
    const scrolled = -rect.top;
    return Math.min(Math.max(scrolled / total, 0), 1);
  }

  function updateScenes(progress) {
    sceneWindows.forEach(({ el, start, end }) => {
      if (!el) return;
      const visible = progress >= start && progress <= end;
      el.classList.toggle("is-visible", visible);
    });
  }

  function updateBrandAndCue(progress) {
    const introFade = 1 - Math.min(progress / 0.05, 1);
    brandmark.style.opacity = introFade;
    scrollCue.style.opacity = progress > 0.02 ? 0 : 1;
  }

  function updateEndVeil(progress) {
    const veilStart = 0.9;
    if (progress <= veilStart) {
      endVeil.style.opacity = 0;
      return;
    }
    const t = (progress - veilStart) / (1 - veilStart);
    endVeil.style.opacity = String(Math.min(t, 1));
  }

  function onScroll() {
    const progress = getScrollProgress();

    if (mode === "video" && videoReady && video.duration) {
      targetTime = progress * video.duration;
    } else if (mode === "keyframes") {
      updateKeyframes(progress);
    }

    updateScenes(progress);
    updateBrandAndCue(progress);
    updateEndVeil(progress);
  }

  function applySeek() {
    if (isSeeking) {
      pendingSeek = true;
      return;
    }
    try {
      video.currentTime = currentTimeSmoothed;
    } catch (e) {
      /* transient seek errors are safe to ignore */
    }
  }

  function animate() {
    if (mode === "video" && videoReady && video.duration) {
      const diff = targetTime - currentTimeSmoothed;
      // Every frame in the source is a keyframe, so seeks are cheap and near-instant;
      // a moderate smoothing factor keeps motion fluid without lagging behind the scroll.
      const lerp = reduceMotion ? 1 : 0.22;
      if (Math.abs(diff) > 0.006) {
        currentTimeSmoothed += diff * lerp;
        applySeek();
      }
    }
    rafId = requestAnimationFrame(animate);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  onScroll();
  rafId = requestAnimationFrame(animate);

  window.addEventListener("beforeunload", () => {
    if (rafId) cancelAnimationFrame(rafId);
  });

  /* ---------------------------------------------------------
     Footer year
  --------------------------------------------------------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
