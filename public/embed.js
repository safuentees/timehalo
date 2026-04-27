(function () {
  if (typeof window === "undefined") return;

  var origin = (function () {
    var current = document.currentScript;
    if (current && current.src) {
      try {
        return new URL(current.src).origin;
      } catch (e) {
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

  mountAll();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAll, { once: true });
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.originator !== "OH") return;
    if (data.type === "size" && typeof data.height === "number") {
      var iframes = document.querySelectorAll(
        "iframe[data-oh-handle='" + (data.handle || "") + "']",
      );
      var targets = iframes.length > 0
        ? iframes
        : document.querySelectorAll("iframe[data-oh-handle]");
      for (var i = 0; i < targets.length; i++) {
        targets[i].style.height = data.height + "px";
      }
    }
  });
})();
