/**
 * Capacitor native bridge enhancements for EuskalSoinua.
 * Loaded only inside the Android app shell (not in a regular browser).
 * Adds hardware back-button handling so the app behaves natively.
 */
(function () {
  // Only run inside Capacitor
  if (!window.Capacitor || !window.Capacitor.isNativePlatform?.()) return;

  document.addEventListener("DOMContentLoaded", function () {
    // Hardware back button: close overlays first, then default behavior
    document.addEventListener("backbutton", function (e) {
      // Close now-playing overlay if open
      const nowPlaying = document.querySelector("[data-now-playing]");
      if (nowPlaying && nowPlaying.offsetParent !== null) {
        const closeBtn = nowPlaying.querySelector("button[aria-label='close']");
        if (closeBtn) {
          closeBtn.click();
          e.preventDefault();
          return;
        }
      }
      // Close any open menu/dropdown
      const openMenu = document.querySelector("[data-menu-open]");
      if (openMenu) {
        document.body.click();
        e.preventDefault();
        return;
      }
      // Default: let the app handle it (or exit if on home)
    });
  });
})();
