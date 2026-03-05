// =========================================================
//  🔧 Match Point Service Worker  v3.0
//  전략: 정적 파일 캐시 우선 / API 네트워크 우선 + 폴백
// =========================================================

const CACHE_NAME = 'mp-v4.0-AI';
const API_CACHE = 'mp-api-v4.0-AI';


// 설치 시 즉시 캐시할 정적 리소스
const STATIC_ASSETS = [
    '/',
    '/static/style.css',
    '/static/app.js',
    '/static/members.js',
    '/static/auth.js',
    '/static/ranking.js',
    '/static/report.js',
    '/static/manifest.json',
    '/static/icons/icon-192.png',
    '/static/icons/icon-512.png',
];

// ── install ──────────────────────────────────────────────
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll(STATIC_ASSETS).catch(err => console.warn('[SW] precache 일부 실패:', err))
        ).then(() => self.skipWaiting())
    );
});

// ── activate: 구버전 캐시 정리 ──────────────────────────
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys
                .filter(k => k !== CACHE_NAME && k !== API_CACHE)
                .map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ── fetch 전략 ───────────────────────────────────────────
self.addEventListener('fetch', (e) => {
    const { request } = e;
    const url = new URL(request.url);

    // 1. Chrome 확장/비 http(s) 무시
    if (!url.protocol.startsWith('http')) return;

    // 2. API 요청 → 네트워크 우선 + 오프라인 폴백
    if (url.pathname.startsWith('/api/')) {
        e.respondWith(networkFirstAPI(request));
        return;
    }

    // 3. 외부 CDN (폰트, chart.js 등) → 네트워크 우선 + 캐시 폴백
    if (!url.hostname.includes('minton-tennis') && !url.hostname.includes('localhost')) {
        e.respondWith(networkFirstCDN(request));
        return;
    }

    // 4. HTML 페이지 (네비게이션) → 항상 네트워크 우선!! (핵심)
    if (request.mode === 'navigate' || request.destination === 'document'
        || url.pathname === '/' || (!url.pathname.includes('.'))) {
        e.respondWith(networkFirstCDN(request));
        return;
    }

    // 5. 정적 에셋 (.js, .css, 이미지 등) → 캐시 우선 + 백그라운드 업데이트
    e.respondWith(cacheFirstWithUpdate(request));
});

// ── 전략 함수들 ───────────────────────────────────────────

/** API: 네트워크 우선, 실패 시 캐시 반환 (오프라인 지원) */
async function networkFirstAPI(request) {
    try {
        const res = await fetchWithTimeout(request, 8000);
        // GET 요청만 캐시
        if (request.method === 'GET' && res.ok) {
            const cache = await caches.open(API_CACHE);
            cache.put(request, res.clone());
        }
        return res;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // 완전 오프라인 폴백
        return new Response(
            JSON.stringify({ error: '오프라인 상태입니다. 캐시된 데이터를 표시합니다.', offline: true }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

/** CDN: 네트워크 우선, 실패 시 캐시 */
async function networkFirstCDN(request) {
    try {
        const res = await fetchWithTimeout(request, 5000);
        if (res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, res.clone());
        }
        return res;
    } catch {
        return caches.match(request) || new Response('', { status: 503 });
    }
}

/** 정적 파일: 캐시 우선 + 백그라운드 업데이트 (stale-while-revalidate) */
async function cacheFirstWithUpdate(request) {
    const cached = await caches.match(request);

    // 백그라운드 업데이트 (캐시 유무와 무관하게 진행)
    const fetchPromise = fetch(request).then(res => {
        if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return res;
    }).catch(() => null);

    // 캐시 있으면 즉시 반환 (백그라운드 업데이트는 계속 진행)
    if (cached) return cached;

    // 캐시 없으면 네트워크 응답 대기
    const networkRes = await fetchPromise;
    return networkRes || new Response(
        '<h1>오프라인</h1><p>네트워크 연결을 확인해주세요.</p>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}


/** 타임아웃 fetch */
function fetchWithTimeout(request, ms) {
    return Promise.race([
        fetch(request),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);
}

// ── Push 알림 (기존 호환) ────────────────────────────────
self.addEventListener('push', (e) => {
    if (!e.data) return;
    const data = e.data.json().catch(() => ({ title: 'Match Point', body: e.data.text() }));
    e.waitUntil(
        data.then(d =>
            self.registration.showNotification(d.title || 'Match Point', {
                body: d.body || '',
                icon: '/static/icons/icon-192.png',
                badge: '/static/icons/icon-192.png',
                data: d.url ? { url: d.url } : undefined,
                vibrate: [100, 50, 100],
                tag: 'mp-notification'
            })
        )
    );
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = e.notification.data?.url || '/';
    e.waitUntil(
        clients.matchAll({ type: 'window' }).then(wcs => {
            const existing = wcs.find(w => w.url === url && 'focus' in w);
            return existing ? existing.focus() : clients.openWindow(url);
        })
    );
});
