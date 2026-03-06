import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-pages'
import tournaments from './routes/tournaments'
import participants from './routes/participants'
import events from './routes/events'
import matches from './routes/matches'
import brackets from './routes/brackets'
import notifications from './routes/notifications'
import live from './routes/live'
import watch from './routes/watch'
import members from './routes/members'
import auth from './routes/auth'
import rankings from './routes/rankings'
import payments from './routes/payments'
import venues from './routes/venues'
import orgs from './routes/orgs'
import clubs from './routes/clubs'
import schedule from './routes/schedule'
import ai from './routes/ai'
import dashboardHtml from './dashboard.html?raw'
import courtHtml from './pages/court.html?raw'
import tHtml from './pages/t.html?raw'
import boardHtml from './pages/board.html?raw'
import myHtml from './pages/my.html?raw'
import timelineHtml from './pages/timeline.html?raw'
import printHtml from './pages/print.html?raw'
import { requireAuth } from './middleware/auth'

type Bindings = { DB: D1Database; AI: any; JWT_SECRET: string, TOSS_SECRET_KEY: string }
const app = new Hono<{ Bindings: Bindings }>()

// Static files
app.use('/static/*', serveStatic())
app.get('/sw.js', serveStatic())

// API routes
app.route('/api/auth', auth)
app.route('/api/tournaments', tournaments)
app.route('/api/live', live)
app.route('/api/watch', watch)
app.route('/api/members', members)
app.route('/api/rankings', rankings)
app.route('/api/payments', payments)
app.route('/api/orgs', orgs)
app.route('/api/clubs', clubs)
app.basePath('/api/tournaments').route('/', participants)
app.basePath('/api/tournaments').route('/', events)
app.basePath('/api/tournaments').route('/', matches)
app.basePath('/api/tournaments').route('/', brackets)
app.basePath('/api/tournaments').route('/', notifications)
app.basePath('/api/tournaments').route('/', venues)
app.basePath('/api/tournaments').route('/', schedule)
app.route('/api/ai', ai)
app.basePath('/api/ai').route('/', ai)

// Health check
app.get('/api/health', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT 1 as ok').all()
    return c.json({ status: 'ok', db_check: results })
  } catch (e) {
    return c.json({ status: 'error', message: (e as Error).message }, 500)
  }
})

// ==================== HTML Pages ====================
const commonHead = `
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
<link rel="stylesheet" href="/static/style.css?v=20260304c">
<link rel="stylesheet" href="/static/theme-override.css?v=20260304c">
`
const renderSWAndEnd = () => `
  <!-- Service Worker 등록 -->
  <script>
    if ('serviceWorker' in navigator) {
      const SW_VERSION = 'v3.7';
      const swKey = 'mp-sw-ver';

      window.addEventListener('load', async () => {
        // 구 버전 SW가 있으면 해제 + 캐시 전삭
        const savedVer = localStorage.getItem(swKey);
        if (savedVer && savedVer !== SW_VERSION) {
          console.log('[PWA] SW 업그레이드:', savedVer, '->', SW_VERSION);
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
          const keys = await caches.keys();
          for (const k of keys) await caches.delete(k);
          localStorage.setItem(swKey, SW_VERSION);
          location.reload();
          return;
        }
        localStorage.setItem(swKey, SW_VERSION);

        // 새 SW 등록
        navigator.serviceWorker.register('/sw.js')
          .then(reg => {
            reg.addEventListener('updatefound', () => {
              const nw = reg.installing;
              nw?.addEventListener('statechange', () => {
                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                  setTimeout(() => {
                    if (typeof showToast === 'function')
                      showToast('🔄 새 버전이 있습니다. 새로고침하면 업데이트됩니다.', 'warning');
                  }, 1000);
                }
              });
            });
          })
          .catch(e => console.warn('[PWA] SW 등록 실패:', e));
      });
    }
    // 설치 프롬프트 캡처
    let _deferredInstall = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferredInstall = e;
      const banner = document.getElementById('pwaInstallBanner');
      if (banner) banner.style.display = 'flex';
    });
    document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
      if (!_deferredInstall) return;
      _deferredInstall.prompt();
      const { outcome } = await _deferredInstall.userChoice;
      if (outcome === 'accepted') {
        document.getElementById('pwaInstallBanner').style.display = 'none';
      }
      _deferredInstall = null;
    });
    window.addEventListener('appinstalled', () => {
      document.getElementById('pwaInstallBanner').style.display = 'none';
      setTimeout(() => {
        if (typeof showToast === 'function') showToast('🎉 Match Point 앱이 설치되었습니다!');
      }, 500);
    });
  </script>
</body>
</html>
`

// Main admin SPA
app.get('/', (c) => {
  const baseUrl = 'https://minton-tennis.pages.dev'
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  ${commonHead}
  <title>Match Point — 스포츠 대회 운영 솔루션</title>
  <meta name="description" content="배드민턴·테니스 대회를 스마트하게 운영하세요. 실시간 점수, 대진표 자동 생성, 참가자 관리, 갤럭시 워치 연동까지 — 완전 무료.">
  <meta name="keywords" content="배드민턴대회,테니스대회,대회운영,스포츠토너먼트,점수판,대진표">
  <link rel="canonical" href="${baseUrl}/">
  <!-- Google Fonts: Kinetic Brutalism -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@300;400;500;600;700&family=Barlow+Condensed:ital,wght@0,400;0,700;0,900;1,700;1,900&display=swap" rel="stylesheet">
  <!-- PWA -->
  <link rel="manifest" href="/static/manifest.json">
  <meta name="theme-color" content="#0A0A0A">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Match Point">
  <link rel="apple-touch-icon" href="/static/icons/icon-192.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/static/icons/icon-192.png">
  <!-- Open Graph -->
  <meta property="og:type"        content="website">
  <meta property="og:url"         content="${baseUrl}/">
  <meta property="og:title"       content="Match Point — 스포츠 대회 운영 솔루션">
  <meta property="og:description" content="배드민턴·테니스 대회를 스마트하게 운영하세요. 실시간 점수, 대진표 자동 생성, 완전 무료.">
  <meta property="og:image"       content="${baseUrl}/static/og-image.png">
  <meta property="og:locale"      content="ko_KR">
  <meta property="og:site_name"   content="Match Point">
  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="Match Point — 스포츠 대회 운영 솔루션">
  <meta name="twitter:description" content="배드민턴·테니스 대회 운영 플랫폼. 무료로 시작하세요.">
  <meta name="twitter:image"       content="${baseUrl}/static/og-image.png">
  <!-- JSON-LD -->
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Match Point",
    "url": baseUrl,
    "description": "스포츠 대회 운영을 위한 통합 관리 플랫폼",
    "applicationCategory": "SportsApplication",
    "operatingSystem": "Web",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "KRW" }
  })}</script>
</head>
<body>
  <div id="app"></div>
  <!-- PWA 설치 배너 -->
  <div id="pwaInstallBanner" style="display:none;position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.15);padding:16px 20px;align-items:center;gap:12px;max-width:340px;width:calc(100% - 40px);border:1px solid rgba(249,115,22,0.2);">
    <img src="/static/icons/icon-192.png" width="44" height="44" style="border-radius:10px;flex-shrink:0;" alt="icon">
    <div style="flex:1;min-width:0;">
      <div style="font-weight:800;font-size:0.9rem;color:#0f172a;">Match Point 앱 설치</div>
      <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">홈화면에 추가하면 앱처럼 사용!</div>
    </div>
    <button id="pwaInstallBtn" style="background:linear-gradient(135deg,#f97316,#8b5cf6);color:#fff;border:none;border-radius:12px;padding:8px 14px;font-weight:700;font-size:0.82rem;cursor:pointer;white-space:nowrap;">설치</button>
    <button onclick="document.getElementById('pwaInstallBanner').style.display='none'" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:1.2rem;padding:4px;">✕</button>
  </div>
  <!-- CDN: defer로 메인 스크립트 차단 않음 -->
  <script src="https://js.tosspayments.com/v1/payment-widget"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js" defer></script>
  <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js" defer></script>
  
  <script>
    // System Config Injection
    window.MP_CONFIG = {
      tenantSlug: null
    };
  </script>

  <!-- Script Resources -->
  <script src="/static/app.js?v=20260306_AI"></script>
  <script src="/static/members.js?v=20260306_AI"></script>
  <script src="/static/auth.js?v=20260306_AI"></script>
  <script src="/static/ranking.js?v=20260306_AI"></script>
  <script src="/static/report.js?v=20260306_AI"></script>
  <script src="/static/ai_dashboard.js?v=20260306_AI"></script>
  <script src="/static/broadcast.js?v=20260306_AI"></script>
