// AI Voice Broadcast System
// Handles automated announcements for matches using Web Speech API

const VOICE_QUEUE = [];
let isVoicePlaying = false;
let broadcastEnabled = false;
let previousMatchStatus = new Map();
let broadcastInterval = null;
let currentVoices = [];
let selectedVoice = null;
let broadcastChime = null;

// Initialize TTS and chime sound
function initBroadcastAudio() {
    if (typeof window.speechSynthesis !== 'undefined') {
        const getBestKoreanVoice = (voices) => {
            const koVoices = voices.filter(v => v.lang.includes('ko'));
            if (koVoices.length === 0) return voices[0];

            // 프리미엄/자연스러운 음성 우선순위 (Google, Yuna, Sora, Seoyeon, Online 등)
            const premiumKeywords = ['Google', 'Yuna', 'Sora', 'Seoyeon', 'Online', 'Natural'];

            for (let keyword of premiumKeywords) {
                const found = koVoices.find(v => v.name.includes(keyword) || v.voiceURI.includes(keyword));
                if (found) return found;
            }

            return koVoices[0]; // 없으면 기본 한국어
        };

        speechSynthesis.onvoiceschanged = () => {
            currentVoices = speechSynthesis.getVoices();
            selectedVoice = getBestKoreanVoice(currentVoices);
        };

        currentVoices = speechSynthesis.getVoices();
        if (currentVoices.length > 0) {
            selectedVoice = getBestKoreanVoice(currentVoices);
        }
    }

    // Basic chime using Web Audio API instead of an external asset
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        broadcastChime = audioCtx;
    } catch (e) {
        console.warn("Web Audio API not supported", e);
    }
}

// Play UI Chime before speech
function playChime() {
    return new Promise((resolve) => {
        if (!broadcastChime) return resolve();
        if (broadcastChime.state === 'suspended') broadcastChime.resume();

        const osc = broadcastChime.createOscillator();
        const gainNode = broadcastChime.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, broadcastChime.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, broadcastChime.currentTime + 0.1); // E5
        osc.frequency.exponentialRampToValueAtTime(783.99, broadcastChime.currentTime + 0.2); // G5

        gainNode.gain.setValueAtTime(0, broadcastChime.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.5, broadcastChime.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, broadcastChime.currentTime + 1.2);

        osc.connect(gainNode);
        gainNode.connect(broadcastChime.destination);

        osc.start();
        osc.stop(broadcastChime.currentTime + 1.2);

        setTimeout(resolve, 1500); // Wait for chime to end before resolving
    });
}

function processVoiceQueue() {
    if (isVoicePlaying || VOICE_QUEUE.length === 0 || !window.broadcastEnabled) return;
    isVoicePlaying = true;

    const text = VOICE_QUEUE.shift();

    playChime().then(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        utterance.lang = 'ko-KR';
        utterance.rate = 0.95; // Slightly slower for clarity & naturalness
        utterance.pitch = 1.05; // Slightly higher pitch for announcer tone

        utterance.onend = () => {
            isVoicePlaying = false;
            setTimeout(processVoiceQueue, 1500); // 1.5s gap between announcements
        };

        utterance.onerror = (e) => {
            console.error("Speech Synthesis Error:", e);
            isVoicePlaying = false;
            setTimeout(processVoiceQueue, 1000);
        };

        window.speechSynthesis.speak(utterance);
    });
}

function queueAnnouncement(text) {
    if (!window.broadcastEnabled) return;
    VOICE_QUEUE.push(text);
    processVoiceQueue();
}

