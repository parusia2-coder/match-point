/* ═══════════════════════════════════════════════════════════
   Match Point Website Builder — Core Engine
   Block-based section editor with live preview
   ═══════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ── State ──
    const state = {
        orgId: null,
        orgName: '',
        slug: '',
        sportType: 'badminton',
        device: 'desktop',
        selectedSectionId: null,
        sections: [],
        global: {
            template_id: 'developer',
            font_primary: 'Pretendard',
            color_primary: '#C8FF00',
            color_bg: '#0A0A0A',
            color_text: '#F5F5F5',
            nav_style: 'transparent'
        },
        dirty: false
    };

    // ── Section Block Definitions ──
    const BLOCK_TYPES = {
        hero: {
            icon: '🎯', name: '히어로 배너', desc: '메인 비주얼 + CTA 버튼', defaults: {
                title: '', subtitle: '함께 뛰고, 함께 성장하는 커뮤니티.\n당신의 시작을 응원합니다.', bg_type: 'gradient', cta_primary: '가입 신청하기', cta_secondary: '일정 보기'
            }
        },
        about: {
            icon: '📋', name: '소개', desc: '단체 소개 및 연혁', defaults: {
                title: '소개', text: '', show_contact: true, phone: '', email: '', address: ''
            }
        },
        schedule: {
            icon: '📅', name: '일정', desc: 'DB 연동 자동 일정 표시', defaults: {
                title: '다가오는 일정', count: 5, view_mode: 'card'
            }
        },
        notice: {
            icon: '📣', name: '공지사항', desc: '게시판 연동 공지', defaults: {
                title: '공지사항', count: 5
            }
        },
        gallery: {
            icon: '📸', name: '갤러리', desc: '사진 모음', defaults: {
                title: '갤러리', images: [], layout: 'grid'
            }
        },
        members: {
            icon: '👥', name: '멤버 소개', desc: '임원/코치 소개 카드', defaults: {
                title: '팀 소개', items: []
            }
        },
        stats: {
            icon: '📊', name: '숫자 카운터', desc: '주요 수치 강조', defaults: {
                items: [
                    { value: '120+', label: '회원 수' },
                    { value: '2026', label: '설립년도' },
                    { value: '52', label: '연간 모임' }
                ]
            }
        },
        sponsors: {
            icon: '🤝', name: '후원/파트너', desc: '후원사 로고', defaults: {
                title: '파트너', items: []
            }
        },
        contact: {
            icon: '✉️', name: '가입 신청', desc: '가입 양식 + 연락처', defaults: {
                title: '가입 신청', description: '아래 양식을 작성해주시면 담당자가 연락드리겠습니다.'
            }
        },
        custom: {
            icon: '📝', name: '커스텀 텍스트', desc: '자유 텍스트/HTML', defaults: {
                title: '', content: '', bg_dark: false
            }
        },
        divider: {
            icon: '📐', name: '구분선', desc: '섹션 구분 여백', defaults: {
                height: 60, style: 'line'
            }
        },
        sns: {
            icon: '🔗', name: 'SNS 링크', desc: '소셜 미디어 링크', defaults: {
                instagram: '', blog: '', youtube: '', show_icons: true
            }
        },
        footer: {
            icon: '🏁', name: '푸터', desc: '하단 정보', defaults: {
                text: '', show_sns: true
            }
        }
    };

    const TEMPLATES = {
        developer: { icon: '⚡', name: 'Developer', colors: { primary: '#C8FF00', bg: '#0A0A0A', text: '#F5F5F5' } },
        classic: { icon: '🏛️', name: 'Classic', colors: { primary: '#1e40af', bg: '#ffffff', text: '#1e293b' } },
        sporty: { icon: '🌊', name: 'Sport Wave', colors: { primary: '#f97316', bg: '#0f172a', text: '#f1f5f9' } },
        minimal: { icon: '📐', name: 'Minimal', colors: { primary: '#18181b', bg: '#fafafa', text: '#27272a' } },
        vivid: { icon: '🎨', name: 'Vivid', colors: { primary: '#e11d48', bg: '#1a1a2e', text: '#e2e8f0' } }
    };

    // ── Utility ──
    function uid() { return 's_' + Math.random().toString(36).substr(2, 9); }
    function esc(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function toast(msg, type = 'success') {
        const el = document.createElement('div');
        el.className = 'b-toast ' + type;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }

    // ── API Helper ──
    async function apiFetch(url, opts = {}) {
        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch(url, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    }

    // ── Init ──
    async function init() {
        const params = new URLSearchParams(location.search);
        state.orgId = params.get('org');

        if (!state.orgId) {
            document.getElementById('builder-app').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#ef4444;font-size:1.2rem">⚠️ org 파라미터가 필요합니다. 예: /builder?org=1</div>';
            return;
        }

        try {
            const cfg = await apiFetch('/api/orgs/' + state.orgId + '/site-config');
            state.orgName = cfg.hero_title || '';
            state.slug = cfg.slug || '';
            state.sportType = cfg.sport_type || 'badminton';
            state.global.color_primary = cfg.theme_color || '#C8FF00';
            state.global.template_id = cfg.template_id || 'developer';

            // Convert legacy config → sections if needed
            if (cfg.sections && Array.isArray(cfg.sections)) {
                state.sections = cfg.sections;
            } else {
                // Migrate from legacy flat config
                state.sections = migrateFromLegacy(cfg);
            }
        } catch (e) {
            toast('설정을 불러오지 못했습니다: ' + e.message, 'error');
        }

        render();
        updatePreview();
    }

    function migrateFromLegacy(cfg) {
        const sections = [];
        // Always add hero
        sections.push({
            id: uid(), type: 'hero', visible: true,
            props: { title: cfg.hero_title || '', subtitle: cfg.hero_subtitle || '', bg_type: 'gradient', cta_primary: cfg.hero_cta_primary || '가입 신청하기', cta_secondary: cfg.hero_cta_secondary || '일정 보기' }
        });
        if (cfg.show_about) {
            sections.push({
                id: uid(), type: 'about', visible: true,
                props: { title: cfg.about_title || '소개', text: cfg.about_text || '', show_contact: true, phone: cfg.contact_phone || '', email: cfg.contact_email || '', address: cfg.contact_address || '' }
            });
        }
        if (cfg.show_schedule !== false) {
            sections.push({ id: uid(), type: 'schedule', visible: true, props: { title: '다가오는 일정', count: 5, view_mode: 'card' } });
        }
        if (cfg.show_notice !== false) {
            sections.push({ id: uid(), type: 'notice', visible: true, props: { title: '공지사항', count: 5 } });
        }
        sections.push({ id: uid(), type: 'stats', visible: true, props: { items: [{ value: '120+', label: '회원 수' }, { value: '🎾', label: state.sportType === 'tennis' ? '테니스' : '배드민턴' }, { value: '2026', label: '설립' }] } });
        if (cfg.show_join_form !== false) {
            sections.push({ id: uid(), type: 'contact', visible: true, props: { title: '가입 신청', description: '아래 양식을 작성해주시면 담당자가 연락드리겠습니다.' } });
        }
        if (cfg.sns_instagram || cfg.sns_blog || cfg.sns_youtube) {
            sections.push({ id: uid(), type: 'sns', visible: true, props: { instagram: cfg.sns_instagram || '', blog: cfg.sns_blog || '', youtube: cfg.sns_youtube || '', show_icons: true } });
        }
        sections.push({ id: uid(), type: 'footer', visible: true, props: { text: cfg.footer_text || '', show_sns: true } });
        return sections;
    }

    // ── Main Render ──
    function render() {
        const app = document.getElementById('builder-app');
        app.innerHTML = `
      <!-- Top Bar -->
      <div class="b-topbar">
        <div class="b-topbar-left">
          <div class="b-logo">◆ Builder<span>by Match Point</span></div>
          <div class="b-org-name">${esc(state.orgName) || '단체 사이트'}</div>
        </div>
        <div class="b-topbar-center">
          <button class="b-device-btn ${state.device === 'desktop' ? 'active' : ''}" onclick="B.setDevice('desktop')">🖥️ 데스크톱</button>
          <button class="b-device-btn ${state.device === 'tablet' ? 'active' : ''}" onclick="B.setDevice('tablet')">📱 태블릿</button>
          <button class="b-device-btn ${state.device === 'mobile' ? 'active' : ''}" onclick="B.setDevice('mobile')">📲 모바일</button>
        </div>
        <div class="b-topbar-right">
          <a href="/org/${esc(state.slug)}" target="_blank" class="b-btn b-btn-outline">🔗 사이트 보기</a>
          <button class="b-btn b-btn-outline" onclick="B.goBack()">← 돌아가기</button>
          <button class="b-btn b-btn-primary" onclick="B.save()">💾 저장</button>
        </div>
      </div>

      <!-- Main 3-panel -->
      <div class="b-main">
        <!-- Left Panel -->
        <div class="b-left">
          <div class="b-panel-header">
            <span class="b-panel-title">섹션</span>
            <button class="b-add-btn" onclick="B.showAddModal()" title="섹션 추가">+</button>
          </div>
          <!-- Template Selector -->
          <div style="padding:8px 12px;border-bottom:1px solid var(--b-border)">
            <div style="font-size:.72rem;color:var(--b-muted);font-weight:600;margin-bottom:6px;text-transform:uppercase">템플릿</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${Object.entries(TEMPLATES).map(([k, t]) => `
                <button onclick="B.setTemplate('${k}')" style="padding:4px 10px;border-radius:6px;border:1px solid ${state.global.template_id === k ? 'var(--b-accent)' : 'var(--b-border)'};background:${state.global.template_id === k ? 'rgba(124,58,237,.15)' : 'transparent'};color:var(--b-text);cursor:pointer;font-size:.75rem;transition:var(--b-transition)" title="${t.name}">
                  ${t.icon} ${t.name}
                </button>
              `).join('')}
            </div>
          </div>
          <div class="b-section-list" id="sectionList">
            ${renderSectionList()}
          </div>
        </div>

        <!-- Center Preview -->
        <div class="b-center">
          <div class="b-preview-frame ${state.device}" id="previewFrame">
            <iframe id="previewIframe" sandbox="allow-scripts allow-same-origin"></iframe>
          </div>
        </div>

        <!-- Right Panel -->
        <div class="b-right">
          <div class="b-panel-header">
            <span class="b-panel-title">속성</span>
          </div>
          <div class="b-props-scroll" id="propsPanel">
            ${renderPropsPanel()}
          </div>
        </div>
      </div>
    `;

        // Setup drag & drop
        setupDragDrop();
    }

    function renderSectionList() {
        if (state.sections.length === 0) {
            return '<div class="b-empty"><div class="b-empty-icon">🧩</div><div class="b-empty-text">섹션을 추가하세요</div></div>';
        }
        return state.sections.map((sec, i) => {
            const def = BLOCK_TYPES[sec.type] || { icon: '❓', name: sec.type };
            const active = state.selectedSectionId === sec.id;
            return `
        <div class="b-section-item ${active ? 'active' : ''}" data-id="${sec.id}" data-index="${i}"
             draggable="true" onclick="B.selectSection('${sec.id}')">
          <span class="b-section-drag" title="드래그하여 순서 변경">⠿</span>
          <span class="b-section-icon">${def.icon}</span>
          <div class="b-section-info">
            <div class="b-section-name">${esc(sec.props?.title || def.name)}</div>
            <div class="b-section-type">${def.name}</div>
          </div>
          <div class="b-section-actions">
            <button class="b-section-action" onclick="event.stopPropagation();B.toggleVisibility('${sec.id}')" title="${sec.visible ? '숨기기' : '보이기'}">
              ${sec.visible ? '👁️' : '🚫'}
            </button>
            <button class="b-section-action delete" onclick="event.stopPropagation();B.deleteSection('${sec.id}')" title="삭제">🗑️</button>
          </div>
        </div>
      `;
        }).join('');
    }

    // ── Properties Panel ──
    function renderPropsPanel() {
        if (!state.selectedSectionId) {
            // Global settings
            return renderGlobalProps();
        }
        const sec = state.sections.find(s => s.id === state.selectedSectionId);
        if (!sec) return renderGlobalProps();

        const def = BLOCK_TYPES[sec.type];
        const p = sec.props || {};

        let html = `<div class="b-prop-group"><div class="b-prop-group-title">${def?.icon || '📦'} ${def?.name || sec.type} 설정</div>`;

        switch (sec.type) {
            case 'hero':
                html += propField('title', '메인 타이틀', p.title, 'text', '단체명 또는 슬로건');
                html += propField('subtitle', '서브 타이틀', p.subtitle, 'textarea', '소개 문구');
                html += propField('cta_primary', 'CTA 버튼 (메인)', p.cta_primary, 'text');
                html += propField('cta_secondary', 'CTA 버튼 (보조)', p.cta_secondary, 'text');
                html += propSelect('bg_type', '배경 타입', p.bg_type, [
                    { v: 'gradient', l: '그라데이션' }, { v: 'image', l: '이미지' }, { v: 'solid', l: '단색' }
                ]);
                break;

            case 'about':
                html += propField('title', '제목', p.title, 'text');
                html += propField('text', '소개 내용', p.text, 'textarea', '단체에 대한 소개글');
                html += propToggle('show_contact', '연락처 표시', p.show_contact);
                html += propField('phone', '전화번호', p.phone, 'text', '010-1234-5678');
                html += propField('email', '이메일', p.email, 'text', 'info@example.com');
                html += propField('address', '주소', p.address, 'text');
                break;

            case 'schedule':
                html += propField('title', '제목', p.title, 'text');
                html += propField('count', '표시 개수', p.count, 'number');
                html += propSelect('view_mode', '보기 모드', p.view_mode, [
                    { v: 'card', l: '카드' }, { v: 'list', l: '리스트' }, { v: 'calendar', l: '캘린더' }
                ]);
                break;

            case 'notice':
                html += propField('title', '제목', p.title, 'text');
                html += propField('count', '표시 개수', p.count, 'number');
                break;

            case 'gallery':
                html += propField('title', '제목', p.title, 'text');
                html += propSelect('layout', '레이아웃', p.layout, [
                    { v: 'grid', l: '그리드' }, { v: 'masonry', l: '벽돌 배치' }, { v: 'slider', l: '슬라이더' }
                ]);
                html += '<div class="b-prop-field"><div class="b-prop-label">📸 이미지 URL (줄당 1개)</div><textarea class="b-prop-input" data-prop="images_text" rows="4" placeholder="https://example.com/photo1.jpg">' +
                    esc((p.images || []).join('\n')) + '</textarea></div>';
                break;

            case 'stats':
                html += '<div class="b-prop-label">카운터 항목 (JSON 형태)</div>';
                (p.items || []).forEach((item, i) => {
                    html += `<div style="display:flex;gap:6px;margin-bottom:6px">
            <input class="b-prop-input" style="width:40%" data-prop="stat_value_${i}" value="${esc(item.value)}" placeholder="값">
            <input class="b-prop-input" style="width:60%" data-prop="stat_label_${i}" value="${esc(item.label)}" placeholder="라벨">
            <button onclick="B.removeStatItem(${i})" style="background:none;border:none;color:var(--b-danger);cursor:pointer;font-size:.9rem" title="삭제">✕</button>
          </div>`;
                });
                html += `<button onclick="B.addStatItem()" class="b-btn b-btn-outline" style="font-size:.75rem;padding:4px 12px;margin-top:4px">+ 항목 추가</button>`;
                break;

            case 'members':
                html += propField('title', '제목', p.title, 'text', '팀 소개');
                (p.items || []).forEach((m, i) => {
                    html += `<div style="border:1px solid var(--b-border);border-radius:8px;padding:10px;margin-bottom:8px">
            <div style="font-size:.75rem;color:var(--b-accent2);margin-bottom:6px">멤버 ${i + 1} <button onclick="B.removeMemberItem(${i})" style="float:right;background:none;border:none;color:var(--b-danger);cursor:pointer;font-size:.8rem">✕</button></div>
            <input class="b-prop-input" data-prop="member_name_${i}" value="${esc(m.name)}" placeholder="이름" style="margin-bottom:4px">
            <input class="b-prop-input" data-prop="member_role_${i}" value="${esc(m.role)}" placeholder="직책">
          </div>`;
                });
                html += `<button onclick="B.addMemberItem()" class="b-btn b-btn-outline" style="font-size:.75rem;padding:4px 12px;margin-top:4px">+ 멤버 추가</button>`;
                break;

            case 'contact':
                html += propField('title', '제목', p.title, 'text');
                html += propField('description', '설명', p.description, 'textarea');
                break;

            case 'custom':
                html += propField('title', '제목 (선택)', p.title, 'text');
                html += propField('content', '내용', p.content, 'textarea', '자유 텍스트를 입력하세요');
                html += propToggle('bg_dark', '어두운 배경', p.bg_dark);
                break;

            case 'divider':
                html += propField('height', '높이 (px)', p.height, 'number');
                html += propSelect('style', '스타일', p.style, [
                    { v: 'line', l: '가로선' }, { v: 'space', l: '여백만' }, { v: 'dots', l: '점선' }
                ]);
                break;

            case 'sns':
                html += propField('instagram', '인스타그램 URL', p.instagram, 'url');
                html += propField('blog', '블로그 URL', p.blog, 'url');
                html += propField('youtube', '유튜브 URL', p.youtube, 'url');
                break;

            case 'footer':
                html += propField('text', '푸터 텍스트', p.text, 'text', '© 2026 All rights reserved');
                html += propToggle('show_sns', 'SNS 아이콘 표시', p.show_sns);
                break;

            case 'sponsors':
                html += propField('title', '제목', p.title, 'text');
                break;
        }

        html += '</div>';
        return html;
    }

    function renderGlobalProps() {
        const g = state.global;
        return `
      <div class="b-prop-group">
        <div class="b-prop-group-title">🎨 글로벌 디자인</div>
        <div class="b-prop-field">
          <div class="b-prop-label">테마 컬러 (액센트)</div>
          <div class="b-prop-color-row">
            <input type="color" class="b-prop-color" value="${g.color_primary}" onchange="B.setGlobal('color_primary',this.value)">
            <input class="b-prop-input" value="${esc(g.color_primary)}" style="flex:1" onchange="B.setGlobal('color_primary',this.value)">
          </div>
        </div>
        <div class="b-prop-field">
          <div class="b-prop-label">배경색</div>
          <div class="b-prop-color-row">
            <input type="color" class="b-prop-color" value="${g.color_bg}" onchange="B.setGlobal('color_bg',this.value)">
            <input class="b-prop-input" value="${esc(g.color_bg)}" style="flex:1" onchange="B.setGlobal('color_bg',this.value)">
          </div>
        </div>
        <div class="b-prop-field">
          <div class="b-prop-label">글자색</div>
          <div class="b-prop-color-row">
            <input type="color" class="b-prop-color" value="${g.color_text}" onchange="B.setGlobal('color_text',this.value)">
            <input class="b-prop-input" value="${esc(g.color_text)}" style="flex:1" onchange="B.setGlobal('color_text',this.value)">
          </div>
        </div>
      </div>
      <div class="b-prop-group">
        <div class="b-prop-group-title">ℹ️ 사용법</div>
        <p style="font-size:.8rem;color:var(--b-muted);line-height:1.5">
          • 좌측에서 <b>+</b> 버튼으로 섹션 추가<br>
          • 섹션을 <b>드래그</b>하여 순서 변경<br>
          • 섹션 클릭 → 이 패널에서 속성 편집<br>
          • <b>👁️</b>로 표시/숨기기 전환<br>
          • 편집 후 <b>💾 저장</b> 클릭
        </p>
      </div>
    `;
    }

    // Property field helpers
    function propField(prop, label, value, type = 'text', placeholder = '') {
        const tag = type === 'textarea'
            ? `<textarea class="b-prop-input" data-prop="${prop}" rows="3" placeholder="${esc(placeholder)}">${esc(value || '')}</textarea>`
            : `<input class="b-prop-input" type="${type}" data-prop="${prop}" value="${esc(value || '')}" placeholder="${esc(placeholder)}">`;
        return `<div class="b-prop-field"><div class="b-prop-label">${label}</div>${tag}</div>`;
    }
    function propSelect(prop, label, value, options) {
        return `<div class="b-prop-field"><div class="b-prop-label">${label}</div>
      <select class="b-prop-input" data-prop="${prop}">
        ${options.map(o => `<option value="${o.v}" ${value === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
      </select></div>`;
    }
    function propToggle(prop, label, checked) {
        return `<div class="b-prop-toggle">
      <span style="font-size:.85rem">${label}</span>
      <label class="b-toggle-switch"><input type="checkbox" data-prop="${prop}" ${checked ? 'checked' : ''}><span class="b-toggle-slider"></span></label>
    </div>`;
    }

    // ── Section CRUD ──
    function addSection(type) {
        const def = BLOCK_TYPES[type];
        if (!def) return;
        const sec = { id: uid(), type, visible: true, props: JSON.parse(JSON.stringify(def.defaults)) };
        // Set default title from org name if hero
        if (type === 'hero' && state.orgName) sec.props.title = state.orgName;
        state.sections.push(sec);
        state.selectedSectionId = sec.id;
        state.dirty = true;
        render();
        updatePreview();
        closeModal();
    }

    function deleteSection(id) {
        if (!confirm('이 섹션을 삭제하시겠습니까?')) return;
        state.sections = state.sections.filter(s => s.id !== id);
        if (state.selectedSectionId === id) state.selectedSectionId = null;
        state.dirty = true;
        render();
        updatePreview();
    }

    function toggleVisibility(id) {
        const sec = state.sections.find(s => s.id === id);
        if (sec) {
            sec.visible = !sec.visible;
            state.dirty = true;
            render();
            updatePreview();
        }
    }

    function selectSection(id) {
        state.selectedSectionId = id;
        // Re-render sections + props only
        const listEl = document.getElementById('sectionList');
        if (listEl) listEl.innerHTML = renderSectionList();
        setupDragDrop();
        const propsEl = document.getElementById('propsPanel');
        if (propsEl) {
            propsEl.innerHTML = renderPropsPanel();
            setupPropListeners();
        }
    }

    // ── Prop Listeners ──
    function setupPropListeners() {
        const propsEl = document.getElementById('propsPanel');
        if (!propsEl) return;

        propsEl.querySelectorAll('[data-prop]').forEach(el => {
            const event = el.type === 'checkbox' ? 'change' : 'input';
            el.addEventListener(event, () => {
                const sec = state.sections.find(s => s.id === state.selectedSectionId);
                if (!sec) return;
                const prop = el.dataset.prop;
                const val = el.type === 'checkbox' ? el.checked : el.value;

                // Handle special props
                if (prop === 'images_text') {
                    sec.props.images = val.split('\n').map(s => s.trim()).filter(Boolean);
                } else if (prop.startsWith('stat_value_')) {
                    const i = parseInt(prop.split('_')[2]);
                    if (sec.props.items && sec.props.items[i]) sec.props.items[i].value = val;
                } else if (prop.startsWith('stat_label_')) {
                    const i = parseInt(prop.split('_')[2]);
                    if (sec.props.items && sec.props.items[i]) sec.props.items[i].label = val;
                } else if (prop.startsWith('member_name_')) {
                    const i = parseInt(prop.split('_')[2]);
                    if (sec.props.items && sec.props.items[i]) sec.props.items[i].name = val;
                } else if (prop.startsWith('member_role_')) {
                    const i = parseInt(prop.split('_')[2]);
                    if (sec.props.items && sec.props.items[i]) sec.props.items[i].role = val;
                } else {
                    sec.props[prop] = (el.type === 'number') ? parseInt(val) || 0 : val;
                }

                state.dirty = true;
                debouncePreview();
            });
        });
    }

    let previewTimer;
    function debouncePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(updatePreview, 300);
    }

    // ── Drag & Drop ──
    function setupDragDrop() {
        const list = document.getElementById('sectionList');
        if (!list) return;
        let dragIdx = null;

        list.querySelectorAll('.b-section-item').forEach(item => {
            item.addEventListener('dragstart', e => {
                dragIdx = parseInt(item.dataset.index);
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                dragIdx = null;
            });
            item.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });
            item.addEventListener('drop', e => {
                e.preventDefault();
                const dropIdx = parseInt(item.dataset.index);
                if (dragIdx !== null && dragIdx !== dropIdx) {
                    const moved = state.sections.splice(dragIdx, 1)[0];
                    state.sections.splice(dropIdx, 0, moved);
                    state.dirty = true;
                    render();
                    updatePreview();
                }
            });
        });
    }

    // ── Add Section Modal ──
    function showAddModal() {
        const overlay = document.createElement('div');
        overlay.className = 'b-modal-overlay';
        overlay.id = 'addSectionModal';
        overlay.onclick = e => { if (e.target === overlay) closeModal(); };
        overlay.innerHTML = `
      <div class="b-modal">
        <h3>🧩 섹션 추가</h3>
        <div class="b-block-grid">
          ${Object.entries(BLOCK_TYPES).map(([k, v]) => `
            <div class="b-block-option" onclick="B.addSection('${k}')">
              <div class="icon">${v.icon}</div>
              <div class="name">${v.name}</div>
              <div class="desc">${v.desc}</div>
            </div>
          `).join('')}
        </div>
        <div style="text-align:right;margin-top:12px">
          <button class="b-btn b-btn-outline" onclick="B.closeModal()">취소</button>
        </div>
      </div>
    `;
        document.body.appendChild(overlay);
    }

    function closeModal() {
        const m = document.getElementById('addSectionModal');
        if (m) m.remove();
    }

    // ── Template ──
    function setTemplate(id) {
        const t = TEMPLATES[id];
        if (!t) return;
        state.global.template_id = id;
        state.global.color_primary = t.colors.primary;
        state.global.color_bg = t.colors.bg;
        state.global.color_text = t.colors.text;
        state.dirty = true;
        render();
        updatePreview();
    }

    // ── Device ──
    function setDevice(d) {
        state.device = d;
        const frame = document.getElementById('previewFrame');
        if (frame) { frame.className = 'b-preview-frame ' + d; }
        document.querySelectorAll('.b-device-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.toLowerCase().includes(
                d === 'desktop' ? '데스크톱' : d === 'tablet' ? '태블릿' : '모바일'
            ));
        });
        render();
    }

    // ── Global Prop ──
    function setGlobal(key, val) {
        state.global[key] = val;
        state.dirty = true;
        debouncePreview();
    }

    // ── Stats/Members helpers ──
    function addStatItem() {
        const sec = state.sections.find(s => s.id === state.selectedSectionId);
        if (!sec || sec.type !== 'stats') return;
        if (!sec.props.items) sec.props.items = [];
        sec.props.items.push({ value: '0', label: '라벨' });
        state.dirty = true;
        const propsEl = document.getElementById('propsPanel');
        if (propsEl) { propsEl.innerHTML = renderPropsPanel(); setupPropListeners(); }
        debouncePreview();
    }
    function removeStatItem(idx) {
        const sec = state.sections.find(s => s.id === state.selectedSectionId);
        if (!sec || !sec.props.items) return;
        sec.props.items.splice(idx, 1);
        state.dirty = true;
        const propsEl = document.getElementById('propsPanel');
        if (propsEl) { propsEl.innerHTML = renderPropsPanel(); setupPropListeners(); }
        debouncePreview();
    }
    function addMemberItem() {
        const sec = state.sections.find(s => s.id === state.selectedSectionId);
        if (!sec || sec.type !== 'members') return;
        if (!sec.props.items) sec.props.items = [];
        sec.props.items.push({ name: '', role: '' });
        state.dirty = true;
        const propsEl = document.getElementById('propsPanel');
        if (propsEl) { propsEl.innerHTML = renderPropsPanel(); setupPropListeners(); }
    }
    function removeMemberItem(idx) {
        const sec = state.sections.find(s => s.id === state.selectedSectionId);
        if (!sec || !sec.props.items) return;
        sec.props.items.splice(idx, 1);
        state.dirty = true;
        const propsEl = document.getElementById('propsPanel');
        if (propsEl) { propsEl.innerHTML = renderPropsPanel(); setupPropListeners(); }
        debouncePreview();
    }

    // ── Live Preview ──
    function updatePreview() {
        const iframe = document.getElementById('previewIframe');
        if (!iframe) return;

        const g = state.global;
        const isDark = isColorDark(g.color_bg);
        const sections = state.sections.filter(s => s.visible);

        let html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      :root {
        --accent: ${g.color_primary};
        --bg: ${g.color_bg};
        --text: ${g.color_text};
        --card: ${isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)'};
        --border: ${isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)'};
        --muted: ${isDark ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.45)'};
      }
      body { background:var(--bg); color:var(--text); font-family:'Pretendard','Inter',sans-serif; line-height:1.6; }
      a { color:var(--accent); text-decoration:none; }
      .section { padding:60px 24px; max-width:1100px; margin:0 auto; }
      .section-title { font-size:1.6rem; font-weight:900; margin-bottom:24px; letter-spacing:-.02em; }
      .accent { color:var(--accent); }

      /* Hero */
      .hero { min-height:75vh; display:flex; flex-direction:column; align-items:center; justify-content:center;
        text-align:center; padding:80px 24px; position:relative; overflow:hidden; }
      .hero-bg-gradient { background:linear-gradient(135deg, ${g.color_bg} 0%, ${adjustColor(g.color_primary, .15)} 50%, ${g.color_bg} 100%); }
      .hero h1 { font-size:clamp(2rem,6vw,4rem); font-weight:900; letter-spacing:-.03em; margin-bottom:16px; line-height:1.1; }
      .hero p { font-size:1.1rem; color:var(--muted); max-width:500px; margin-bottom:32px; line-height:1.7; }
      .hero-btns { display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
      .hero-btn { padding:14px 32px; border-radius:12px; font-weight:800; font-size:1rem; cursor:pointer; transition:all .2s; border:none; }
      .hero-btn-primary { background:var(--accent); color:${isDark ? '#000' : '#fff'}; }
      .hero-btn-secondary { background:transparent; color:var(--text); border:2px solid var(--border); }

      /* Stats */
      .stats-grid { display:flex; gap:24px; justify-content:center; flex-wrap:wrap; padding:40px 24px; }
      .stat-item { text-align:center; min-width:120px; }
      .stat-value { font-size:2.2rem; font-weight:900; color:var(--accent); }
      .stat-label { font-size:.85rem; color:var(--muted); margin-top:4px; }

      /* Cards */
      .card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
      .card { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:20px; transition:all .2s; }
      .card:hover { border-color:var(--accent); transform:translateY(-2px); }
      .card-title { font-weight:700; font-size:1rem; margin-bottom:8px; }
      .card-meta { font-size:.8rem; color:var(--muted); }
      .card-body { font-size:.9rem; color:var(--muted); margin-top:8px; line-height:1.5; }

      /* Gallery */
      .gallery-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:8px; }
      .gallery-grid img { width:100%; height:180px; object-fit:cover; border-radius:10px; }

      /* Members */
      .members-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:16px; }
      .member-card { text-align:center; padding:24px 16px; background:var(--card); border-radius:14px; border:1px solid var(--border); }
      .member-avatar { width:80px; height:80px; border-radius:50%; background:var(--accent); margin:0 auto 12px; display:flex;align-items:center;justify-content:center;font-size:2rem;color:#000; }
      .member-name { font-weight:700; font-size:1rem; }
      .member-role { font-size:.8rem; color:var(--muted); }

      /* Contact */
      .contact-form { max-width:500px; margin:0 auto; }
      .contact-form input, .contact-form textarea { width:100%; padding:12px 14px; background:var(--card); border:1px solid var(--border); border-radius:8px; color:var(--text); font-size:.9rem; margin-bottom:10px; font-family:inherit; }
      .contact-form input:focus, .contact-form textarea:focus { border-color:var(--accent); outline:none; }
      .contact-submit { width:100%; padding:14px; background:var(--accent); color:${isDark ? '#000' : '#fff'}; border:none; border-radius:10px; font-weight:800; font-size:1rem; cursor:pointer; }

      /* Divider */
      .divider-line { border-top:1px solid var(--border); }
      .divider-dots { border-top:2px dotted var(--border); }

      /* SNS */
      .sns-links { display:flex; gap:16px; justify-content:center; padding:32px; }
      .sns-link { display:inline-flex; align-items:center; gap:6px; padding:10px 20px; background:var(--card); border:1px solid var(--border); border-radius:10px; font-weight:600; font-size:.9rem; color:var(--text); }

      /* Footer */
      .footer { text-align:center; padding:32px 24px; border-top:1px solid var(--border); color:var(--muted); font-size:.8rem; }

      /* About */
      .about-content { font-size:1rem; line-height:1.8; color:var(--muted); white-space:pre-line; max-width:700px; }
      .about-contact { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-top:24px; }
      .about-contact-item { padding:12px; background:var(--card); border-radius:8px; border:1px solid var(--border); font-size:.85rem; }

      /* Custom */
      .custom-section { padding:40px 24px; }
      .custom-dark { background:${isDark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)'}; }
    </style></head><body>`;

        // Render sections
        for (const sec of sections) {
            html += renderSectionHTML(sec, g);
        }

        html += '</body></html>';

        // Write to iframe
        iframe.srcdoc = html;
    }

    function renderSectionHTML(sec, g) {
        const p = sec.props || {};
        switch (sec.type) {
            case 'hero':
                return `<div class="hero hero-bg-gradient">
          <h1>${esc(p.title) || esc(state.orgName)}</h1>
          <p>${(p.subtitle || '').replace(/\n/g, '<br>')}</p>
          <div class="hero-btns">
            ${p.cta_primary ? `<button class="hero-btn hero-btn-primary">${esc(p.cta_primary)}</button>` : ''}
            ${p.cta_secondary ? `<button class="hero-btn hero-btn-secondary">${esc(p.cta_secondary)}</button>` : ''}
          </div>
        </div>`;

            case 'stats':
                return `<div class="stats-grid">
          ${(p.items || []).map(i => `<div class="stat-item"><div class="stat-value">${esc(i.value)}</div><div class="stat-label">${esc(i.label)}</div></div>`).join('')}
        </div>`;

            case 'about':
                let aboutHtml = `<div class="section"><div class="section-title">${esc(p.title) || '소개'}</div>
          <div class="about-content">${esc(p.text) || '단체 소개가 여기에 표시됩니다.'}</div>`;
                if (p.show_contact && (p.phone || p.email || p.address)) {
                    aboutHtml += '<div class="about-contact">';
                    if (p.phone) aboutHtml += `<div class="about-contact-item">📞 ${esc(p.phone)}</div>`;
                    if (p.email) aboutHtml += `<div class="about-contact-item">✉️ ${esc(p.email)}</div>`;
                    if (p.address) aboutHtml += `<div class="about-contact-item">📍 ${esc(p.address)}</div>`;
                    aboutHtml += '</div>';
                }
                return aboutHtml + '</div>';

            case 'schedule':
                return `<div class="section"><div class="section-title">📅 ${esc(p.title) || '일정'}</div>
          <div class="card-grid">
            ${[1, 2, 3].map(i => `<div class="card"><div class="card-meta">2026년 3월 ${10 + i}일</div><div class="card-title">정기 모임 #${i}</div><div class="card-body">장소: 종합체육관 | 시간: 09:00</div></div>`).join('')}
          </div>
          <p style="text-align:center;margin-top:16px;font-size:.85rem;color:var(--muted)">※ 실제 사이트에서는 DB 일정이 자동 표시됩니다</p>
        </div>`;

            case 'notice':
                return `<div class="section"><div class="section-title">📣 ${esc(p.title) || '공지사항'}</div>
          <div class="card-grid">
            ${['3월 정기 총회 안내', '신입회원 모집 공고', '장소 변경 안내'].map((t, i) => `<div class="card"><div class="card-title">${t}</div><div class="card-meta">2026.03.0${i + 1}</div></div>`).join('')}
          </div>
        </div>`;

            case 'gallery':
                const imgs = p.images || [];
                return `<div class="section"><div class="section-title">📸 ${esc(p.title) || '갤러리'}</div>
          <div class="gallery-grid">
            ${imgs.length > 0
                        ? imgs.map(url => `<img src="${esc(url)}" alt="갤러리">`).join('')
                        : [1, 2, 3, 4].map(i => `<div style="height:180px;background:var(--card);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--muted)">📷 사진 ${i}</div>`).join('')
                    }
          </div>
        </div>`;

            case 'members':
                const members = p.items || [];
                return `<div class="section"><div class="section-title">👥 ${esc(p.title) || '팀 소개'}</div>
          <div class="members-grid">
            ${members.length > 0
                        ? members.map(m => `<div class="member-card"><div class="member-avatar">${(m.name || '?')[0]}</div><div class="member-name">${esc(m.name)}</div><div class="member-role">${esc(m.role)}</div></div>`).join('')
                        : ['회장', '부회장', '총무'].map(r => `<div class="member-card"><div class="member-avatar">👤</div><div class="member-name">이름</div><div class="member-role">${r}</div></div>`).join('')
                    }
          </div>
        </div>`;

            case 'sponsors':
                return `<div class="section"><div class="section-title">🤝 ${esc(p.title) || '파트너'}</div>
          <div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap;opacity:.6">
            ${['파트너 A', '파트너 B', '파트너 C'].map(n => `<div style="padding:20px 32px;background:var(--card);border-radius:12px;border:1px solid var(--border);font-weight:600">${n}</div>`).join('')}
          </div>
        </div>`;

            case 'contact':
                return `<div class="section"><div class="section-title">✉️ ${esc(p.title) || '가입 신청'}</div>
          ${p.description ? `<p style="text-align:center;color:var(--muted);margin-bottom:24px">${esc(p.description)}</p>` : ''}
          <div class="contact-form">
            <input placeholder="이름" readonly>
            <input placeholder="연락처" readonly>
            <input placeholder="소속 클럽 (선택)" readonly>
            <textarea rows="3" placeholder="가입 동기 / 하고 싶은 말" readonly></textarea>
            <button class="contact-submit">신청하기</button>
          </div>
        </div>`;

            case 'custom':
                return `<div class="custom-section ${p.bg_dark ? 'custom-dark' : ''}">
          <div class="section">
            ${p.title ? `<div class="section-title">${esc(p.title)}</div>` : ''}
            <div style="line-height:1.8;white-space:pre-line">${esc(p.content) || '커스텀 내용을 입력하세요'}</div>
          </div>
        </div>`;

            case 'divider':
                const h = p.height || 60;
                const cls = p.style === 'dots' ? 'divider-dots' : p.style === 'line' ? 'divider-line' : '';
                return `<div style="height:${h}px;display:flex;align-items:center;padding:0 24px"><div class="${cls}" style="width:100%"></div></div>`;

            case 'sns':
                return `<div class="sns-links">
          ${p.instagram ? '<div class="sns-link">📷 Instagram</div>' : ''}
          ${p.blog ? '<div class="sns-link">📖 Blog</div>' : ''}
          ${p.youtube ? '<div class="sns-link">🎬 YouTube</div>' : ''}
          ${!p.instagram && !p.blog && !p.youtube ? '<div class="sns-link" style="opacity:.5">SNS 링크를 추가하세요</div>' : ''}
        </div>`;

            case 'footer':
                return `<div class="footer">
          <div>${esc(p.text) || '© 2026 ' + esc(state.orgName) + '. All rights reserved.'}</div>
        </div>`;

            default:
                return `<div class="section"><div class="section-title">❓ Unknown: ${sec.type}</div></div>`;
        }
    }

    // ── Color helpers ──
    function isColorDark(hex) {
        const c = hex.replace('#', '');
        const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 < 128;
    }
    function adjustColor(hex, amount) {
        const c = hex.replace('#', '');
        const r = Math.min(255, Math.max(0, parseInt(c.substr(0, 2), 16) + Math.round(255 * amount)));
        const g = Math.min(255, Math.max(0, parseInt(c.substr(2, 2), 16) + Math.round(255 * amount)));
        const b = Math.min(255, Math.max(0, parseInt(c.substr(4, 2), 16) + Math.round(255 * amount)));
        return `rgb(${r},${g},${b})`;
    }

    // ── Save ──
    async function save() {
        try {
            const payload = {
                theme_color: state.global.color_primary,
                template_id: state.global.template_id,
                color_bg: state.global.color_bg,
                color_text: state.global.color_text,
                sections: state.sections
            };

            // Also save legacy fields for backward compat
            const heroSec = state.sections.find(s => s.type === 'hero');
            if (heroSec) {
                payload.hero_title = heroSec.props.title;
                payload.hero_subtitle = heroSec.props.subtitle;
                payload.hero_cta_primary = heroSec.props.cta_primary;
                payload.hero_cta_secondary = heroSec.props.cta_secondary;
            }

            await apiFetch('/api/orgs/' + state.orgId + '/site-config', {
                method: 'PUT',
                body: payload
            });

            state.dirty = false;
            toast('저장되었습니다! 🎉');
        } catch (e) {
            toast('저장 실패: ' + e.message, 'error');
        }
    }

    function goBack() {
        if (state.dirty && !confirm('저장하지 않은 변경사항이 있습니다. 나가시겠습니까?')) return;
        window.location.href = '/';
    }

    // ── Public API ──
    window.B = {
        addSection, deleteSection, toggleVisibility, selectSection,
        showAddModal, closeModal, setTemplate, setDevice, setGlobal,
        save, goBack,
        addStatItem, removeStatItem, addMemberItem, removeMemberItem
    };

    // ── Boot ──
    init();

})();