${renderSWAndEnd()}
`)
})

// Tenant-specific SPA
app.get('/org/:slug', async (c) => {
  const slug = c.req.param('slug')
  const baseUrl = 'https://minton-tennis.pages.dev'

  // DB에서 단체 정보 조회
  const org = await c.env.DB.prepare('SELECT * FROM organizations WHERE slug = ?').bind(slug).first() as any
  if (!org) return c.html(`<!DOCTYPE html><html><body style="background:#0A0A0A;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;"><h1>존재하지 않는 단체입니다.</h1></body></html>`, 404)

  const orgName = org.name || slug
  const sportType = org.sport_type || 'badminton'
  const sportLabel = sportType === 'tennis' ? '테니스' : '배드민턴'
  const heroImg = sportType === 'tennis' ? '/static/img/hero_tennis.png' : '/static/img/hero_badminton.png'
  const themeColor = org.theme_color || '#C8FF00'
  const orgLevel = org.org_level || 'club'
  const levelLabels: Record<string, string> = { club: '클럽', city_assoc: '시/구 협회', province_assoc: '도 협회', national: '체육회' }
  const levelLabel = levelLabels[orgLevel] || '단체'
  const region = org.region || ''

  // site_config 파싱
  let sc: any = {}
  try { sc = JSON.parse(org.site_config || '{}') } catch (e) { }
  const heroTitle = sc.hero_title || orgName
  const heroSub = (sc.hero_subtitle || `함께 뛰고, 함께 성장하는 ${sportLabel} 커뮤니티.\n당신의 시작을 응원합니다.`).replace(/\n/g, '<br>')
  const ctaPrimary = sc.hero_cta_primary || '가입 신청하기'
  const ctaSecondary = sc.hero_cta_secondary || '일정 보기'
  const showSchedule = sc.show_schedule !== false
  const showNotice = sc.show_notice !== false
  const showJoinForm = sc.show_join_form !== false
  const showAbout = sc.show_about === true
  const aboutTitle = sc.about_title || '소개'
  const aboutText = (sc.about_text || '').replace(/\n/g, '<br>')
  const contactPhone = sc.contact_phone || ''
  const contactAddr = sc.contact_address || ''
  const contactEmail = sc.contact_email || ''
  const snsInsta = sc.sns_instagram || ''
  const snsBlog = sc.sns_blog || ''
  const snsYoutube = sc.sns_youtube || ''
  const footerText = sc.footer_text || ''

  // 최근 일정
  let schedulesHtml = ''
  if (showSchedule) {
    try {
      const { results: schedules } = await c.env.DB.prepare(`SELECT * FROM schedules WHERE org_id = ? ORDER BY start_time DESC LIMIT 5`).bind(org.id).all() as any
      schedulesHtml = (schedules || []).map((s: any) => {
        const d = new Date(s.start_time)
        return `<div class="os-card"><div class="os-date">${d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</div><div class="os-info"><strong>${s.title}</strong><span>${s.location || ''}</span></div></div>`
      }).join('')
    } catch (e) { }
  }

  // 최근 공지
  let noticesHtml = ''
  if (showNotice) {
    try {
      const { results: posts } = await c.env.DB.prepare(`SELECT p.*, b.name as board_name FROM org_posts p JOIN org_boards b ON p.board_id = b.id WHERE p.org_id = ? ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT 5`).bind(org.id).all() as any
      noticesHtml = (posts || []).map((p: any) => {
        return `<div class="os-notice"><span class="os-ntag">${p.is_pinned ? '📌' : '💬'}</span><strong>${p.title}</strong><span class="os-ndate">${new Date(p.created_at).toLocaleDateString()}</span></div>`
      }).join('')
    } catch (e) { }
  }

  // 회원 수
  let memberCount = 0
  try {
    const mc = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM org_members WHERE org_id = ? AND status = ?').bind(org.id, 'active').first() as any
    memberCount = mc?.cnt || 0
  } catch (e) { }

  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${orgName} — ${levelLabel} | Match Point</title>
  <meta name="description" content="${orgName} 공식 홈페이지. ${sportLabel} ${levelLabel}. 일정, 공지사항, 가입안내를 확인하세요.">
  <meta property="og:title" content="${orgName} — ${levelLabel}">
  <meta property="og:description" content="${sportLabel} ${levelLabel} 공식 홈페이지">
  <meta property="og:image" content="${baseUrl}${heroImg}">
  <meta property="og:url" content="${baseUrl}/org/${slug}">
  <link rel="canonical" href="${baseUrl}/org/${slug}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+KR:wght@300;400;500;700;900&family=Barlow+Condensed:wght@400;700;900&display=swap" rel="stylesheet">
  <meta name="theme-color" content="#0A0A0A">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    :root{--accent:${themeColor};--bg:#0A0A0A;--card:#111;--border:#1E1E1E;--text:#F5F5F5;--muted:#888}
    body{font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);overflow-x:hidden}
    a{color:var(--accent);text-decoration:none}

    /* Hero */
    .hero{position:relative;height:100vh;min-height:600px;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .hero-bg{position:absolute;inset:0;background:url('${heroImg}') center/cover no-repeat}
    .hero-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,10,10,0.3) 0%,rgba(10,10,10,0.7) 50%,rgba(10,10,10,0.95) 100%)}
    .hero-content{position:relative;z-index:2;text-align:center;padding:0 20px;max-width:800px}
    .hero-badge{display:inline-block;background:rgba(255,255,255,0.08);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);padding:6px 20px;border-radius:50px;font-size:0.85rem;font-weight:500;color:var(--muted);margin-bottom:24px;letter-spacing:0.05em}
    .hero-badge span{color:var(--accent);font-weight:700}
    .hero-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(3rem,10vw,7rem);line-height:0.95;letter-spacing:-0.02em;color:#fff;margin-bottom:16px;text-shadow:0 4px 30px rgba(0,0,0,0.5)}
    .hero-title em{font-style:normal;color:var(--accent)}
    .hero-sub{font-size:clamp(1rem,2.5vw,1.3rem);color:rgba(255,255,255,0.7);font-weight:300;line-height:1.6;margin-bottom:32px}
    .hero-cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
    .btn-primary{background:var(--accent);color:#0A0A0A;padding:14px 36px;border:none;border-radius:50px;font-size:1rem;font-weight:800;cursor:pointer;transition:all 0.3s;font-family:'Noto Sans KR',sans-serif;letter-spacing:-0.02em}
    .btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 30px ${themeColor}44}
    .btn-outline{background:transparent;color:#fff;padding:14px 36px;border:1px solid rgba(255,255,255,0.2);border-radius:50px;font-size:1rem;font-weight:600;cursor:pointer;transition:all 0.3s;font-family:'Noto Sans KR',sans-serif}
    .btn-outline:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-2px)}

    /* Stats Bar */
    .stats-bar{display:flex;justify-content:center;gap:clamp(20px,5vw,60px);padding:40px 20px;border-bottom:1px solid var(--border)}
    .stat-item{text-align:center}
    .stat-num{font-family:'Bebas Neue',sans-serif;font-size:clamp(2rem,5vw,3.5rem);color:var(--accent);line-height:1}
    .stat-label{font-size:0.85rem;color:var(--muted);margin-top:4px;font-weight:400}

    /* Section */
    .section{max-width:1100px;margin:0 auto;padding:80px 20px}
    .section-label{font-family:'Barlow Condensed',sans-serif;font-size:0.85rem;font-weight:700;color:var(--accent);letter-spacing:0.15em;text-transform:uppercase;margin-bottom:8px}
    .section-title{font-size:clamp(1.5rem,4vw,2.5rem);font-weight:900;color:#fff;margin-bottom:12px;letter-spacing:-0.03em}
    .section-desc{font-size:1rem;color:var(--muted);max-width:600px;line-height:1.7;margin-bottom:40px}

    /* Schedule Cards */
    .os-card{display:flex;align-items:center;gap:16px;padding:16px 20px;background:var(--card);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;transition:all 0.2s}
    .os-card:hover{border-color:var(--accent);transform:translateX(4px)}
    .os-date{font-family:'Bebas Neue',sans-serif;font-size:1.3rem;color:var(--accent);white-space:nowrap;min-width:60px}
    .os-info{display:flex;flex-direction:column;gap:2px}
    .os-info strong{font-size:0.95rem;color:#fff}
    .os-info span{font-size:0.8rem;color:var(--muted)}

    /* Notices */
    .os-notice{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border);transition:all 0.2s}
    .os-notice:hover{background:rgba(255,255,255,0.02);padding-left:28px}
    .os-ntag{font-size:1rem}
    .os-notice strong{flex:1;font-size:0.92rem;font-weight:500}
    .os-ndate{font-size:0.8rem;color:var(--muted);white-space:nowrap}

    /* CTA Section */
    .cta-section{background:linear-gradient(135deg,#111 0%,#1a1a2e 100%);border-top:1px solid var(--border);border-bottom:1px solid var(--border);text-align:center;padding:80px 20px}
    .cta-title{font-size:clamp(1.5rem,4vw,2.2rem);font-weight:900;color:#fff;margin-bottom:12px}
    .cta-desc{color:var(--muted);margin-bottom:30px;font-size:1rem}

    /* Join Form */
    .join-form{max-width:500px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
    .join-form input,.join-form select{background:#1a1a1a;border:1px solid #333;color:#fff;padding:14px 18px;border-radius:10px;font-size:0.95rem;font-family:'Noto Sans KR',sans-serif;transition:border 0.2s}
    .join-form input:focus,.join-form select:focus{outline:none;border-color:var(--accent)}
    .join-form button{background:var(--accent);color:#0A0A0A;padding:16px;border:none;border-radius:10px;font-size:1rem;font-weight:800;cursor:pointer;transition:all 0.3s;font-family:'Noto Sans KR',sans-serif}
    .join-form button:hover{box-shadow:0 6px 25px ${themeColor}44;transform:translateY(-2px)}

    /* Footer */
    .org-footer{background:#080808;border-top:1px solid var(--border);padding:40px 20px;text-align:center}
    .org-footer img{height:20px;margin-bottom:12px;opacity:0.4}
    .org-footer p{font-size:0.8rem;color:#555;line-height:1.8}
    .org-footer a{color:var(--accent)}

    /* Scroll animation */
    .fade-up{opacity:0;transform:translateY(30px);transition:opacity 0.7s,transform 0.7s}
    .fade-up.visible{opacity:1;transform:none}

    /* Responsive */
    @media(max-width:768px){
      .hero{min-height:500px}
      .stats-bar{flex-wrap:wrap}
      .os-card{flex-direction:column;align-items:flex-start;gap:8px}
    }

    /* Nav */
    .org-nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;transition:all 0.3s}
    .org-nav.scrolled{background:rgba(10,10,10,0.95);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.05)}
    .org-nav-logo{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:1.3rem;color:#fff;letter-spacing:0.05em}
    .org-nav-links{display:flex;gap:24px;font-size:0.85rem}
    .org-nav-links a{color:rgba(255,255,255,0.6);transition:color 0.2s;font-weight:500}
    .org-nav-links a:hover{color:var(--accent)}
  </style>
</head>
<body>
  <!-- Navigation -->
  <nav class="org-nav" id="orgNav">
    <a class="org-nav-logo" href="/org/${slug}">${orgName}</a>
    <div class="org-nav-links">
      <a href="#schedule">일정</a>
      <a href="#notice">공지</a>
      <a href="#join">가입</a>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-bg"></div>
    <div class="hero-overlay"></div>
    <div class="hero-content">
      <div class="hero-badge">${sportLabel} <span>${levelLabel}</span>${region ? ' · ' + region : ''}</div>
      <h1 class="hero-title">${heroTitle.split(' ').map((w: string, i: number) => i === 0 ? `<em>${w}</em>` : w).join(' ')}</h1>
      <p class="hero-sub">${heroSub}</p>
      <div class="hero-cta">
        ${showJoinForm ? `<a href="#join"><button class="btn-primary">${ctaPrimary}</button></a>` : ''}
        ${showSchedule ? `<a href="#schedule"><button class="btn-outline">${ctaSecondary}</button></a>` : ''}
      </div>
    </div>
  </section>

  <!-- Stats -->
  <div class="stats-bar">
    <div class="stat-item"><div class="stat-num">${memberCount}+</div><div class="stat-label">등록 회원</div></div>
    <div class="stat-item"><div class="stat-num">${sportLabel.charAt(0)}</div><div class="stat-label">${sportType === 'tennis' ? '테니스' : '배드민턴'}</div></div>
    <div class="stat-item"><div class="stat-num">${new Date().getFullYear()}</div><div class="stat-label">설립</div></div>
    <div class="stat-item"><div class="stat-num">PRO</div><div class="stat-label">Match Point</div></div>
  </div>

  ${showAbout ? `
  <!-- About Section -->
  <section class="section fade-up" id="about">
    <div class="section-label">About</div>
    <h2 class="section-title">${aboutTitle}</h2>
    <div style="color:var(--muted);line-height:1.8;font-size:1rem;max-width:800px;">${aboutText || '단체 소개가 아직 작성되지 않았습니다.'}</div>
    ${contactPhone || contactAddr || contactEmail ? `
    <div style="margin-top:30px;display:flex;gap:24px;flex-wrap:wrap;font-size:0.9rem;color:var(--muted);">
      ${contactPhone ? `<span>📞 ${contactPhone}</span>` : ''}
      ${contactEmail ? `<span>📧 ${contactEmail}</span>` : ''}
      ${contactAddr ? `<span>📍 ${contactAddr}</span>` : ''}
    </div>` : ''}
    ${snsInsta || snsBlog || snsYoutube ? `
    <div style="margin-top:16px;display:flex;gap:16px;">
      ${snsInsta ? `<a href="${snsInsta}" target="_blank" style="color:var(--accent);font-size:0.85rem;">Instagram</a>` : ''}
      ${snsBlog ? `<a href="${snsBlog}" target="_blank" style="color:var(--accent);font-size:0.85rem;">Blog</a>` : ''}
      ${snsYoutube ? `<a href="${snsYoutube}" target="_blank" style="color:var(--accent);font-size:0.85rem;">YouTube</a>` : ''}
    </div>` : ''}
  </section>
  ` : ''}

  ${showSchedule ? `
  <!-- Schedule Section -->
  <section class="section fade-up" id="schedule">
    <div class="section-label">Schedule</div>
    <h2 class="section-title">다가오는 일정</h2>
    <p class="section-desc">정기 모임, 대회, 훈련 등의 일정을 확인하세요.</p>
    ${schedulesHtml || '<div style="color:var(--muted);padding:40px;text-align:center;background:var(--card);border-radius:12px;">등록된 일정이 없습니다.</div>'}
  </section>` : ''}

  ${showNotice ? `
  <!-- Notice Section -->
  <section class="section fade-up" id="notice" style="padding-top:40px">
    <div class="section-label">Announcements</div>
    <h2 class="section-title">공지사항</h2>
    <p class="section-desc">단체의 주요 소식과 알림을 전해드립니다.</p>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden;">
      ${noticesHtml || '<div style="color:var(--muted);padding:40px;text-align:center;">등록된 공지가 없습니다.</div>'}
    </div>
  </section>` : ''}

  ${showJoinForm ? `
  <!-- CTA Join Section -->
  <section class="cta-section fade-up" id="join">
    <div class="section-label">Join Us</div>
    <h2 class="cta-title">지금 회원이 되어보세요</h2>
    <p class="cta-desc">아래 양식을 작성하시면 관리자가 확인 후 연락드립니다.</p>
    <div class="join-form" id="joinForm">
      <input type="text" id="jfName" placeholder="이름" required>
      <input type="tel" id="jfPhone" placeholder="연락처 (010-0000-0000)">
      <select id="jfGender"><option value="">성별 선택</option><option value="M">남성</option><option value="F">여성</option></select>
      <input type="text" id="jfMessage" placeholder="하고 싶은 말 (선택사항)">
      <button onclick="submitJoinRequest()">🚀 ${ctaPrimary}</button>
      <p style="font-size:0.75rem;color:var(--muted);margin-top:8px;">제출된 정보는 가입 심사 외 다른 용도로 사용되지 않습니다.</p>
    </div>
  </section>` : ''}

  <!-- Footer -->
  <footer class="org-footer">
    <p style="margin-bottom:8px;"><strong style="color:var(--accent)">${orgName}</strong></p>
    ${footerText ? `<p style="color:#777;margin-bottom:8px;">${footerText}</p>` : ''}
    <p>Powered by <a href="/" target="_blank">Match Point</a> — 스포츠 대회 운영 플랫폼</p>
    <p style="margin-top:4px;">&copy; ${new Date().getFullYear()} All Rights Reserved.</p>
  </footer>

  <script>
    window.addEventListener('scroll',()=>{
      document.getElementById('orgNav').classList.toggle('scrolled',window.scrollY>50)
    });
    const obs=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')})},{threshold:0.1});
    document.querySelectorAll('.fade-up').forEach(el=>obs.observe(el));
    document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',e=>{e.preventDefault();const t=document.querySelector(a.getAttribute('href'));if(t)t.scrollIntoView({behavior:'smooth'})})});
    function submitJoinRequest(){
      const name=document.getElementById('jfName').value.trim();
      if(!name){alert('이름을 입력해주세요.');return}
      alert(name+'님, 가입 신청이 완료되었습니다!\\n관리자 확인 후 연락드리겠습니다.');
      document.querySelectorAll('.join-form input,.join-form select').forEach(el=>el.value='');
    }
  </script>
</body>
</html>`)
})

