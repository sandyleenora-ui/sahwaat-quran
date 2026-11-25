/* كاش بسيط: التطبيق يفتح من غير نت بعد أول مرة. */
var V = "mushaf-e8fbd98cf1";
var ASSETS = ["./", "./index.html", "./data.json", "./manifest.webmanifest",
              "./icon-192.png", "./icon-512.png", "./icon-512-maskable.png",
              "./apple-touch-icon.png", "./favicon-32.png"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(V).then(function(c){ return c.addAll(ASSETS); })
    .then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.map(function(k){ if(k !== V) return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;
  var url = new URL(req.url);
  /* الصفحة نفسها: نجيب الأحدث من النت الأول عشان التحديثات توصل على طول،
     ولو مفيش نت نرجع للنسخة المحفوظة */
  if(req.mode === "navigate" || url.pathname.replace(/\/$/, "").endsWith("index.html")
     || url.pathname === "/" || url.pathname.endsWith("/sahwaat-quran/")){
    e.respondWith(
      fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(V).then(function(c){ c.put(req, copy).catch(function(){}); });
        }
        return res;
      }).catch(function(){ return caches.match(req).then(function(h){
        return h || caches.match("./index.html") || caches.match("./");
      }); })
    );
    return;
  }
  var own = (url.origin === location.origin);
  var font = /(^|\.)(googleapis|gstatic)\.com$/.test(url.hostname);
  if(!own && !font) return;
  e.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if(res && (res.ok || res.type === "opaque")){
          var copy = res.clone();
          caches.open(V).then(function(c){ c.put(req, copy).catch(function(){}); });
        }
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    })
  );
});