// Call this every few seconds when broadcast is enabled
async function pollMatchesForBroadcast(tid) {
    if (!window.broadcastEnabled) return;
    try {
        const venueId = document.getElementById('venueFilter') ? document.getElementById('venueFilter').value : '';
        const url = '/api/tournaments/' + tid + '/matches?_t=' + Date.now() + (venueId ? '&venue_id=' + venueId : '');
        const res = await fetch(url);
        if (!res.ok) return;
        const matches = await res.json();

        // Helper function for Korean number pronunciation for TTS
        const getKoreanNumber = (num) => {
            if (!num) return '';
            const numStr = String(num);
            const koNums = { '1': '일', '2': '이', '3': '삼', '4': '사', '5': '오', '6': '육', '7': '칠', '8': '팔', '9': '구', '0': '영' };
            return numStr.split('').map(c => koNums[c] || c).join('');
        };

        // First run: just initialize the state map to avoid announcing everything individually on start.
        if (previousMatchStatus.size === 0) {
            let playingCount = 0;
            matches.forEach(m => {
                previousMatchStatus.set(m.id, m.status);
                if (m.status === 'playing') playingCount++;
            });
            if (playingCount > 0) {
                queueAnnouncement(`안내 방송 시스템을 시작합니다. 현재 ${playingCount}개 코트에서 경기가 진행 중입니다.`);
            } else {
                queueAnnouncement(`안내 방송 시스템을 시작합니다.`);
            }
            return;
        }

        // Subsequent runs: detect status changes
        const newlyPlaying = [];
        const newlyCompleted = [];

        matches.forEach(m => {
            const prevStatus = previousMatchStatus.get(m.id);
            if (prevStatus !== m.status) {
                if (prevStatus === 'pending' && m.status === 'playing') newlyPlaying.push(m);
                if (prevStatus === 'playing' && m.status === 'completed') newlyCompleted.push(m);
                previousMatchStatus.set(m.id, m.status);
            }
        });

        // Process new match assignments (only if not already announced during completion phase)
        newlyPlaying.forEach(m => {
            if (window._announcedMids && window._announcedMids.has(m.id)) return;
            const isBye = false; // Add BYE logic if needed
            const t1 = m.team1_name || (m.t1p1_name ? m.t1p1_name + (m.t1p2_name ? '·' + m.t1p2_name : '') : 'BYE');
            const t2 = m.team2_name || (m.t2p1_name ? m.t2p1_name + (m.t2p2_name ? '·' + m.t2p2_name : '') : 'BYE');
            if (t1 === 'BYE' || t2 === 'BYE') return; // Don't announce walkovers
            const evt = m.event_name ? '[' + m.event_name + '] ' : '';
            const venueStr = m.stream_name || m.venue_name;
            const vtxt = venueStr ? venueStr + ' ' : '';
            const courtNumTxt = getKoreanNumber(m.court_number);
            const text = `안내 말씀 드립니다. 다음 팀은 ${vtxt}${courtNumTxt}번 코트로 출전 바랍니다. ${evt} ${t1} 팀 대 ${t2} 팀.`;
            queueAnnouncement(text);
            if (!window._announcedMids) window._announcedMids = new Set();
            window._announcedMids.add(m.id);
        });

        // Process completed matches (call next match gracefully)
        if (newlyCompleted.length > 0) {
            if (!window._announcedMids) window._announcedMids = new Set();
            const pendingMatches = matches.filter(m => m.status === 'pending');
            newlyCompleted.forEach(cm => {
                const court = cm.court_number;
                if (!court) return;
                const nextMatches = pendingMatches.filter(pm => pm.court_number === court).sort((a, b) => (a.round - b.round) || (a.match_order - b.match_order));
                const venueStr = cm.stream_name || cm.venue_name;
                const vtxt = venueStr ? venueStr + ' ' : '';
                const courtNumTxt = getKoreanNumber(court);

                if (nextMatches.length > 0) {
                    const m = nextMatches[0];
                    const t1 = m.team1_name || (m.t1p1_name ? m.t1p1_name + (m.t1p2_name ? '·' + m.t1p2_name : '') : 'BYE');
                    const t2 = m.team2_name || (m.t2p1_name ? m.t2p1_name + (m.t2p2_name ? '·' + m.t2p2_name : '') : 'BYE');
                    if (t1 === 'BYE' || t2 === 'BYE') return;
                    const evt = m.event_name ? '[' + m.event_name + '] ' : '';
                    const text = `안내 말씀 드립니다. ${vtxt}${courtNumTxt}번 코트 경기가 종료되었습니다. 다음 경기인 ${evt} ${t1} 팀 대 ${t2} 팀은 지금 ${vtxt}${courtNumTxt}번 코트로 출전 바랍니다.`;
                    queueAnnouncement(text);
                    window._announcedMids.add(m.id);
                } else {
                    const text = `안내 말씀 드립니다. ${vtxt}${courtNumTxt}번 코트 코트배정된 모든 경기가 종료되었습니다.`;
                    queueAnnouncement(text);
                }
            });
        }
    } catch (e) { console.error('Broadcast polling error:', e); }
}

function toggleVoiceBroadcast(tid, btnElement) {
    if (typeof window.speechSynthesis === 'undefined') {
        alert("현재 브라우저는 오디오 방송 시스템을 지원하지 않습니다.");
        return;
    }

    window.broadcastEnabled = !window.broadcastEnabled;
    const enabled = window.broadcastEnabled;

    if (enabled) {
        if (broadcastChime && broadcastChime.state === 'suspended') broadcastChime.resume();
        previousMatchStatus.clear(); // Reset to prevent old delta playback
        queueAnnouncement("방송 안내 시스템이 활성화되었습니다. 신규 배정 경기를 모니터링합니다.");
        broadcastInterval = setInterval(() => pollMatchesForBroadcast(tid), 5000);
        // Initial fetch to seed state
        pollMatchesForBroadcast(tid);
        if (btnElement) {
            btnElement.innerHTML = '🔴 방송 중 (ON)';
            btnElement.style.background = 'rgba(239, 68, 68, 0.1)';
            btnElement.style.color = '#ef4444';
            btnElement.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            btnElement.classList.add('pulse-border');
        }
    } else {
        clearInterval(broadcastInterval);
        VOICE_QUEUE.length = 0; // Clear queue
        window.speechSynthesis.cancel(); // Stop playing
        isVoicePlaying = false;
        if (btnElement) {
            btnElement.innerHTML = '🎙️ 방송 켜기 (OFF)';
            btnElement.style.background = 'var(--bg-card)';
            btnElement.style.color = 'var(--text-secondary)';
            btnElement.style.borderColor = 'var(--border)';
            btnElement.classList.remove('pulse-border');
        }
    }
}

window.broadcastEnabled = false;
window.toggleVoiceBroadcast = toggleVoiceBroadcast;

// Auto-init on load
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initBroadcastAudio);
    // Re-attempt init on first user interaction due to browser policies
    document.addEventListener('click', () => {
        if (!broadcastChime || broadcastChime.state === 'suspended') initBroadcastAudio();
    }, { once: true });
}