// ── 공개 대회 결과 페이지 (SSR — 구글 크롤링 가능) ────────────
// URL: /r/:id  (예: /r/42)
// 소셜 공유 시 og:title/description 자동 세팅
app.get('/r/:id', async (c) => {
  const id = c.req.param('id')
  const base = 'https://minton-tennis.pages.dev'

  const t = await c.env.DB.prepare(
    'SELECT * FROM tournaments WHERE id = ? AND deleted = 0'
  ).bind(id).first() as any
  if (!t) return c.notFound()

  // 순위 데이터
  const { results: standings } = await c.env.DB.prepare(`
    SELECT s.*, t2.team_name,
    p1.name AS p1_name, p1.level AS p1_level, p1.club AS p1_club,
    p2.name AS p2_name, p2.level AS p2_level, p2.club AS p2_club,
    e.name AS event_name
    FROM standings s
    JOIN teams  t2  ON s.team_id = t2.id
    JOIN events e   ON s.event_id = e.id
    JOIN participants p1 ON t2.player1_id = p1.id
    JOIN participants p2 ON t2.player2_id = p2.id
    WHERE t2.tournament_id = ?
    ORDER BY s.event_id, t2.group_num, s.points DESC, s.goal_difference DESC
    `).bind(id).all() as any

  // 이벤트별 그룹핑
  const byEvent: Record<string, any[]> = {}
  for (const row of standings) {
    const key = row.event_name || '기타'
    if (!byEvent[key]) byEvent[key] = []
    byEvent[key].push(row)
  }

  const sport = t.sport_type === 'tennis' ? '🎾 테니스' : '🏸 배드민턴'
  const status = { draft: '준비중', open: '모집중', in_progress: '진행중', completed: '완료', cancelled: '취소' }[t.status as string] || t.status
  const title = `${t.name} — 대회 결과`
  const desc = `${sport} ${t.name} 대회 결과.종목별 순위와 전적을 확인하세요.`
  const shareUrl = `${base} /r/${id} `

  const medalIcon = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1} 위`

  const standingsHtml = Object.entries(byEvent).map(([evtName, rows]) => `
    < section class="rp-event" >
      <h2 class="rp-event-title">${evtName}</h2>
      <div class="rp-table-wrap">
        <table class="rp-table">
          <thead><tr><th>순위</th><th>팀 / 선수</th><th>클럽</th><th>전적</th><th>점수</th></tr></thead>
          <tbody>
            ${rows.slice(0, 16).map((r, i) => `
              <tr class="${i < 3 ? 'rp-top' : ''}">
                <td class="rp-rank">${medalIcon(i)}</td>
                <td class="rp-team">
                  <strong>${r.p1_name}</strong>
                  ${r.p2_name !== r.p1_name ? ` <span class="rp-partner">· ${r.p2_name}</span>` : ''}
                </td>
                <td class="rp-club">${r.p1_club || '-'}</td>
                <td class="rp-record">${r.wins}승 ${r.losses}패</td>
                <td class="rp-pts">${r.points}점</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section >
    `).join('')

  return c.html(`< !DOCTYPE html >
    <html lang="ko">
      <head>
        <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <meta name="description" content="${desc}">
              <link rel="canonical" href="${shareUrl}">
                <!-- OG -->
                <meta property="og:type" content="article">
                  <meta property="og:url" content="${shareUrl}">
                    <meta property="og:title" content="${title}">
                      <meta property="og:description" content="${desc}">
                        <meta property="og:site_name" content="Match Point">
                          <!-- Twitter -->
                          <meta name="twitter:card" content="summary">
                            <meta name="twitter:title" content="${title}">
                              <meta name="twitter:description" content="${desc}">
                                <!-- JSON-LD -->
                                <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "name": t.name,
    "url": shareUrl,
    "description": desc,
    "sport": t.sport_type === 'tennis' ? 'Tennis' : 'Badminton',
    "eventStatus": t.status === 'completed' ? 'https://schema.org/EventScheduled' : 'https://schema.org/EventScheduled'
  })}</script>
                                <link rel="preconnect" href="https://fonts.googleapis.com">
                                  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                                    <style>
                                      *{box - sizing:border-box;margin:0;padding:0}
                                      body{font - family:'Inter',sans-serif;background:#f8fafc;color:#0f172a;min-height:100vh}
                                      .rp-nav{background:#fff;border-bottom:1px solid #e2e8f0;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
                                      .rp-logo{font - weight:900;font-size:1rem;color:#f97316;text-decoration:none}
                                      .rp-back{font - size:0.85rem;color:#64748b;text-decoration:none;border:1px solid #e2e8f0;padding:6px 14px;border-radius:20px}
                                      .rp-hero{background:linear-gradient(135deg,#f97316,#8b5cf6);padding:48px 20px 40px;text-align:center;color:#fff}
                                      .rp-hero h1{font - size:clamp(1.6rem,4vw,2.8rem);font-weight:900;margin-bottom:12px;line-height:1.2}
                                      .rp-hero .rp-meta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:16px}
                                      .rp-hero .rp-badge{background:rgba(255,255,255,0.2);padding:6px 14px;border-radius:20px;font-size:0.85rem;font-weight:600}
                                      .rp-share{display:flex;gap:8px;justify-content:center;margin-top:20px;flex-wrap:wrap}
                                      .rp-share a{background:rgba(255,255,255,0.15);color:#fff;padding:8px 18px;border-radius:20px;text-decoration:none;font-size:0.85rem;font-weight:600;border:1px solid rgba(255,255,255,0.3);transition:background 0.2s}
                                      .rp-share a:hover{background:rgba(255,255,255,0.3)}
                                      .rp-body{max - width:900px;margin:0 auto;padding:32px 16px 60px}
                                      .rp-event{background:#fff;border-radius:20px;padding:28px;margin-bottom:24px;box-shadow:0 4px 20px rgba(0,0,0,0.04)}
                                      .rp-event-title{font - size:1.15rem;font-weight:800;color:#0f172a;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #f1f5f9}
                                      .rp-table-wrap{overflow - x:auto}
                                      .rp-table{width:100%;border-collapse:collapse;font-size:0.9rem}
                                      .rp-table th{background:#f8fafc;padding:10px 12px;text-align:left;font-size:0.8rem;font-weight:700;color:#64748b;border-bottom:2px solid #e2e8f0}
                                      .rp-table td{padding:11px 12px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
                                      .rp-top{background:rgba(249,115,22,0.03)}
                                      .rp-rank{font - size:1.1rem;min-width:48px}
                                      .rp-team strong{font - weight:700}
                                      .rp-partner{color:#94a3b8;font-size:0.85rem}
                                      .rp-club{color:#64748b;font-size:0.85rem}
                                      .rp-record{font - weight:600;color:#334155}
                                      .rp-pts{font - weight:800;color:#f97316}
                                      .rp-empty{text - align:center;padding:40px;color:#94a3b8}
                                      .rp-footer{text - align:center;padding:40px 20px;color:#94a3b8;font-size:0.85rem}
                                      .rp-footer a{color:#f97316;text-decoration:none;font-weight:700}
                                      @media(max-width:600px){.rp - club{display:none}.rp-table th:nth-child(3){display:none}}
                                    </style>
                                  </head>
                                  <body>
                                    <nav class="rp-nav">
                                      <a href="/" class="rp-logo">🏆 Match Point</a>
                                      <a href="/" class="rp-back">← 홈으로</a>
                                    </nav>

                                    <header class="rp-hero">
                                      <h1>${t.name}</h1>
                                      <div class="rp-meta">
                                        <span class="rp-badge">${sport}</span>
                                        <span class="rp-badge">${status}</span>
                                        ${t.date ? `<span class="rp-badge">📅 ${t.date}</span>` : ''}
                                        <span class="rp-badge">🏟️ ${t.courts || 2}코트</span>
                                      </div>
                                      <div class="rp-share">
                                        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener">📘 Facebook 공유</a>
                                        <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(title)}" target="_blank" rel="noopener">🐦 Twitter 공유</a>
                                        <a href="https://api.kakaolink.sdk.kakao.com" onclick="if(navigator.share){navigator.share({title:'${title}',url:'${shareUrl}'});return false;}">📤 공유하기</a>
                                      </div>
                                    </header>

                                    <main class="rp-body">
                                      ${standingsHtml || '<div class="rp-empty">📊 아직 순위 데이터가 없습니다.</div>'}
                                    </main>

                                    <footer class="rp-footer">
                                      <p>이 대회는 <a href="/">Match Point</a>로 운영되었습니다.</p>
                                      <p style="margin-top:8px"><a href="/">나도 무료로 대회 개설하기 →</a></p>
                                    </footer>
                                  </body>
                                </html>`)
})

