(() => {
  const root = document.documentElement;
  const fallbackTheme = "midnight";
  const themeStorageKey = "aa-theme";
  const themeCookieName = "aa-theme";
  const themeCookieMaxAge = 60 * 60 * 24 * 365;
  const knownThemes = [
    "dark",
    "light",
    "slate",
    "midnight",
    "nord",
    "dracula",
    "synthwave",
    "cyberpunk",
    "forest",
    "emerald",
    "ocean",
    "sky",
    "rose",
    "sunset",
    "amber",
    "grape",
    "mono",
    "coffee",
    "solarized",
    "high-contrast",
  ];

  root.classList.add("js-enabled");

  const isTheme = (theme) => knownThemes.includes(theme);
  const normalizeTheme = (theme) => (isTheme(theme) ? theme : fallbackTheme);

  const storedTheme = () => {
    try {
      const theme = localStorage.getItem(themeStorageKey);
      return isTheme(theme) ? theme : null;
    } catch (_) {
      return null;
    }
  };

  const persistTheme = (theme) => {
    try {
      localStorage.setItem(themeStorageKey, theme);
    } catch (_) {}

    document.cookie = `${themeCookieName}=${encodeURIComponent(
      theme,
    )}; Path=/; Max-Age=${themeCookieMaxAge}; SameSite=Lax`;
  };

  const applyTheme = (theme, persist = false) => {
    const next = normalizeTheme(theme);
    root.dataset.theme = next;

    const select = document.getElementById("theme-select");
    if (select instanceof HTMLSelectElement) select.value = next;

    if (persist) persistTheme(next);
    return next;
  };

  const initialTheme = storedTheme() ?? root.dataset.theme ?? fallbackTheme;
  applyTheme(initialTheme, storedTheme() != null);

  const ready = (callback) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  };

  ready(() => {
    initThemePicker();
    initTooltips();
  });

  function initThemePicker() {
    const select = document.getElementById("theme-select");
    if (!(select instanceof HTMLSelectElement)) return;

    applyTheme(storedTheme() ?? root.dataset.theme ?? fallbackTheme);
    select.addEventListener("change", () => applyTheme(select.value, true));
  }

  function initTooltips() {
    const triggers = Array.from(
      document.querySelectorAll(".tooltip[data-tip], .chart-entry[data-tip]"),
    );
    if (triggers.length === 0) return;

    const bubble = document.createElement("div");
    bubble.className = "floating-tooltip";
    bubble.setAttribute("role", "tooltip");
    bubble.hidden = true;
    document.body.appendChild(bubble);

    let active = null;

    const position = () => {
      if (!active) return;

      const rect = active.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const margin = 8;
      const gap = 10;
      let left = rect.left + rect.width / 2 - bubbleRect.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - bubbleRect.width - margin));

      let top = rect.top - bubbleRect.height - gap;
      let placement = "above";
      if (top < margin) {
        top = rect.bottom + gap;
        placement = "below";
      }

      bubble.dataset.placement = placement;
      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
      bubble.style.setProperty("--arrow-left", `${rect.left + rect.width / 2 - left}px`);
    };

    const show = (target) => {
      const text = target.getAttribute("data-tip");
      if (!text) return;

      active = target;
      bubble.textContent = text;
      bubble.hidden = false;
      bubble.classList.remove("visible");
      position();
      requestAnimationFrame(() => bubble.classList.add("visible"));
    };

    const hide = () => {
      active = null;
      bubble.classList.remove("visible");
      window.setTimeout(() => {
        if (!active) bubble.hidden = true;
      }, 120);
    };

    for (const trigger of triggers) {
      trigger.removeAttribute("title");
      for (const child of Array.from(trigger.children)) {
        if (child.tagName.toLowerCase() === "title") child.remove();
      }

      trigger.addEventListener("mouseenter", () => show(trigger));
      trigger.addEventListener("focus", () => show(trigger));
      trigger.addEventListener("mouseleave", hide);
      trigger.addEventListener("blur", hide);
      trigger.addEventListener("mousemove", position);
    }

    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hide();
    });
  }
})();
