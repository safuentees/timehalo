/**
 * Officehours embed loader (C1).
 *
 * Usage on a third-party site:
 *
 *   <div id="oh-booking" data-handle="alex"></div>
 *   <script src="https://officehours.app/embed.js" defer></script>
 *
 * The script finds every `[data-handle]` element it can resolve,
 * mounts an iframe pointing at /embed/<handle>, and listens for
 * postMessage events to keep the iframe sized to its content. No
 * external dependencies — vanilla JS so the embed loads cleanly on
 * any host page regardless of bundler / framework.
 *
 * Protocol matches src/app/embed/[handle]/embed-frame.tsx —
 * originator: "OH" markers so multiple OH embeds (or one OH + a
 * cal/calendly embed) coexist without crossing wires.
 */
(function () {
  if (typeof window === "undefined") return;

  // Resolve the script's origin from its own src so the embed URL
  // matches the page that served the loader. Falls back to
  // window.origin when the script is inlined.
  var origin = (function () {
    var current = document.currentScript;
    if (current && current.src) {
      try {
        return new URL(current.src).origin;
      } catch (e) {
        // ignore
      }
    }
    return window.location.origin;
  })();

  function mount(host) {
    var handle = host.getAttribute("data-handle");
    if (!handle) return;
    if (host.__ohMounted) return;
    host.__ohMounted = true;

    var iframe = document.createElement("iframe");
    iframe.src = origin + "/embed/" + encodeURIComponent(handle);
    iframe.style.width = "100%";
    iframe.style.border = "0";
    iframe.style.display = "block";
    // Initial height — postMessage from the iframe will replace
    // this once the embed-frame React component mounts.
    iframe.style.height = "640px";
    iframe.allow = "fullscreen";
    iframe.title = "Book a slot with " + handle;
    iframe.setAttribute("data-oh-handle", handle);
    host.appendChild(iframe);
  }

  function mountAll() {
    var hosts = document.querySelectorAll("[data-handle]:not([data-oh-mounted])");
    for (var i = 0; i < hosts.length; i++) {
      mount(hosts[i]);
    }
  }

  // Initial pass when the script loads + a re-scan on DOMContentLoaded
  // so consumers can place the script in <head> safely.
  mountAll();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAll, { once: true });
  }

  // Resize the right iframe when its child posts a size update.
  // We match by data-oh-handle on the iframe element.
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.originator !== "OH") return;
    if (data.type === "size" && typeof data.height === "number") {
      var iframes = document.querySelectorAll(
        "iframe[data-oh-handle='" + (data.handle || "") + "']",
      );
      // When `handle` isn't on the message (older protocol), update
      // every OH iframe — safe because the height is consistent.
      var targets = iframes.length > 0
        ? iframes
        : document.querySelectorAll("iframe[data-oh-handle]");
      for (var i = 0; i < targets.length; i++) {
        targets[i].style.height = data.height + "px";
      }
    }
    // Future: handle data.type === "booked" to fire host-supplied
    // analytics callbacks (window.OH = { onBooked: function ... }).
  });
})();