// ── Sitemap XML ─────────────────────────────────────────────
app.get('/sitemap.xml', async (c) => {
  try {
    const base = 'https://minton-tennis.pages.dev'
    const { results: trns } = await c.env.DB.prepare(
      "SELECT id, updated_at FROM tournaments WHERE deleted = 0 AND status IN ('completed','in_progress') ORDER BY updated_at DESC LIMIT 100"
    ).all() as any

    const urls = [
      `<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...trns.map((t: any) =>
        `<url><loc>${base}/r/${t.id}</loc><lastmod>${(t.updated_at || new Date().toISOString()).slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`
      )
    ].join('\n  ')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
                                <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                                  ${urls}
                                </urlset>`

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=UTF-8'
      }
    })
  } catch (error) {
    return c.text('Error generating sitemap', 500)
  }
})

// ── HTML Sitemap ──────────────────────────────────────────────
app.get('/sitemap', async (c) => {
  try {
    const { results: trns } = await c.env.DB.prepare(
      "SELECT id, name, sport_type, created_at, status FROM tournaments WHERE deleted = 0 ORDER BY created_at DESC LIMIT 100"
    ).all() as any

    const trnListHtml = trns.map((t: any) => {
      const isTennis = t.sport_type === 'tennis'
      const icon = isTennis ? '🎾' : '🏸'
      const badgeText = t.status === 'in_progress' ? '<span style="color:#22c55e;font-size:0.75rem;font-weight:700;padding:2px 6px;background:rgba(34,197,94,0.1);border-radius:10px;margin-left:8px;">진행중</span>' : (t.status === 'completed' ? '<span style="color:#64748b;font-size:0.75rem;font-weight:700;padding:2px 6px;background:#f1f5f9;border-radius:10px;margin-left:8px;">종료</span>' : '');

      return `<a href="/t?tid=${t.id}" style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; background:rgba(255,255,255,0.7); border-radius:16px; text-decoration:none; color:#1e293b; margin-bottom:12px; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border:1px solid rgba(0,0,0,0.03);" onmouseover="this.style.background='#fff'; this.style.transform='translateY(-3px)'; this.style.boxShadow='0 10px 25px -5px rgba(0,0,0,0.05)'" onmouseout="this.style.background='rgba(255,255,255,0.7)'; this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                                  <div style="font-weight:800; font-size:1.15rem; display:flex; align-items:center;">
                                    <span style="font-size:1.4rem; margin-right:8px;">${icon}</span> ${t.name} ${badgeText}
                                  </div>
                                  <div style="display:flex; align-items:center; gap:16px;">
                                    <div style="color:#64748b; font-size:0.9rem; font-weight:600;">${(t.created_at || '').slice(0, 10)}</div>
                                    <span style="color:#e2e8f0;">❯</span>
                                  </div>
                                </a>`
    }).join('')

    return c.html(`<!DOCTYPE html>
                                <html lang="ko">
                                  <head>
                                    ${commonHead}
                                    <title>🗺️ 사이트맵 & 대회 디렉토리</title>
                                    <meta name="description" content="MATCH POINT 시스템 사이트맵 및 전체 대회 검색">
                                      <style>
                                        body {background: #f8fafc; font-family: 'Pretendard', sans-serif; margin: 0; padding: 0; color: #0f172a; min-height: 100vh; }
                                        .header-bg {background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 60px 20px 80px; color: #fff; text-align: center; position: relative; overflow: hidden; }
                                        .header-bg::after {content:''; position:absolute; bottom:-50px; left:-10%; width:120%; height:100px; background:#f8fafc; transform:rotate(-2deg); }
                                        .container {max - width: 900px; margin: -50px auto 60px; padding: 0 20px; position: relative; z-index: 10; }
                                        .card {background: rgba(255,255,255,0.85); backdrop-filter: blur(20px); border-radius: 32px; padding: 50px; box-shadow: 0 20px 50px rgba(0,0,0,0.05); border: 1px solid rgba(255,255,255,1); }
                                        .section-title {font - size: 1.5rem; font-weight: 800; color: #0f172a; margin-bottom: 24px; display: flex; align-items: center; gap: 10px; }
                                        .nav-grid {display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 50px; }
                                        .nav-grid a {background: #fff; padding: 24px; border-radius: 20px; text-decoration: none; color: #334155; font-weight: 800; font-size: 1.1rem; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; transition: all 0.3s; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
                                        .nav-grid a:hover {transform: translateY(-5px); box-shadow: 0 15px 30px rgba(14, 165, 233, 0.1); border-color: #e0f2fe; color: #0ea5e9; }
                                        .nav-grid a span {font - size: 2.5rem; transition: transform 0.3s; }
                                        .nav-grid a:hover span {transform: scale(1.1); }
                                      </style>
                                  </head>
                                  <body>
                                    <div class="header-bg">
                                      <span style="display:inline-block; padding:6px 14px; background:rgba(255,255,255,0.1); border-radius:20px; font-weight:700; font-size:0.85rem; margin-bottom:16px;">사이트맵 / 디렉토리</span>
                                      <h1 style="margin:0; font-size:3rem; font-weight:900; letter-spacing:-1px;">MATCH POINT 🗺️</h1>
                                      <p style="color:#94a3b8; font-size:1.1rem; margin-top:16px; font-weight:500;">전체 시스템 메뉴 및 역대 대회 목록을 한눈에 살펴보세요</p>
                                    </div>
                                    <div class="container">
                                      <div class="card">
                                        <div class="section-title"><span style="font-size:1.8rem;">🧭</span> 빠른 글로벌 메뉴</div>
                                        <div class="nav-grid">
                                          <a href="/"><span>🏠</span> 메인 홈</a>
                                          <a href="/court"><span>🏟️</span> 코트 점수판</a>
                                          <a href="/dashboard"><span>📊</span> 라이브 대시보드</a>
                                        </div>

                                        <div class="section-title" style="margin-top:20px;"><span style="font-size:1.8rem;">📋</span> 전체 대회 디렉토리</div>
                                        <div style="background:#f1f5f9; padding:2px; border-radius:20px; margin-bottom:20px; display:inline-flex;">
                                          <!-- Placeholder for search/filter if needed -->
                                          <span style="padding:10px 20px; font-size:0.9rem; font-weight:700; color:#64748b;">등록된 전체 대회 리스트 (최신순)</span>
                                        </div>

                                        ${trns.length > 0 ? trnListHtml : '<div style="padding:60px; text-align:center; color:#94a3b8; background:#f8fafc; border-radius:24px; font-weight:600; font-size:1.1rem; border:2px dashed #e2e8f0;">개설된 대회가 없습니다. 새로 개설해 보세요!</div>'}

                                        <div style="text-align:center; margin-top:50px; padding-top:40px; border-top:1px solid #e2e8f0;">
                                          <button onclick="history.back()" style="padding:14px 32px; background:#fff; color:#475569; border:1px solid #cbd5e1; border-radius:16px; font-weight:800; font-size:1rem; cursor:pointer; transition:all 0.2s; box-shadow:0 4px 6px rgba(0,0,0,0.02);" onmouseover="this.style.background='#f8fafc'; this.style.borderColor='#94a3b8'; this.style.color='#0f172a'" onmouseout="this.style.background='#fff'; this.style.borderColor='#cbd5e1'; this.style.color='#475569'">← 이전 화면으로 돌아가기</button>
                                        </div>
                                      </div>
                                    </div>
                                  </body>
                                </html>`)
  } catch (error) {
    return c.text('Error generating sitemap page', 500)
  }
})

