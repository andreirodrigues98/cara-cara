const CACHE = 'quem-e-classico-v2';
const urls = ['./','./index.html','./css/style.css','./js/game.js','./manifest.webmanifest','./assets/favicon.svg',
'jorge','beto','ana','pedro','paulo','daniel','clara','helio','ricardo','roberto','zeca','luis',
'henrique','chico','joao','marcos','sonia','carlos','maria','tony','fernando','alfredo','lucia','edu'
].map(name => /^(jorge|beto|ana|pedro|paulo|daniel|clara|helio|ricardo|roberto|zeca|luis|henrique|chico|joao|marcos|sonia|carlos|maria|tony|fernando|alfredo|lucia|edu)$/.test(name) ? `./assets/personagens/${name}.webp` : name);
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