// ── robots.txt ──────────────────────────────────────────────
app.get('/robots.txt', (c) => {
  c.header('Content-Type', 'text/plain')
  return c.body(`User-agent: *
                                Allow: /
                                Allow: /r/
                                Disallow: /api/
                                Sitemap: https://minton-tennis.pages.dev/sitemap.xml`)
})

// Court scoreboard
app.get('/court', (c) => {
  return c.html(courtHtml.replace(/\$\{commonHead\}/g, commonHead))
})

// Public Tournament Portal (대회 정보 포털)
app.get('/t', (c) => {
  return c.html(tHtml.replace(/\$\{commonHead\}/g, commonHead))
})

// Large Scoreboard (대형 전광판)
app.get('/board', (c) => {
  return c.html(boardHtml.replace(/\$\{commonHead\}/g, commonHead))
})

// Dashboard (self-contained HTML - no app.js dependency)
app.get('/dashboard', (c) => {
  return c.html(dashboardHtml)
})
// My matches (participant)
app.get('/my', (c) => {
  return c.html(myHtml.replace(/\$\{commonHead\}/g, commonHead))
})

// Timeline
app.get('/timeline', (c) => {
  return c.html(timelineHtml.replace(/\$\{commonHead\}/g, commonHead))
})

// Print center
app.get('/print', (c) => {
  return c.html(printHtml.replace(/\$\{commonHead\}/g, commonHead))
})

// 📡 OBS Streaming Overlay (투명 배경 오버레이)
app.get('/overlay', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📡 Match Point — Streaming Overlay</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: transparent;
      font-family: 'Inter', sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }

    /* === 하단 스코어 바 === */
    .score-bar {
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: stretch;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
      min-width: 700px;
      max-width: 900px;
      opacity: 0;
      animation: slideUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards;
    }
    @keyframes slideUp {
      from { transform: translateX(-50%) translateY(40px); opacity: 0; }
      to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }

    .team-panel {
      flex: 1;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .team-left { background: linear-gradient(135deg, #1e40af, #1d4ed8); }
    .team-right { background: linear-gradient(135deg, #dc2626, #b91c1c); }

    .team-name {
      font-size: 1.1rem;
      font-weight: 800;
      color: #ffffff;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .team-left .team-name { text-align: right; }

    .score-display {
      font-size: 2.8rem;
      font-weight: 900;
      color: #ffffff;
      text-shadow: 0 2px 8px rgba(0,0,0,0.3);
      min-width: 50px;
      text-align: center;
      line-height: 1;
    }

    .vs-divider {
      width: 60px;
      background: linear-gradient(180deg, #0f172a, #1e293b);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      flex-shrink: 0;
    }
    .vs-text { font-size: 0.7rem; font-weight: 900; color: #94a3b8; letter-spacing: 2px; }
    .vs-court { font-size: 0.65rem; font-weight: 700; color: #f97316; }
    .vs-event { font-size: 0.6rem; color: #64748b; }

    /* === 서브 인디케이터 === */
    .serve-dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
      animation: pulse-dot 1.5s infinite;
      flex-shrink: 0;
    }
    @keyframes pulse-dot { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

    /* === 상단 정보 바 === */
    .info-bar {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(15,23,42,0.85);
      backdrop-filter: blur(12px);
      border-radius: 12px;
      padding: 8px 18px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      opacity: 0;
      animation: fadeIn 0.8s 0.3s forwards;
    }
    @keyframes fadeIn { to { opacity: 1; } }
    .info-item { font-size: 0.78rem; color: #94a3b8; font-weight: 600; }
    .info-highlight { color: #f97316; font-weight: 800; }
    .info-live {
      display: flex; align-items: center; gap: 4px;
      font-size: 0.75rem; font-weight: 800; color: #ef4444;
    }
    .info-live-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #ef4444;
      animation: pulse-dot 1s infinite;
    }

    /* === 승률 바 === */
    .predict-bar {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(15,23,42,0.7);
      backdrop-filter: blur(8px);
      border-radius: 10px;
      padding: 6px 14px;
      min-width: 400px;
      opacity: 0;
      animation: fadeIn 1s 0.6s forwards;
    }
    .predict-label { font-size: 0.7rem; color: #94a3b8; font-weight: 700; flex-shrink: 0; }
    .predict-track { flex: 1; height: 6px; border-radius: 3px; overflow: hidden; display: flex; background: #334155; }
    .predict-fill-left { height: 100%; background: #3b82f6; transition: width 1s; }
    .predict-fill-right { height: 100%; background: #ef4444; transition: width 1s; }
    .predict-pct { font-size: 0.72rem; font-weight: 800; min-width: 36px; text-align: center; }
    .predict-pct-left { color: #60a5fa; }
    .predict-pct-right { color: #f87171; }

    /* === 대기 화면 === */
    .waiting {
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15,23,42,0.8);
      backdrop-filter: blur(12px);
      border-radius: 16px;
      padding: 16px 32px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.4);
    }
    .waiting-text { font-size: 1rem; font-weight: 700; color: #94a3b8; }
    .waiting-court { font-size: 1.2rem; font-weight: 900; color: #f97316; }

    /* === 경기 완료 === */
    .finished {
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, rgba(16,185,129,0.9), rgba(5,150,105,0.9));
      backdrop-filter: blur(12px);
      border-radius: 16px;
      padding: 16px 40px;
      text-align: center;
      box-shadow: 0 8px 40px rgba(16,185,129,0.3);
    }
    .finished-title { font-size: 1.3rem; font-weight: 900; color: #fff; margin-bottom: 4px; }
    .finished-winner { font-size: 1rem; font-weight: 700; color: rgba(255,255,255,0.9); }
  </style>
</head>
<body>
  <div id="overlay-app"></div>

  <script>
    'use strict';
    const params = new URLSearchParams(location.search);
    const tid = params.get('tid');
    const courtNum = params.get('court');
    const position = params.get('pos') || 'bottom'; // bottom | top
    let matchData = null;
    let tInfo = null;

    async function fetchData() {
      if (!tid || !courtNum) return;
      try {
        const [courtRes, tRes] = await Promise.all([
          fetch('/api/tournaments/' + tid + '/court/' + courtNum),
          fetch('/api/tournaments/' + tid)
        ]);
        if (courtRes.ok) {
          const data = await courtRes.json();
          matchData = data.current || null;
        }
        if (tRes.ok) tInfo = await tRes.json();
        renderOverlay();
      } catch (e) { console.error(e); }
    }

    function renderOverlay() {
      const app = document.getElementById('overlay-app');
      if (!matchData) {
        app.innerHTML = '<div class="waiting"><span class="waiting-court">코트 ' + (courtNum || '?') + '</span><span class="waiting-text">대기 중</span></div>';
        return;
      }

      const m = matchData;
      const t1 = m.team1_name || '팀1';
      const t2 = m.team2_name || '팀2';
      const s1 = m.team1_set1 || 0;
      const s2 = m.team2_set1 || 0;
      const isTennis = tInfo?.sport_type === 'tennis';
      const eventName = m.event_name || '';

      if (m.status === 'completed') {
        const winner = m.winner_team === 1 ? t1 : t2;
        app.innerHTML = '<div class="finished"><div class="finished-title">🏆 경기 종료</div><div class="finished-winner">' + winner + ' 승리 (' + s1 + ' : ' + s2 + ')</div></div>';
        return;
      }

      // 승률 예측 (간이 계산)
      const total = s1 + s2 || 1;
      const p1Pct = Math.round((s1 / total) * 100) || 50;
      const p2Pct = 100 - p1Pct;

      const sportIcon = isTennis ? '🎾' : '🏸';
      const setInfo = isTennis ? ' · 게임 ' + (m.team1_set2 || 0) + '-' + (m.team2_set2 || 0) : '';

      app.innerHTML = \`
        <div class="info-bar">
          <div class="info-live"><div class="info-live-dot"></div>LIVE</div>
          <div class="info-item">\${sportIcon} \${tInfo?.name || '대회'}</div>
          <div class="info-item">코트 <span class="info-highlight">\${courtNum}</span></div>
          <div class="info-item">\${eventName}\${setInfo}</div>
        </div>

        <div class="score-bar">
          <div class="team-panel team-left">
            <div class="team-name">\${t1}</div>
            <div class="score-display">\${s1}</div>
          </div>

          <div class="vs-divider">
            <div class="vs-text">VS</div>
            <div class="vs-court">C\${courtNum}</div>
            <div class="vs-event">R\${m.round || 0}</div>
          </div>

          <div class="team-panel team-right">
            <div class="score-display">\${s2}</div>
            <div class="team-name">\${t2}</div>
          </div>
        </div>

        <div class="predict-bar">
          <span class="predict-pct predict-pct-left">\${p1Pct}%</span>
          <div class="predict-track">
            <div class="predict-fill-left" style="width:\${p1Pct}%"></div>
            <div class="predict-fill-right" style="width:\${p2Pct}%"></div>
          </div>
          <span class="predict-pct predict-pct-right">\${p2Pct}%</span>
        </div>
      \`;
    }

    // WebSocket 실시간 업데이트
    function connectWS() {
      if (!tid) return;
      try {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(proto + '//' + location.host + '/api/live/' + tid);
        ws.onmessage = () => fetchData();
        ws.onclose = () => setTimeout(connectWS, 5000);
      } catch (e) {}
    }

    // Init
    fetchData();
    setInterval(fetchData, 5000);
    connectWS();
  </script>
</body>
</html>`)
})

// ⌚ Smartwatch Score UI
app.get('/watch', (c) => {
  const params = new URLSearchParams(c.req.url.split('?')[1] || '')
  const tid = params.get('tid') || '1'
  const court = params.get('court') || '1'
  return c.html(`<!DOCTYPE html>
                                <html lang="ko">
                                  <head>
                                    <meta charset="utf-8">
                                      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                                        <title>⌚ 코트 ${court} 점수판</title>
                                        <meta name="apple-mobile-web-app-capable" content="yes">
                                          <meta name="theme-color" content="#0f172a">
                                            <style>
                                              * {box - sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
                                              body {background: #0f172a; color: #f8fafc; font-family: -apple-system, 'Pretendard', sans-serif;
                                              min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center;
           padding: 12px; user-select: none; }
                                              #court-badge {font - size: 0.7rem; letter-spacing: 3px; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
                                              #status-dot {width: 8px; height: 8px; border-radius: 50%; background: #ef4444; display: inline-block; margin-right: 4px; animation: pulse 1.5s infinite; }
                                              @keyframes pulse {0 %, 100 % { opacity: 1 } 50%{opacity:0.3} }
                                              #match-info {font - size: 0.65rem; color: #64748b; text-align: center; margin-bottom: 14px; min-height: 16px; }
                                              .team-block {width: 100%; max-width: 320px; background: #1e293b; border-radius: 20px; padding: 16px 20px;
                  display: flex; align-items: center; justify-content: space-between; margin: 6px 0; gap: 8px; }
                                              .team-block.t1 {border - left: 4px solid #3b82f6; }
                                              .team-block.t2 {border - left: 4px solid #ef4444; }
                                              .team-name {font - size: 0.85rem; font-weight: 700; color: #cbd5e1; flex: 1;
                 overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; }
                                              .score-display {font - size: 3.2rem; font-weight: 900; min-width: 64px; text-align: center; line-height: 1; }
                                              .t1 .score-display {color: #60a5fa; }
                                              .t2 .score-display {color: #f87171; }
                                              .btn-group {display: flex; flex-direction: column; gap: 4px; }
                                              .score-btn {width: 44px; height: 36px; border: none; border-radius: 10px; font-weight: 900;
                 font-size: 1.1rem; cursor: pointer; transition: transform 0.1s, opacity 0.1s; }
                                              .score-btn:active {transform: scale(0.92); opacity: 0.8; }
                                              .btn-plus  {background: #22c55e; color: #fff; }
                                              .btn-minus {background: #334155; color: #94a3b8; font-size: 0.9rem; }
                                              #set-tabs {display: flex; gap: 6px; margin-bottom: 10px; }
                                              .set-tab {padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; font-weight: 700;
               border: 1px solid #334155; background: transparent; color: #64748b; cursor: pointer; }
                                              .set-tab.active {background: #f97316; border-color: #f97316; color: #fff; }
                                              #msg {font - size: 0.72rem; color: #94a3b8; margin-top: 10px; min-height: 18px; text-align: center; }
                                              #no-match {text - align: center; padding: 20px; color: #64748b; }
                                              #no-match .icon {font - size: 3rem; margin-bottom: 8px; }
                                              #complete-btn {margin - top: 14px; width: 100%; max-width: 320px; padding: 14px; background: #7c3aed;
                                              color: #fff; border: none; border-radius: 16px; font-weight: 700; font-size: 0.95rem;
                    cursor: pointer; }
                                            </style>
                                          </head>
                                          <body>
                                            <div style="position:absolute;top:12px;right:12px;">
                                              <button onclick="if(!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen();" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#94a3b8;border-radius:6px;padding:4px 8px;font-size:0.75rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;"><span style="font-size:0.9rem;">⛶</span></button>
                                            </div>
                                            <div id="court-badge">⌚ COURT <span id="courtNum">${court}</span></div>
                                            <div id="match-info">불러오는 중...</div>

                                            <div id="set-tabs">
                                              <button class="set-tab active" onclick="setActiveSet(1)">1게임</button>
                                              <button class="set-tab" onclick="setActiveSet(2)">2게임</button>
                                              <button class="set-tab" onclick="setActiveSet(3)">3게임</button>
                                            </div>

                                            <div id="score-ui">
                                              <div class="team-block t1">
                                                <div class="team-name" id="t1name">—</div>
                                                <div class="score-display" id="t1score">0</div>
                                                <div class="btn-group">
                                                  <button class="score-btn btn-plus" onclick="updateScore(1,'+1')">+1</button>
                                                  <button class="score-btn btn-minus" onclick="updateScore(1,'-1')">−1</button>
                                                </div>
                                              </div>
                                              <div style="text-align:center;color:#475569;font-size:0.75rem;margin:4px 0"><span id="status-dot"></span>LIVE</div>
                                              <div class="team-block t2">
                                                <div class="team-name" id="t2name">—</div>
                                                <div class="score-display" id="t2score">0</div>
                                                <div class="btn-group">
                                                  <button class="score-btn btn-plus" onclick="updateScore(2,'+1')">+1</button>
                                                  <button class="score-btn btn-minus" onclick="updateScore(2,'-1')">−1</button>
                                                </div>
                                              </div>
                                            </div>

                                            <div id="no-match" style="display:none">
                                              <div class="icon">⏸️</div>
                                              <div>현재 진행 중인 경기가 없습니다</div>
                                              <div style="font-size:0.72rem;margin-top:6px;color:#475569">경기가 시작되면 자동으로 표시됩니다</div>
                                            </div>

                                            <button id="complete-btn" onclick="completeMatch()" style="display:none">✅ 경기 종료</button>
                                            <div id="msg"></div>

                                            <script>
                                              const tid = '${tid}';
                                              const courtNum = '${court}';
                                              let matchId = null;
                                              let activeSet = 1;
                                              let pollTimer;

                                              function setActiveSet(n) {
                                                activeSet = n;
      document.querySelectorAll('.set-tab').forEach((el,i) => el.classList.toggle('active', i+1===n));
      fetch('/api/watch/' + tid + '/court/' + courtNum + '?set=' + n).then(r=>r.json()).then(updateUI).catch(()=>{ });
    }

                                              function updateUI(data) {
      if (data.error) {
                                                document.getElementById('score-ui').style.display = 'none';
                                              document.getElementById('no-match').style.display = 'block';
                                              document.getElementById('complete-btn').style.display = 'none';
                                              document.getElementById('match-info').textContent = '';
                                              matchId = null;
                                              return;
      }
                                              matchId = data.match_id;
                                              document.getElementById('score-ui').style.display = 'block';
                                              document.getElementById('no-match').style.display = 'none';
                                              document.getElementById('complete-btn').style.display = 'block';
                                              document.getElementById('t1name').textContent = (data.t1?.name || '팀 1').substring(0, 12);
                                              document.getElementById('t2name').textContent = (data.t2?.name || '팀 2').substring(0, 12);
                                              document.getElementById('t1score').textContent = data.t1?.score ?? 0;
                                              document.getElementById('t2score').textContent = data.t2?.score ?? 0;
                                              const sport = data.sport_type || 'badminton';
                                              const isBad = sport === 'badminton';
                                              document.getElementById('match-info').textContent =
                                              (isBad ? '🏸 배드민턴' : '🎾 테니스') + ' | ' + data.current_set + '게임 진행중 | R' + (data.round||'') + '-' + (data.match_order||'');
      // Update tab labels
      document.querySelectorAll('.set-tab').forEach((el,i) =>
                                              el.textContent = isBad ? (i+1)+'게임' : (i+1)+'세트');
    }

                                              async function updateScore(team, action) {
      if (!matchId) {setMsg('진행중인 경기 없음'); return; }
                                              try {
        const r = await fetch('/api/watch/' + tid + '/match/' + matchId + '/score', {
                                                method: 'POST',
                                              headers: {'Content-Type':'application/json'},
                                              body: JSON.stringify({team, action, set: activeSet })
        });
                                              const d = await r.json();
                                              if (d.success) {
          const el = document.getElementById('t' + team + 'score');
                                              el.textContent = d.new_score;
                                              el.style.transform = 'scale(1.3)';
          setTimeout(() => el.style.transform = '', 150);
                                              setMsg(action === '+1' ? '✅ +1 점' : '↩ 취소');
        } else {setMsg('오류: ' + (d.error || '알수없음')); }
      } catch(e) {setMsg('네트워크 오류'); }
    }

                                              async function completeMatch() {
      if (!matchId || !confirm('경기를 종료하시겠습니까?')) return;
                                              try {
                                                await fetch('/api/watch/' + tid + '/match/' + matchId + '/status', {
                                                  method: 'POST',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({ status: 'completed' })
                                                });
                                              setMsg('✅ 경기 종료 처리됨');
                                              matchId = null;
                                              setTimeout(poll, 2000);
      } catch(e) {setMsg('오류 발생'); }
    }

                                              function setMsg(m) {
      const el = document.getElementById('msg');
                                              el.textContent = m;
      setTimeout(() => { if (el.textContent === m) el.textContent = ''; }, 2500);
    }

                                              async function poll() {
      try {
        const r = await fetch('/api/watch/' + tid + '/court/' + courtNum + '?set=' + activeSet);
                                              const d = await r.json();
                                              updateUI(d);
      } catch(e) { /* network error, keep trying */}
    }

                                              poll();
                                              pollTimer = setInterval(poll, 3000);
                                            </script>
                                          </body>
                                        </html>`)
})

// ── 참가자 셀프 등록 페이지 (SSR) ──────────────────────────
// URL: /join/:id  (예: /join/42)
// 운영자가 이 링크를 공유하면 참가자가 직접 등록 가능
app.get('/join/:id', async (c) => {
  const id = c.req.param('id')
  const base = 'https://minton-tennis.pages.dev'

  const t = await c.env.DB.prepare(
    'SELECT * FROM tournaments WHERE id = ? AND deleted = 0'
  ).bind(id).first() as any
  if (!t) return c.notFound()

  // 현재 참가자 수
  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM participants WHERE tournament_id = ? AND deleted = 0'
  ).bind(id).first() as any
  const currentCount = countRow?.cnt || 0

  const sport = t.sport_type === 'tennis' ? '🎾 테니스' : '🏸 배드민턴'
  const sportType = t.sport_type || 'badminton'
  const themeColor = t.theme_color || '#f97316'
  const title = `${t.name} — 참가 신청`
  const desc = `${sport} ${t.name} 대회에 참가 신청하세요!`

  // 배드민턴/테니스에 따른 레벨 옵션
  const levelOptions = sportType === 'tennis'
    ? `<option value="">선택</option><option value="S">S (국가대표급)</option><option value="A">A (선수출신)</option><option value="B">B (상급)</option><option value="C">C (중급)</option><option value="D">D (초중급)</option><option value="E">E (초급)</option>`
    : `<option value="">선택</option><option value="S">S (전/현직 선수)</option><option value="A">A (상급)</option><option value="B">B (중상급)</option><option value="C">C (중급)</option><option value="D">D (초중급)</option><option value="E">E (초급)</option>`

  return c.html(`<!DOCTYPE html>
                                        <html lang="ko">
                                          <head>
                                            <meta charset="UTF-8">
                                              <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                                ${commonHead}
                                                <title>${title}</title>
                                                <meta name="description" content="${desc}">
                                                  <meta property="og:type" content="website">
                                                    <meta property="og:url" content="${base}/join/${id}">
                                                      <meta property="og:title" content="${title}">
                                                        <meta property="og:description" content="${desc}">
                                                          <meta property="og:image" content="${base}/static/og-image.png">
                                                            <meta property="og:locale" content="ko_KR">
                                                              <style>
                                                                * {margin:0; padding:0; box-sizing:border-box; }
                                                                body {
                                                                  font - family: 'Pretendard','Inter',system-ui,sans-serif;
                                                                background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                                                                min-height: 100vh; color: #e2e8f0;
                                                                display: flex; justify-content: center; align-items: flex-start;
                                                                padding: 20px;
    }
                                                                .container {
                                                                  max - width: 480px; width: 100%; margin: 20px auto;
    }
                                                                .card {
                                                                  background: rgba(255,255,255,0.05);
                                                                backdrop-filter: blur(20px);
                                                                border: 1px solid rgba(255,255,255,0.1);
                                                                border-radius: 24px; padding: 32px; margin-bottom: 20px;
    }
                                                                .header {text - align: center; margin-bottom: 24px; }
                                                                .header .sport {font - size: 2.5rem; margin-bottom: 8px; }
                                                                .header h1 {
                                                                  font - size: 1.4rem; font-weight: 800; color: #fff;
                                                                margin-bottom: 4px; word-break: keep-all;
    }
                                                                .header .desc {font - size: 0.85rem; color: #94a3b8; }
                                                                .header .count {
                                                                  display: inline-block; margin-top: 12px;
                                                                padding: 6px 16px; border-radius: 20px;
                                                                background: rgba(249,115,22,0.15); color: #fb923c;
                                                                font-size: 0.85rem; font-weight: 600;
    }

                                                                .form-group {margin - bottom: 16px; }
                                                                .form-group label {
                                                                  display: block; font-size: 0.8rem; font-weight: 600;
                                                                color: #94a3b8; margin-bottom: 6px; letter-spacing: 0.5px;
    }
                                                                .form-group label .req {color: #f87171; }
                                                                .form-control {
                                                                  width: 100%; padding: 12px 16px; border-radius: 12px;
                                                                border: 1px solid rgba(255,255,255,0.15);
                                                                background: rgba(255,255,255,0.07); color: #fff;
                                                                font-size: 0.95rem; font-family: inherit;
                                                                transition: all 0.2s;
    }
                                                                .form-control:focus {
                                                                  outline: none; border-color: ${themeColor};
                                                                box-shadow: 0 0 0 3px ${themeColor}33;
    }
                                                                .form-control::placeholder {color: #475569; }
                                                                select.form-control {cursor: pointer; }
                                                                select.form-control option {background: #1e293b; color: #e2e8f0; }

                                                                .form-row {display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

                                                                .btn-submit {
                                                                  width: 100%; padding: 14px; border: none; border-radius: 14px;
                                                                background: linear-gradient(135deg, #f97316, #8b5cf6);
                                                                color: #fff; font-size: 1rem; font-weight: 700;
                                                                cursor: pointer; font-family: inherit;
                                                                transition: all 0.3s; margin-top: 8px;
    }
                                                                .btn-submit:hover {transform: translateY(-2px); box-shadow: 0 8px 25px rgba(249,115,22,0.4); }
                                                                .btn-submit:active {transform: translateY(0); }
                                                                .btn-submit:disabled {
                                                                  opacity: 0.5; cursor: not-allowed; transform: none !important;
                                                                box-shadow: none !important;
    }

                                                                .success-card {
                                                                  display: none; text-align: center; padding: 40px 32px;
    }
                                                                .success-card .icon {font - size: 4rem; margin-bottom: 16px; }
                                                                .success-card h2 {font - size: 1.3rem; font-weight: 800; color: #fff; margin-bottom: 8px; }
                                                                .success-card p {color: #94a3b8; font-size: 0.9rem; line-height: 1.6; }
                                                                .success-card .home-link {
                                                                  display: inline-block; margin-top: 20px;
                                                                padding: 10px 24px; border-radius: 12px;
                                                                background: rgba(255,255,255,0.1); color: #fff;
                                                                text-decoration: none; font-weight: 600; font-size: 0.9rem;
    }

                                                                .footer {text - align: center; color: #475569; font-size: 0.75rem; margin-top: 16px; }
                                                                .footer a {color: #64748b; text-decoration: none; }

                                                                .toast {
                                                                  position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                                                                padding: 12px 24px; border-radius: 12px;
                                                                background: #dc2626; color: #fff; font-size: 0.85rem; font-weight: 600;
                                                                display: none; z-index: 999; box-shadow: 0 8px 20px rgba(0,0,0,0.3);
    }
                                                                .toast.show {display: block; animation: fadeIn 0.3s; }
                                                                @keyframes fadeIn {from {opacity:0; transform:translateX(-50%) translateY(-10px); } to {opacity:1; transform:translateX(-50%) translateY(0); } }
                                                              </style>
                                                            </head>
                                                            <body>
                                                              <div class="container">
                                                                <!-- 신청 폼 -->
                                                                <div class="card" id="formCard">
                                                                  <div class="header">
                                                                    <div class="sport">${sportType === 'tennis' ? '🎾' : '🏸'}</div>
                                                                    <h1>${t.name}</h1>
                                                                    <p class="desc">${t.description || '참가 신청 페이지'}</p>
                                                                    <div class="count">현재 ${currentCount}명 신청 완료</div>
                                                                  </div>

                                                                  <form id="joinForm" onsubmit="submitForm(event)">
                                                                    <div class="form-group">
                                                                      <label>이름 <span class="req">*</span></label>
                                                                      <input class="form-control" id="jName" placeholder="홍길동" required>
                                                                    </div>

                                                                    <div class="form-group">
                                                                      <label>전화번호 <span class="req">*</span></label>
                                                                      <input class="form-control" id="jPhone" placeholder="010-1234-5678" type="tel">
                                                                    </div>

                                                                    <div class="form-row">
                                                                      <div class="form-group">
                                                                        <label>성별 <span class="req">*</span></label>
                                                                        <select class="form-control" id="jGender" required>
                                                                          <option value="">선택</option>
                                                                          <option value="m">남성</option>
                                                                          <option value="f">여성</option>
                                                                        </select>
                                                                      </div>
                                                                      <div class="form-group">
                                                                        <label>출생연도 <span class="req">*</span></label>
                                                                        <input class="form-control" id="jBirth" type="number" placeholder="1990" min="1940" max="2015" required>
                                                                      </div>
                                                                    </div>

                                                                    <div class="form-row">
                                                                      <div class="form-group">
                                                                        <label>레벨 <span class="req">*</span></label>
                                                                        <select class="form-control" id="jLevel" required>
                                                                          ${levelOptions}
                                                                        </select>
                                                                      </div>
                                                                      <div class="form-group">
                                                                        <label>소속 클럽</label>
                                                                        <input class="form-control" id="jClub" placeholder="클럽명 (선택)">
                                                                      </div>
                                                                    </div>

                                                                    <div class="form-group">
                                                                      <label>복식 파트너 (있을 경우)</label>
                                                                      <input class="form-control" id="jPartner" placeholder="파트너 이름 (선택)">
                                                                    </div>
                                                                  </form>

                                                                  <div id="payment-widget-container" style="display:none; margin-top:20px; transition:all 0.3s; opacity:0; pointer-events:none;">
                                                                    <h3 style="font-size:1rem; font-weight:700; color:#fff; margin-bottom:12px; border-top:1px dashed rgba(255,255,255,0.1); padding-top:20px; text-align:center;">💳 참가비 결제 (${(t.participation_fee || 0).toLocaleString()}원)</h3>
                                                                    <div style="background:#fff; border-radius:12px; overflow:hidden;">
                                                                      <div id="payment-method"></div>
                                                                      <div id="agreement"></div>
                                                                    </div>
                                                                    <button type="button" class="btn-submit" id="btnPayment" style="background:#3182f6; display:none; margin-top:16px;">
                                                                      결제하기
                                                                    </button>
                                                                  </div>

                                                                  <button type="submit" class="btn-submit" id="submitBtn">
                                                                    ✅ 참가 신청하기
                                                                  </button>
                                                                </div>

                                                                <!-- 성공 화면 -->
                                                                <div class="card success-card" id="successCard">
                                                                  <div class="icon">🎉</div>
                                                                  <h2 id="successTitle">참가 신청 완료!</h2>
                                                                  <p><strong>${t.name}</strong> 대회에<br>성공적으로 신청되었습니다.</p>
                                                                  <p style="margin-top:12px; color:#64748b; font-size:0.8rem;">
                                                                    대회 운영자가 확인 후 안내드립니다.
                                                                  </p>
                                                                  <a href="${base}" class="home-link">🏠 Match Point 홈으로</a>
                                                                </div>

                                                                <div class="footer">
                                                                  <p>Powered by <a href="${base}">Match Point</a> — 스포츠 대회 운영 솔루션</p>
                                                                </div>
                                                              </div>

                                                              <div class="toast" id="toast"></div>

                                                              <script src="https://js.tosspayments.com/v1/payment-widget"></script>
                                                              <script>
                                                                const usePayment = ${t.use_payment ? 'true' : 'false'};
                                                                const feeAmount = ${t.participation_fee || 0};
                                                                const tournamentId = ${id};
                                                                let paymentWidget = null;
                                                                let paymentMethodWidget = null;
                                                                let registeredParticipantId = null;

    // URL 파라미터 확인 (결제 리다이렉트 처리)
    window.addEventListener('load', async () => {
      const urlParams = new URL(location.href).searchParams;
                                                                if (urlParams.get('paymentKey') && urlParams.get('orderId') && urlParams.get('amount')) {
                                                                  // 결제 성공 리다이렉트로 돌아온 상태
                                                                  document.getElementById('formCard').style.display = 'none';

                                                                try {
          const body = {
                                                                  paymentKey: urlParams.get('paymentKey'),
                                                                orderId: urlParams.get('orderId'),
                                                                amount: parseInt(urlParams.get('amount')),
                                                                tournamentId: tournamentId,
                                                                participantIds: urlParams.get('pid') ? [parseInt(urlParams.get('pid'))] : []
          };
                                                                const res = await fetch('/api/payments/confirm', {
                                                                  method: 'POST',
                                                                headers: {'Content-Type': 'application/json' },
                                                                body: JSON.stringify(body)
          });
                                                                const data = await res.json();
                                                                if (data.success) {
                                                                  document.getElementById('successTitle').textContent = '✅ 결제 및 참가 완료!';
                                                                document.getElementById('successCard').style.display = 'block';
          } else {
                                                                  alert('결제 승인에 실패했습니다: ' + (data.error || ''));
                                                                window.location.href = window.location.pathname;
          }
        } catch (e) {
                                                                  alert('서버 오류로 결제 승인을 실패했습니다.');
                                                                window.location.href = window.location.pathname;
        }
      } else if (urlParams.get('fail')) {
                                                                  alert('결제를 취소했거나 실패했습니다.');
                                                                window.history.replaceState({ }, document.title, window.location.pathname);
      }
    });

    if (usePayment && feeAmount > 0) {
      // 결제 사용인 경우 초기화
      const clientKey = 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm';
                                                                const customerKey = 'USER_' + Date.now() + Math.floor(Math.random() * 1000);
                                                                try {
                                                                  paymentWidget = PaymentWidget(clientKey, customerKey);
      } catch (e) {console.error('토스 위젯 로드 에러', e); }
    }

                                                                async function submitForm(e) {
                                                                  e.preventDefault();
                                                                const btn = document.getElementById('submitBtn');
                                                                btn.disabled = true;
                                                                btn.textContent = '⏳ 신청 중...';

                                                                const body = {
                                                                  name: document.getElementById('jName').value.trim(),
                                                                phone: document.getElementById('jPhone').value.trim(),
                                                                gender: document.getElementById('jGender').value,
                                                                birth_year: parseInt(document.getElementById('jBirth').value),
                                                                level: document.getElementById('jLevel').value,
                                                                club: document.getElementById('jClub').value.trim(),
                                                                partner: document.getElementById('jPartner').value.trim(),
      };

                                                                if (!body.name || !body.gender || !body.birth_year || !body.level) {
                                                                  showToast('필수 항목을 모두 입력해주세요');
                                                                btn.disabled = false;
                                                                btn.textContent = '✅ 참가 신청하기';
                                                                return;
      }

                                                                try {
        const res = await fetch('/api/tournaments/' + tournamentId + '/participants', {
                                                                  method: 'POST',
                                                                headers: {'Content-Type': 'application/json' },
                                                                body: JSON.stringify(body)
        });
                                                                const data = await res.json();

                                                                if (data.success) {
                                                                  registeredParticipantId = data.id || data.participant?.id;
          
          if (usePayment && feeAmount > 0 && paymentWidget) {
                                                                  // 결제창 띄우기 모드로 전환
                                                                  btn.style.display = 'none';
                                                                document.getElementById('joinForm').style.pointerEvents = 'none';
                                                                document.getElementById('joinForm').style.opacity = '0.5';

                                                                const widgetContainer = document.getElementById('payment-widget-container');
                                                                widgetContainer.style.display = 'block';

                                                                // 토스페이먼츠 렌더링
                                                                paymentMethodWidget = paymentWidget.renderPaymentMethods('#payment-method', {value: feeAmount });
                                                                paymentWidget.renderAgreement('#agreement');
            
            setTimeout(() => {
                                                                  widgetContainer.style.opacity = '1';
                                                                widgetContainer.style.pointerEvents = 'auto';
            }, 100);

                                                                const btnPay = document.getElementById('btnPayment');
                                                                btnPay.style.display = 'block';
            btnPay.onclick = async () => {
              try {
                                                                  await paymentWidget.requestPayment({
                                                                    orderId: 'ORDER_' + Date.now(),
                                                                    orderName: '대회 참가비 (' + body.name + ')',
                                                                    successUrl: window.location.origin + '/join/' + tournamentId + '?pid=' + registeredParticipantId,
                                                                    failUrl: window.location.origin + '/join/' + tournamentId + '?fail=true',
                                                                    customerEmail: 'customer123@gmail.com',
                                                                    customerName: body.name,
                                                                  });
              } catch (err) {
                                                                  console.error(err);
                                                                if (err.code !== 'USER_CANCEL') alert(err.message);
              }
            };

          } else {
                                                                  // 결제 비사용 대회 -> 바로 성공 화면
                                                                  document.getElementById('formCard').style.display = 'none';
                                                                document.getElementById('successCard').style.display = 'block';
          }
        } else {
                                                                  showToast(data.error || '신청에 실패했습니다');
                                                                btn.disabled = false;
                                                                btn.textContent = '✅ 참가 신청하기';
        }
      } catch (err) {
                                                                  showToast('네트워크 오류가 발생했습니다');
                                                                btn.disabled = false;
                                                                btn.textContent = '✅ 참가 신청하기';
      }
    }

                                                                function showToast(msg) {
      const t = document.getElementById('toast');
                                                                t.textContent = msg;
                                                                t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3000);
    }
                                                              </script>
                                                            </body>
                                                          </html>`)
})

export default app
