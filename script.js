// ============================================
// GLITCH TAG v4.0 - ULTIMATE EDITION
// ============================================

// ============================================
// CONSTANTS
// ============================================
const PLAYER_COLORS = [
    { bg: '#00ff88', txt: '#002211' }, { bg: '#ff2255', txt: '#fff0f3' },
    { bg: '#00ccff', txt: '#002233' }, { bg: '#ffcc00', txt: '#2a1e00' },
    { bg: '#cc44ff', txt: '#1a0033' }, { bg: '#ff7700', txt: '#2a1200' },
    { bg: '#44ffcc', txt: '#002a20' }, { bg: '#ff44aa', txt: '#2a0018' },
];

const CTRL = {
    wasd: { up: 'w', down: 's', left: 'a', right: 'd' },
    arrows: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' },
    ijkl: { up: 'i', down: 'k', left: 'j', right: 'l' },
    numpad: { up: '8', down: '5', left: '4', right: '6' },
};

const GLITCH_RATE = { low: 11000, medium: 6500, high: 3800, insane: 1800 };
const SPEED = 3.4, PW = 28, PH = 28, TAG_COOL = 900, PICKUP_SPAWN = 5500;

const PICKUP_TYPES = [
    { id: 'shield', icon: '🛡️', cls: 'pickup-shield', dur: 5000, desc: 'SHIELD ACTIVE', color: '#00ccff' },
    { id: 'freeze', icon: '❄️', cls: 'pickup-freeze', dur: 2500, desc: 'FREEZE BLAST', color: '#88ccff' },
    { id: 'ghost', icon: '👻', cls: 'pickup-ghost', dur: 4000, desc: 'GHOST MODE', color: '#aaaaff' },
    { id: 'magnet', icon: '🧲', cls: 'pickup-magnet', dur: 3000, desc: 'MAGNET PULL', color: '#ff7700' },
    { id: 'bomb', icon: '💣', cls: 'pickup-bomb', dur: 0, desc: 'BOMB!', color: '#ff2255' },
    { id: 'shot', icon: '🔫', cls: 'pickup-shot', dur: 0, desc: 'LOCKED AND LOADED', color: '#ffcc00' },
    { id: 'decoy', icon: '🪄', cls: 'pickup-decoy', dur: 0, desc: 'DECOY DEPLOYED', color: '#44ff88' },
];

const STREAK_MSGS = {
    2: 'DOUBLE!', 3: 'TRIPLE!', 4: 'QUAD!!', 5: 'UNSTOPPABLE!!!',
    6: 'UNKILLABLE!!!', 7: 'LEGENDARY!!!!'
};

const MODE_DESCS = {
    classic: 'Classic tag. Chase and tag others to score. Highest score wins.',
    infection: 'IT infects others. Last survivor wins. Infected can tag uninfected.',
    potato: 'IT is the hot potato — hold it too long and you explode. Survive longest to win.',
    assassin: 'Each player has a secret target. Tag only your target to score. Others don\'t count.',
    team2v2: 'Teams of 2 compete. Tag opponents to score. First team to 10 wins.',
    ctf: 'Grab enemy flag while protecting yours. Return enemy flag to your zone to score.',
    koth: 'Both teams fight to hold the King of the Hill zone. Hold it to rack up points.'
};

const ZONE_TYPES = ['danger', 'boost', 'slow'];
const GLITCH_CHARS = '▓░▒█▄▀■□●○◆◇★☆♦♣♠♥';

// ============================================
// AI PLAYER CLASS
// ============================================
class AIPlayer {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.state = 'neutral'; // chase, flee, collect, patrol
        this.target = null;
        this.lastDecision = 0;
        this.decisionInterval = this.getDecisionInterval();
    }

    getDecisionInterval() {
        const intervals = { easy: 400, medium: 250, hard: 120, nightmare: 50 };
        return intervals[this.difficulty] || 250;
    }

    getReactionTime() {
        const times = { easy: 300, medium: 150, hard: 80, nightmare: 30 };
        return times[this.difficulty] || 150;
    }

    decide(player, gameState, arena) {
        const now = Date.now();
        if (now - this.lastDecision < this.getReactionTime()) return { dx: 0, dy: 0 };
        this.lastDecision = now;

        const itPlayers = gameState.players.filter(p => p.isIt && !p.eliminated);
        const powerups = pickups.filter(p => p.active);
        const runners = gameState.players.filter(p => !p.isIt && !p.eliminated && p.id !== player.id);

        if (player.isIt || (gameState.mode === 'infection' && player.infected)) {
            return this.decideAttacker(player, runners, gameState, arena);
        } else {
            return this.decideEvader(player, itPlayers, powerups, gameState, arena);
        }
    }

    decideAttacker(player, targets, gameState, arena) {
        if (targets.length === 0) return { dx: 0, dy: 0 };

        let bestTarget = targets[0];
        let minDist = Math.hypot(bestTarget.x - player.x, bestTarget.y - player.y);

        for (let i = 1; i < targets.length; i++) {
            const dist = Math.hypot(targets[i].x - player.x, targets[i].y - player.y);
            if (dist < minDist) {
                minDist = dist;
                bestTarget = targets[i];
            }
        }

        return this.moveToward(player, bestTarget, minDist < 150 ? 1.2 : 1.0);
    }

    decideEvader(player, threats, powerups, gameState, arena) {
        if (threats.length === 0) {
            if (powerups.length > 0 && this.difficulty !== 'easy') {
                const closest = this.findClosest(powerups, player);
                return this.moveToward(player, closest, 0.6);
            }
            return { dx: 0, dy: 0 };
        }

        const threat = threats[0];
        const dist = Math.hypot(threat.x - player.x, threat.y - player.y);

        if (dist < 200) {
            // Flee
            const dx = player.x - threat.x;
            const dy = player.y - threat.y;
            const len = Math.hypot(dx, dy) || 1;
            return { dx: dx / len, dy: dy / len };
        } else if (powerups.length > 0 && this.difficulty !== 'easy') {
            // Go for powerups
            const closest = this.findClosest(powerups, player);
            return this.moveToward(player, closest, 0.6);
        } else {
            // Patrol randomly
            return { dx: (Math.random() - 0.5), dy: (Math.random() - 0.5) };
        }
    }

    findClosest(targets, player) {
        return targets.reduce((closest, target) => {
            const d1 = Math.hypot(target.x - player.x, target.y - player.y);
            const d2 = Math.hypot(closest.x - player.x, closest.y - player.y);
            return d1 < d2 ? target : closest;
        });
    }

    moveToward(player, target, speedMult = 1.0) {
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const len = Math.hypot(dx, dy) || 1;
        return { dx: (dx / len) * speedMult, dy: (dy / len) * speedMult };
    }
}

// ============================================
// ACHIEVEMENT SYSTEM
// ============================================
const ACHIEVEMENTS = [
    { id: 'first_tag', icon: '🏹', title: 'FIRST BLOOD', desc: 'Tag a player for the first time' },
    { id: 'triple_streak', icon: '🔥', title: 'HOT STARTER', desc: 'Get 3 tags in a row' },
    { id: 'five_streak', icon: '🌟', title: 'ON FIRE', desc: 'Get 5 tags without dying' },
    { id: 'ten_streak', icon: '👑', title: 'LEGENDARY', desc: 'Get 10 tags in a row' },
    { id: 'collector', icon: '🧲', title: 'COLLECTOR', desc: 'Collect 10 powerups in one round' },
    { id: 'survivor', icon: '💪', title: 'SURVIVOR', desc: 'Last alive in Infection mode' },
    { id: 'ghost_master', icon: '👻', title: 'PHANTOM', desc: 'Use Ghost Mode 5 times' },
    { id: 'shield_blocker', icon: '🛡️', title: 'DEFENDER', desc: 'Block 3 tags with shields' },
    { id: 'assassin_ace', icon: '🎯', title: 'SNIPER', desc: 'Win an Assassin round' },
    { id: 'chaos_master', icon: '⚡', title: 'CHAOS AGENT', desc: 'Experience 10 glitches in one round' },
    { id: 'speedrunner', icon: '💨', title: 'SPEEDSTER', desc: 'Get caught never in a classic round' },
    { id: 'marathon', icon: '🏃', title: 'MARATHON', desc: 'Play 10 rounds' },
];

class AchievementSystem {
    constructor() {
        this.unlocked = this.loadUnlocked();
        this.stats = this.loadStats();
    }

    loadUnlocked() {
        const saved = localStorage.getItem('glitch_tag_achievements');
        return saved ? JSON.parse(saved) : {};
    }

    loadStats() {
        const saved = localStorage.getItem('glitch_tag_stats');
        return saved ? JSON.parse(saved) : {
            totalTags: 0,
            roundsPlayed: 0,
            pickupsCollected: 0,
            ghostModesUsed: 0,
            shieldsBlocked: 0,
        };
    }

    save() {
        localStorage.setItem('glitch_tag_achievements', JSON.stringify(this.unlocked));
        localStorage.setItem('glitch_tag_stats', JSON.stringify(this.stats));
    }

    unlock(id) {
        if (!this.unlocked[id]) {
            this.unlocked[id] = { unlockedAt: new Date().toISOString() };
            this.save();
            return true;
        }
        return false;
    }

    checkAchievements(matchResults) {
        const unlocked = [];

        if (matchResults.tags > 0 && this.stats.totalTags === 0) {
            if (this.unlock('first_tag')) unlocked.push('FIRST BLOOD');
        }
        if (matchResults.longestStreak >= 3 && !this.unlocked['triple_streak']) {
            if (this.unlock('triple_streak')) unlocked.push('HOT STARTER');
        }
        if (matchResults.longestStreak >= 5 && !this.unlocked['five_streak']) {
            if (this.unlock('five_streak')) unlocked.push('ON FIRE');
        }
        if (matchResults.longestStreak >= 10 && !this.unlocked['ten_streak']) {
            if (this.unlock('ten_streak')) unlocked.push('LEGENDARY');
        }
        if (matchResults.pickups >= 10 && !this.unlocked['collector']) {
            if (this.unlock('collector')) unlocked.push('COLLECTOR');
        }
        if (matchResults.mode === 'infection' && matchResults.survived && !this.unlocked['survivor']) {
            if (this.unlock('survivor')) unlocked.push('SURVIVOR');
        }
        if (matchResults.mode === 'assassin' && matchResults.won && !this.unlocked['assassin_ace']) {
            if (this.unlock('assassin_ace')) unlocked.push('SNIPER');
        }

        return unlocked;
    }
}

let achievementSystem = new AchievementSystem();

// ============================================
// STATE
// ============================================
let players = [], gameState = null, animId = null, timerInterval = null, glitchTimeout = null, pickupInterval = null;
let potatoInterval = null, rageInterval = null;
let keysDown = {}, paused = false, obstacles = [], zones = [], pickups = [], projectiles = [], decoys = [];
let bc = null, myRoomCode = null, isHost = false, netPlayers = {};
let touchVec = { x: 0, y: 0 }, trailAccum = 0;
let matchStats = { totalTags: 0, glitches: 0, pickups: 0, longestStreak: 0, tagFlash: 0 };
let sessionLB = {}; // name->total score across rounds
let soundEnabled = true;
let heatCtx = null;
let titleGlitchInterval = null;
let tutorialMode = false;
let graphicsPreset = 'normal';
let colorblindMode = 'none';
let aiPlayers = {}; // id -> AIPlayer instance
let keyPressTimings = {}; // track double-tap detection
let currentWeather = null;
let weatherInterval = null;

// ============================================
// DOM Helpers
// ============================================
const $ = id => document.getElementById(id);

// ============================================
// AUDIO ENGINE (Web Audio API)
// ============================================
let audioCtx = null;

function getAudio() {
    if (!audioCtx && soundEnabled) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { }
    }
    return audioCtx;
}

function playTone(freq, type, dur, vol = 0.3, delay = 0) {
    const ac = getAudio();
    if (!ac || !soundEnabled) return;
    try {
        const o = ac.createOscillator(), g = ac.createGain();
        o.connect(g);
        g.connect(ac.destination);
        o.type = type;
        o.frequency.setValueAtTime(freq, ac.currentTime + delay);
        g.gain.setValueAtTime(vol, ac.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
        o.start(ac.currentTime + delay);
        o.stop(ac.currentTime + delay + dur + 0.01);
    } catch (e) { }
}

function sfxTag() { playTone(880, 'square', 0.08, 0.4); playTone(440, 'square', 0.12, 0.3, 0.05); }
function sfxPickup() { playTone(660, 'sine', 0.1, 0.25); playTone(880, 'sine', 0.1, 0.2, 0.08); playTone(1100, 'sine', 0.12, 0.15, 0.16); }
function sfxGlitch() { playTone(80 + Math.random() * 200, 'sawtooth', 0.15, 0.2); playTone(40 + Math.random() * 100, 'square', 0.1, 0.15, 0.1); }
function sfxCountdown(n) { playTone(n === 0 ? 880 : 440, 'sine', 0.15, 0.3); }
function sfxFrenzy() { playTone(220, 'sawtooth', 0.08, 0.15); playTone(330, 'sawtooth', 0.08, 0.12, 0.1); playTone(440, 'sawtooth', 0.1, 0.1, 0.2); }
function sfxEliminate() { playTone(200, 'sawtooth', 0.2, 0.4); playTone(100, 'square', 0.25, 0.35, 0.15); playTone(50, 'square', 0.15, 0.2, 0.35); }
function sfxShot() { playTone(600, 'square', 0.05, 0.3); playTone(300, 'square', 0.08, 0.2, 0.04); }
function sfxShield() { playTone(900, 'sine', 0.12, 0.2); playTone(1200, 'sine', 0.08, 0.15, 0.1); }
function sfxFreeze() { playTone(1200, 'sine', 0.06, 0.2); playTone(800, 'sine', 0.1, 0.15, 0.15); playTone(400, 'sine', 0.12, 0.1, 0.3); }

// ============================================
// TITLE GLITCH ANIMATION
// ============================================
function startTitleGlitch() {
    const title = $('main-title');
    const original = ['G', 'L', 'I', 'T', 'C', 'H', ' ', 'T', 'A', 'G'];
    let active = false;
    titleGlitchInterval = setInterval(() => {
        if (active) return;
        if (Math.random() < 0.15) {
            active = true;
            const spans = title.querySelectorAll('span');
            const idx = Math.floor(Math.random() * spans.length);
            const orig = original[idx] || ' ';
            let flickers = 0;
            const tick = setInterval(() => {
                spans[idx].textContent = Math.random() < 0.5 ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)] : orig;
                spans[idx].style.color = Math.random() < 0.5 ? '#ff2255' : '#00ff88';
                flickers++;
                if (flickers > 6) {
                    clearInterval(tick);
                    spans[idx].textContent = orig;
                    spans[idx].style.color = '';
                    active = false;
                }
            }, 60);
        }
    }, 800);
}

// ============================================
// MODE DESCRIPTIONS
// ============================================
$('game-mode').addEventListener('change', () => {
    $('mode-desc').textContent = MODE_DESCS[$('game-mode').value] || '';
});
$('mode-desc').textContent = MODE_DESCS['classic'];

// ============================================
// SOUND TOGGLE
// ============================================
$('sound-btn').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    $('sound-btn').textContent = soundEnabled ? '🔊 SFX' : '🔇 SFX';
    if (soundEnabled) getAudio();
});

// ============================================
// GRAPHICS SETTINGS
// ============================================
$('graphics-preset').addEventListener('change', (e) => {
    graphicsPreset = e.target.value;
    applyGraphicsSettings();
});

$('colorblind-mode').addEventListener('change', (e) => {
    colorblindMode = e.target.value;
    applyGraphicsSettings();
});

function applyGraphicsSettings() {
    document.body.classList.remove('crt-filter', 'high-contrast', 'reduced-motion');
    document.body.classList.remove('colorblind-deuteranopia', 'colorblind-protanopia', 'colorblind-tritanopia');
    
    if (graphicsPreset === 'crt') document.body.classList.add('crt-filter');
    else if (graphicsPreset === 'high-contrast') document.body.classList.add('high-contrast');
    else if (graphicsPreset === 'reduced-motion') document.body.classList.add('reduced-motion');
    
    if (colorblindMode !== 'none') document.body.classList.add('colorblind-' + colorblindMode);
    
    localStorage.setItem('glitch_tag_graphics', JSON.stringify({ graphicsPreset, colorblindMode }));
}

function loadGraphicsSettings() {
    const saved = localStorage.getItem('glitch_tag_graphics');
    if (saved) {
        const { graphicsPreset: gp, colorblindMode: cm } = JSON.parse(saved);
        graphicsPreset = gp || 'normal';
        colorblindMode = cm || 'none';
        $('graphics-preset').value = graphicsPreset;
        $('colorblind-mode').value = colorblindMode;
        applyGraphicsSettings();
    }
}

// ============================================
// TUTORIAL MODE
// ============================================
$('tutorial-btn').addEventListener('click', showTutorial);
$('close-tutorial-btn').addEventListener('click', () => $('tutorial-modal').style.display = 'none');
$('practice-btn').addEventListener('click', startPracticeMode);

function showTutorial() {
    const content = $('tutorial-content');
    const sections = [
        { title: 'OBJECTIVE', text: 'Classic Tag: Chase and tag others to become IT. The tagger scores points. Last to be caught wins.' },
        { title: 'CONTROLS', text: 'P1: WASD | P2: ARROWS | P3: IJKL | P4: NUMPAD 8456 — Move your player around the arena.' },
        { title: 'TAG MECHANICS', text: 'Touch another player to tag them. If you\'re IT, you score points by tagging others. Avoid being tagged!' },
        { title: 'POWERUPS', text: '🛡️ Shield blocks 1 tag | ❄️ Freeze stops others | 👻 Ghost phase through walls | 🧲 Magnet pull runners | 💣Bomb force IT swap | 🔫 Shot fire a tag bullet | 🪄 Decoy leave a fake copy' },
        { title: 'ACHIEVEMENTS', text: 'Unlock badges by hitting milestones: First tag, 3-streak, 5-streak, 10-streak, collector, survivor, etc. Check your profile!' },
        { title: 'GAME MODES', text: 'Infection: Last survivor wins | Hot Potato: Hold the potato too long = eliminated | Assassin: Tag only your target' },
        { title: 'GLITCHES', text: 'Random events shake up the game: inverted controls, teleports, speed boosts, position swaps, and more chaos!' },
    ];
    
    content.innerHTML = sections.map(s => `
        <div class="tutorial-section">
            <h3>${s.title}</h3>
            <p>${s.text}</p>
        </div>
    `).join('');
    
    $('tutorial-modal').style.display = 'flex';
}

function startPracticeMode() {
    // Initialize practice mode against stationary targets
    $('tutorial-modal').style.display = 'none';
    tutorialMode = true;
    players = [{ name: 'YOU', scheme: 'wasd', net: false, id: Date.now() }];
    // Add stationary target dummies
    for (let i = 0; i < 2; i++) {
        players.push({ 
            name: `TARGET_${i+1}`, 
            scheme: 'ai', 
            net: false, 
            id: 'practice_' + i, 
            ai: true, 
            aiDifficulty: 'easy',
            isPracticeTarget: true
        });
    }
    updateLobby();
    const seed = Math.random();
    startGame(seed, 'classic', 'low', 60, false, '');
}

// ============================================
// LOBBY FUNCTIONS
// ============================================
function renderSlots() {
    const el = $('player-slots');
    el.innerHTML = '';
    const all = [...players, ...Object.values(netPlayers)];
    for (let i = 0; i < 8; i++) {
        const slot = document.createElement('div');
        if (i < all.length) {
            const p = all[i], c = PLAYER_COLORS[i];
            slot.className = 'slot filled';
            slot.innerHTML = `<div class="slot-avatar" style="background:${c.bg};color:${c.txt}">${p.name.slice(0, 2)}</div>
        <div class="slot-name">${p.name}</div>
        <div class="slot-tag">${p.net ? 'NET' : p.scheme.toUpperCase()}</div>
        ${i === 0 ? '<div style="color:#ff2255;font-size:0.48rem">STARTS IT</div>' : ''}`;
            if (!p.net) {
                const r = document.createElement('button');
                r.textContent = '×';
                r.style.cssText = 'background:none;border:none;color:#ff2255;cursor:pointer;font-size:0.75rem;';
                r.onclick = () => {
                    players = players.filter(x => x !== p);
                    updateLobby();
                };
                slot.appendChild(r);
            }
        } else {
            slot.className = 'slot';
            slot.innerHTML = '<div style="color:var(--border);font-size:1rem">+</div><div style="color:var(--muted);font-size:0.52rem">EMPTY</div>';
        }
        el.appendChild(slot);
    }
}

function updateLobby() {
    renderSlots();
    const total = players.length + Object.keys(netPlayers).length;
    const aiCount = players.filter(p => p.ai).length;
    $('ai-count').textContent = aiCount > 0 ? `${aiCount} bot${aiCount !== 1 ? 's' : ''} added` : '0 bots';
    $('start-btn').disabled = total < 2;
    $('lobby-msg').textContent = total >= 2 ? `${total} player${total > 1 ? 's' : ''} ready` : 'Need at least 2 players';
    const used = players.map(p => p.scheme).filter(s => s !== 'ai');
    Array.from($('control-scheme').options).forEach(o => o.disabled = used.includes(o.value));
    const av = Array.from($('control-scheme').options).find(o => !o.disabled);
    if (av) $('control-scheme').value = av.value;
    renderLeaderboard();
    renderAchievements();
}

$('add-local-btn').addEventListener('click', () => {
    if (players.length + Object.keys(netPlayers).length >= 8) return;
    const name = $('player-name-input').value.trim().toUpperCase() || `P${players.length + 1}`;
    const scheme = $('control-scheme').value;
    if (players.find(p => p.scheme === scheme)) {
        $('net-status').textContent = 'Controls in use';
        return;
    }
    players.push({ name, scheme, net: false, id: Date.now() + Math.random() });
    $('player-name-input').value = '';
    updateLobby();
});

$('add-ai-btn').addEventListener('click', () => {
    if (players.length + Object.keys(netPlayers).length >= 8) return;
    const difficulty = $('ai-difficulty').value;
    const names = ['ECHO', 'VOLT', 'NEXUS', 'CIPHER', 'SURGE', 'PULSE'];
    const usedNames = players.map(p => p.name);
    const name = names.find(n => !usedNames.includes(n)) || `AI${players.length + 1}`;
    const id = 'ai_' + Date.now() + Math.random();
    players.push({ name, scheme: 'ai', net: false, id, ai: true, aiDifficulty: difficulty });
    updateLobby();
});

$('player-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('add-local-btn').click();
});

// ============================================
// SESSION LEADERBOARD
// ============================================
function renderLeaderboard() {
    const keys = Object.keys(sessionLB);
    if (!keys.length) {
        $('leaderboard-section').style.display = 'none';
        return;
    }
    $('leaderboard-section').style.display = 'block';
    const sorted = keys.sort((a, b) => sessionLB[b] - sessionLB[a]);
    $('lb-rows').innerHTML = sorted.slice(0, 6).map((name, i) => `
    <div class="lb-row ${i === 0 ? 'lb-top' : ''}">
      <span>${i === 0 ? '🏆' : i + 1 + '.'} ${name}</span>
      <span>${sessionLB[name]} pts</span>
    </div>`).join('');
}

function renderAchievements() {
    const display = $('achievement-display');
    const unlockedCount = Object.keys(achievementSystem.unlocked).length;
    $('achievement-count').textContent = `(${unlockedCount}/${ACHIEVEMENTS.length})`;
    
    display.innerHTML = ACHIEVEMENTS.map(ach => {
        const unlocked = achievementSystem.unlocked[ach.id];
        return `<div class="achievement-badge ${!unlocked ? 'locked' : ''}" data-locked="${!unlocked}" data-desc="${ach.title}: ${ach.desc}" title="${ach.title}">${unlocked ? ach.icon : '?'}</div>`;
    }).join('');
}

// ============================================
// NETWORK FUNCTIONS
// ============================================
function genCode() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

$('gen-room-btn').addEventListener('click', () => {
    myRoomCode = genCode();
    $('room-code-display').textContent = myRoomCode;
    isHost = true;
    bc = new BroadcastChannel('gt3_' + myRoomCode);
    bc.onmessage = handleNet;
    $('net-status').textContent = '📡 Hosting — share code';
    $('gen-room-btn').textContent = 'HOSTING';
    $('gen-room-btn').disabled = true;
});

$('join-room-btn').addEventListener('click', () => {
    const code = $('join-code-input').value.trim().toUpperCase();
    if (code.length !== 6) {
        $('net-status').textContent = 'Enter 6-char code';
        return;
    }
    bc = new BroadcastChannel('gt3_' + code);
    bc.onmessage = handleNet;
    isHost = false;
    myRoomCode = code;
    const name = $('player-name-input').value.trim().toUpperCase() || 'NET';
    const myId = 'net_' + Date.now();
    bc.postMessage({ type: 'join', id: myId, name });
    $('net-status').textContent = '🔗 Joining ' + code + '...';
});

function handleNet(e) {
    const m = e.data;
    if (m.type === 'join') {
        netPlayers[m.id] = { name: m.name, id: m.id, net: true, scheme: 'net' };
        updateLobby();
        if (isHost && bc) bc.postMessage({ type: 'roster', players: Object.values(netPlayers) });
        $('net-status').textContent = m.name + ' joined';
    }
    if (m.type === 'roster') {
        m.players.forEach(p => {
            if (!netPlayers[p.id]) netPlayers[p.id] = p;
        });
        updateLobby();
    }
    if (m.type === 'start') startGame(m.seed, m.mode, m.intensity, m.dur, m.pups, m.theme);
    if (m.type === 'tag') applyTag(m.tagged, m.tagger);
}

// ============================================
// GAME START
// ============================================
$('start-btn').addEventListener('click', () => {
    const seed = Math.random();
    const mode = $('game-mode').value;
    const intensity = $('glitch-intensity').value;
    const dur = parseInt($('round-duration').value);
    const pups = $('powerup-setting').value === 'on';
    const theme = $('arena-theme').value;
    if (isHost && bc) bc.postMessage({ type: 'start', seed, mode, intensity, dur, pups, theme });
    startGame(seed, mode, intensity, dur, pups, theme);
});

function mulberry32(a) {
    return function () {
        a |= 0;
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function startGame(seed, mode, intensity, duration, pupsOn, theme) {
    clearTimers();
    showScreen('game');
    const allPlayers = [...players, ...Object.values(netPlayers)];
    const arena = getArena();
    const rng = mulberry32((seed * 0xffffffff) | 0);
    matchStats = { totalTags: 0, glitches: 0, pickups: 0, longestStreak: 0 };
    obstacles = [];
    zones = [];
    pickups = [];
    projectiles = [];
    decoys = [];

    // Apply theme
    $('arena-inner').className = '';
    if (theme) $('arena-inner').classList.add(theme);

    // Mode badge
    const modeNames = { classic: 'CLASSIC', infection: 'INFECTION', potato: 'POTATO', assassin: 'ASSASSIN' };
    $('mode-badge-hud').textContent = modeNames[mode] || mode.toUpperCase();

    // Obstacles
    const nObs = 4 + Math.floor(rng() * 5);
    for (let i = 0; i < nObs; i++) {
        const w = 35 + rng() * 80, h = 18 + rng() * 38;
        obstacles.push({ px: 0.05 + rng() * 0.65, py: 0.08 + rng() * 0.65, pw: w / arena.w, ph: h / arena.h });
    }

    // Zones
    const nZ = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < nZ; i++) {
        const sz = 0.11 + rng() * 0.13;
        zones.push({
            px: 0.05 + rng() * 0.75, py: 0.05 + rng() * 0.75,
            pw: sz, ph: sz * (0.5 + rng() * 0.5),
            type: ZONE_TYPES[Math.floor(rng() * 3)]
        });
    }

    // Assign assassin targets
    let targets = {};
    if (mode === 'assassin') {
        const ids = allPlayers.map((p, i) => i);
        const shuffled = [...ids].sort(() => rng() - 0.5);
        allPlayers.forEach((_, i) => { targets[i] = shuffled[(i + 1) % allPlayers.length]; });
    }

    // Assign teams for team modes
    let teams = {};
    const isTeamMode = ['team2v2', 'ctf', 'koth'].includes(mode);
    if (isTeamMode) {
        allPlayers.forEach((_, i) => { teams[i] = i % 2; }); // Alternate team assignment
    }

    gameState = {
        players: allPlayers.map((p, i) => ({
            ...p,
            x: (0.08 + (i % 4) * 0.22) * arena.w,
            y: (0.18 + Math.floor(i / 4) * 0.58) * arena.h,
            isIt: i === 0 && !isTeamMode,
            score: 0,
            colorIdx: i,
            team: teams[i] || null,
            lastTagTime: 0,
            streak: 0,
            tagsMade: 0,
            tagsTaken: 0,
            shield: false,
            frozen: false,
            ghosted: false,
            magnet: false,
            hasShot: false,
            _timers: {},
            _speedMult: 1,
            infected: mode === 'infection' && i === 0,
            eliminated: false,
            survivedMs: 0,
            assassinTarget: targets[i] !== undefined ? targets[i] : null,
            rageLevel: 0,
            dashCooldown: 0,
            isDashing: false,
            dashDir: { x: 0, y: 0 },
            momentum: { x: 0, y: 0 },
        })),
        timeLeft: duration,
        intensity,
        pupsOn,
        mode,
        glitchInverted: false,
        running: false,
        frenzy: false,
        potatoHolder: 0,
        potatoTimer: mode === 'potato' ? 15 : 0,
        teamScores: { 0: 0, 1: 0 },
        isTeamMode: isTeamMode,
    };

    // Initialize AI players
    aiPlayers = {};
    allPlayers.forEach(p => {
        if (p.ai) {
            aiPlayers[p.id] = new AIPlayer(p.aiDifficulty || 'medium');
        }
    });

    setupHeatmap();
    renderArena();

    doCountdown(mode, () => {
        gameState.running = true;
        startTimer();
        scheduleGlitch();
        initWeather();
        startLoop();
        if (pupsOn) pickupInterval = setInterval(spawnPickup, PICKUP_SPAWN);
        if (mode === 'potato') potatoInterval = setInterval(tickPotato, 1000);
        if (mode === 'infection') {
            const infOverlay = document.createElement('div');
            infOverlay.className = 'infection-overlay';
            $('arena-inner').appendChild(infOverlay);
        }
        rageInterval = setInterval(tickRage, 500);
        $('rage-wrap').style.display = mode === 'classic' || mode === 'potato' ? 'flex' : 'none';
    });
}

function clearTimers() {
    if (animId) cancelAnimationFrame(animId);
    if (timerInterval) clearInterval(timerInterval);
    if (glitchTimeout) clearTimeout(glitchTimeout);
    if (pickupInterval) clearInterval(pickupInterval);
    if (potatoInterval) clearInterval(potatoInterval);
    if (rageInterval) clearInterval(rageInterval);
    clearWeather();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', offKey);
}

// ============================================
// HEATMAP
// ============================================
function setupHeatmap() {
    const canvas = $('heatmap-canvas');
    const arena = getArena();
    canvas.width = arena.w;
    canvas.height = arena.h;
    heatCtx = canvas.getContext('2d');
    heatCtx.clearRect(0, 0, canvas.width, canvas.height);
}

function paintHeat(p) {
    if (!heatCtx) return;
    const c = PLAYER_COLORS[p.colorIdx];
    heatCtx.beginPath();
    const grad = heatCtx.createRadialGradient(p.x + PW / 2, p.y + PH / 2, 0, p.x + PW / 2, p.y + PH / 2, 10);
    grad.addColorStop(0, c.bg + '22');
    grad.addColorStop(1, 'transparent');
    heatCtx.fillStyle = grad;
    heatCtx.arc(p.x + PW / 2, p.y + PH / 2, 10, 0, Math.PI * 2);
    heatCtx.fill();
}

// ============================================
// COUNTDOWN
// ============================================
function doCountdown(mode, cb) {
    let n = 3;
    const ov = document.createElement('div');
    ov.className = 'countdown-overlay';
    $('arena-inner').appendChild(ov);
    const modeDesc = { classic: 'CLASSIC TAG', infection: 'INFECTION', potato: 'HOT POTATO', assassin: 'ASSASSIN' };

    function tick() {
        sfxCountdown(n);
        ov.innerHTML = n > 0
            ? `<div class="countdown-mode">${modeDesc[mode] || ''}</div>
         <div class="countdown-num" style="color:${n === 1 ? '#ff2255' : n === 2 ? '#ffcc00' : '#00ff88'}">${n}</div>
         <div class="countdown-label">GET READY</div>`
            : `<div class="countdown-num" style="color:#00ff88;font-size:3.5rem">GO!</div>`;
        if (n === 0) {
            setTimeout(() => {
                ov.remove();
                cb();
            }, 600);
            return;
        }
        n--;
        setTimeout(tick, 900);
    }
    tick();
}

// ============================================
// ARENA RENDER
// ============================================
function getArena() {
    const el = $('arena-inner');
    return { w: el.offsetWidth || 820, h: el.offsetHeight || 512 };
}

function posEl(el, x, y, w, h) {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (w !== undefined) el.style.width = w + 'px';
    if (h !== undefined) el.style.height = h + 'px';
}

function renderArena() {
    // keep canvas + glitch-banner + kill-feed
    const canvas = $('heatmap-canvas');
    const gb = $('glitch-banner');
    const kf = $('kill-feed') || document.createElement('div');
    $('arena-inner').innerHTML = '';
    $('arena-inner').appendChild(canvas);
    $('arena-inner').appendChild(gb);
    const newKf = document.createElement('div');
    newKf.id = 'kill-feed';
    $('arena-inner').appendChild(newKf);

    // mode text
    const modeLabels = {
        infection: 'INFECTION MODE — LAST SURVIVOR WINS',
        potato: 'HOT POTATO — DON\'T HOLD IT!',
        assassin: 'ASSASSIN — TAG YOUR TARGET ONLY',
        classic: ''
    };
    if (modeLabels[gameState.mode]) {
        const ml = document.createElement('div');
        ml.className = 'mode-overlay-text';
        ml.textContent = modeLabels[gameState.mode];
        $('arena-inner').appendChild(ml);
    }

    const arena = getArena();
    zones.forEach((z, i) => {
        const el = document.createElement('div');
        el.className = 'zone zone-' + z.type;
        el.id = 'zone_' + i;
        posEl(el, z.px * arena.w, z.py * arena.h, z.pw * arena.w, z.ph * arena.h);
        const lbl = document.createElement('div');
        lbl.className = 'zone-label';
        lbl.textContent = z.type.toUpperCase();
        el.appendChild(lbl);
        $('arena-inner').appendChild(el);
    });

    obstacles.forEach((o, i) => {
        const el = document.createElement('div');
        el.className = 'obstacle';
        el.id = 'obs_' + i;
        posEl(el, o.px * arena.w, o.py * arena.h, o.pw * arena.w, o.ph * arena.h);
        $('arena-inner').appendChild(el);
    });

    gameState.players.forEach(p => {
        const c = PLAYER_COLORS[p.colorIdx];
        const el = document.createElement('div');
        el.className = 'player-el' + (p.isIt ? ' is-it' : '') + (p.infected && !p.isIt ? ' infected' : '');
        el.id = 'player_' + p.id;
        el.style.cssText = `background:${c.bg};color:${c.txt};left:${p.x}px;top:${p.y}px;`;
        el.textContent = p.name.slice(0, 2);
        // name tag
        const nt = document.createElement('div');
        nt.className = 'player-name-tag';
        nt.textContent = p.name;
        nt.style.color = c.bg;
        el.appendChild(nt);
        $('arena-inner').appendChild(el);
        // assassin target indicator
        if (gameState.mode === 'assassin' && p.assassinTarget !== null) {
            updateTargetIndicator(p);
        }
    });
    renderHUD();
}

function updateTargetIndicator(p) {
    const el = document.getElementById('player_' + p.id);
    if (!el) return;
    const old = el.querySelector('.target-indicator');
    if (old) old.remove();
    const target = gameState.players[p.assassinTarget];
    if (!target) return;
    const tc = PLAYER_COLORS[target.colorIdx];
    const ti = document.createElement('div');
    ti.className = 'target-indicator';
    ti.innerHTML = `🎯<span style="color:${tc.bg}">${target.name.slice(0, 4)}</span>`;
    el.appendChild(ti);
}

function renderHUD() {
    if (!gameState) return;
    const sb = $('score-board');
    sb.innerHTML = '';
    
    if (gameState.isTeamMode) {
        // Team mode display
        const t1Score = gameState.teamScores[0] || 0;
        const t2Score = gameState.teamScores[1] || 0;
        sb.innerHTML = `
            <div class="score-pill" style="color:#00ff88;border-color:#00ff88;">TEAM 1: ${t1Score}</div>
            <div class="score-pill" style="color:#ff2255;border-color:#ff2255;">TEAM 2: ${t2Score}</div>
        `;
    } else {
        // Individual mode display
        gameState.players.forEach((p, i) => {
            const c = PLAYER_COLORS[p.colorIdx];
            const pill = document.createElement('div');
            pill.className = 'score-pill';
            pill.style.color = c.bg;
            pill.style.borderColor = c.bg;
            if (p.eliminated) pill.style.opacity = '0.3';
            let extra = '';
            if (p.isIt) extra = '<span class="tag-badge">IT</span>';
            if (gameState.mode === 'infection' && p.infected) extra = '<span style="font-size:0.48rem;margin-left:2px;color:#cc44ff">INF</span>';
            if (gameState.mode === 'potato' && gameState.potatoHolder === i) extra = '<span style="font-size:0.55rem;margin-left:2px">🥔</span>';
            pill.innerHTML = `${p.name.slice(0, 4)}: ${p.score}${extra}`;
            sb.appendChild(pill);
        });
    }
    
    const itP = gameState.players.find(p => p.isIt);
    if (itP) {
        $('it-display').textContent = 'IT: ' + itP.name;
        $('it-display').style.color = PLAYER_COLORS[itP.colorIdx].bg;
    } else if (gameState.isTeamMode) {
        $('it-display').textContent = 'TEAMS: 1v1';
        $('it-display').style.color = 'var(--accent)';
    } else {
        $('it-display').textContent = 'IT: —';
        $('it-display').style.color = 'var(--muted)';
    }
}

// ============================================
// GAME LOOP
// ============================================
let lastTime = 0;

function startLoop() {
    keysDown = {};
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', offKey);
    setupTouch();
    lastTime = performance.now();
    loop(lastTime);
}

function onKey(e) {
    keysDown[e.key.toLowerCase()] = true;
    keysDown[e.key] = true;
}

function offKey(e) {
    keysDown[e.key.toLowerCase()] = false;
    keysDown[e.key] = false;
}

function setupTouch() {
    const wrap = $('arena-wrap');
    let sx = 0, sy = 0;
    wrap.addEventListener('touchstart', e => {
        const t = e.touches[0];
        sx = t.clientX;
        sy = t.clientY;
        e.preventDefault();
    }, { passive: false });
    wrap.addEventListener('touchmove', e => {
        const t = e.touches[0];
        const dx = t.clientX - sx, dy = t.clientY - sy;
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag > 5) {
            touchVec.x = dx / Math.max(mag, 40);
            touchVec.y = dy / Math.max(mag, 40);
        }
        e.preventDefault();
    }, { passive: false });
    wrap.addEventListener('touchend', () => {
        touchVec.x = 0;
        touchVec.y = 0;
    });
}

function getInput(p) {
    // AI Player input
    if (p.ai && aiPlayers[p.id]) {
        const arena = getArena();
        const input = aiPlayers[p.id].decide(p, gameState, arena);
        return input;
    }
    
    const m = CTRL[p.scheme] || {};
    let dx = 0, dy = 0;
    
    // DIRECT keyboard checking
    if (keysDown[m.up]) { dy -= 1; }
    if (keysDown[m.down]) { dy += 1; }
    if (keysDown[m.left]) { dx -= 1; }
    if (keysDown[m.right]) { dx += 1; }
    
    // Log only on human player with movement
    if (dx || dy) {
        if (Math.random() < 0.02) {
            console.log('getInput for human:', { scheme: p.scheme, m, keys_checked: [m.up, m.down, m.left, m.right], keysDown_values: [keysDown[m.up], keysDown[m.down], keysDown[m.left], keysDown[m.right]], result: {dx, dy} });
        }
    }
    
    // Detect double-tap dashes for human players (but still allow movement)
    if (!p.ai && p.scheme !== 'net') {
        if (keysDown[m.up]) attemptDash(p, 'up');
        if (keysDown[m.down]) attemptDash(p, 'down');
        if (keysDown[m.left]) attemptDash(p, 'left');
        if (keysDown[m.right]) attemptDash(p, 'right');
    }
    
    if (p.scheme === 'wasd' && (Math.abs(touchVec.x) > 0.1 || Math.abs(touchVec.y) > 0.1)) {
        dx = touchVec.x;
        dy = touchVec.y;
    }
    if (gameState.glitchInverted) {
        dx = -dx;
        dy = -dy;
    }
    return { dx, dy };
}

// ============================================
// DASH MECHANIC
// ============================================
const DASH_CONFIG = {
    cooldown: 1200,      // ms between dashes
    duration: 300,       // how long the dash lasts (ms)
    speed: 12,           // dash speed multiplier
    doubleTapWindow: 300 // ms to detect double-tap
};

function attemptDash(p, dirKey) {
    if (p.dashCooldown > 0 || p.isDashing) return false;
    
    const now = Date.now();
    const key = `${p.id}_${dirKey}`;
    
    if (!keyPressTimings[key]) {
        keyPressTimings[key] = now;
        return false;
    }
    
    const timeSinceLastPress = now - keyPressTimings[key];
    if (timeSinceLastPress < DASH_CONFIG.doubleTapWindow) {
        // Double-tap detected!
        keyPressTimings[key] = 0;
        triggerDash(p, dirKey);
        return true;
    }
    
    keyPressTimings[key] = now;
    return false;
}

function triggerDash(p, dirKey) {
    const dirMap = { 'up': { x: 0, y: -1 }, 'down': { x: 0, y: 1 }, 'left': { x: -1, y: 0 }, 'right': { x: 1, y: 0 } };
    const dir = dirMap[dirKey] || { x: 0, y: 0 };
    const len = Math.hypot(dir.x, dir.y) || 1;
    
    p.isDashing = true;
    p.dashDir = { x: dir.x / len, y: dir.y / len };
    p.dashCooldown = DASH_CONFIG.cooldown;
    
    sfxDash();
    spawnParticles(p.x + PW / 2, p.y + PH / 2, '#44ffcc', 12);
    
    setTimeout(() => {
        p.isDashing = false;
    }, DASH_CONFIG.duration);
}

function sfxDash() {
    playTone(1000, 'sine', 0.08, 0.3);
    playTone(1400, 'sine', 0.1, 0.2, 0.05);
}

function loop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = Math.min(ts - lastTime, 50);
    lastTime = ts;
    if (gameState && gameState.running && !paused) {
        update(dt);
    }
    animId = requestAnimationFrame(loop);
}

function update(dt) {
    const arena = getArena();
    const now = Date.now();
    trailAccum += dt;
    const doTrail = trailAccum > 45;
    if (doTrail) trailAccum = 0;

    gameState.players.forEach((p, idx) => {
        if (p.net || p.frozen || p.eliminated) return;
        let { dx, dy } = getInput(p);
        
        // Normalize movement vector if there's input
        const mag = Math.hypot(dx, dy);
        if (mag > 0.1) {
            dx /= mag;
            dy /= mag;
        }
        
        // Update cooldowns
        p.dashCooldown = Math.max(0, p.dashCooldown - dt);
        
        // Calculate movement based on state
        let moveX = 0, moveY = 0;
        
        if (p.isDashing && mag > 0.1) {
            // DASH STATE: use dash direction and speed
            moveX = p.dashDir.x * DASH_CONFIG.speed;
            moveY = p.dashDir.y * DASH_CONFIG.speed;
        } else if (mag > 0.1) {
            // MOVING STATE: apply normalized direction * speed + momentum
            const baseMoveX = dx * SPEED;
            const baseMoveY = dy * SPEED;
            
            // Accumulate momentum
            p.momentum.x = p.momentum.x * 0.9 + baseMoveX * 0.1;
            p.momentum.y = p.momentum.y * 0.9 + baseMoveY * 0.1;
            
            moveX = baseMoveX + p.momentum.x * 0.1;
            moveY = baseMoveY + p.momentum.y * 0.1;
            
            // Apply modifiers
            let modSpd = p._speedMult || 1;
            if (p.isIt && p.rageLevel >= 100) modSpd *= 1.6;
            if (currentWeather && currentWeather.friction) modSpd *= currentWeather.friction;
            
            moveX *= modSpd;
            moveY *= modSpd;
            
            // Zone effects
            const cx = p.x + PW / 2, cy = p.y + PH / 2;
            zones.forEach(z => {
                const zx = z.px * arena.w, zy = z.py * arena.h, zw = z.pw * arena.w, zh = z.ph * arena.h;
                if (cx > zx && cx < zx + zw && cy > zy && cy < zy + zh) {
                    if (z.type === 'boost') { moveX *= 1.65; moveY *= 1.65; }
                    if (z.type === 'slow') { moveX *= 0.45; moveY *= 0.45; }
                }
            });
            
            // Weather effects (after all multipliers)
            if (currentWeather && currentWeather.gravity) moveY += 0.5 * SPEED;
        } else {
            // NO INPUT: coast with momentum only
            p.momentum.x *= 0.85;
            p.momentum.y *= 0.85;
            moveX = p.momentum.x;
            moveY = p.momentum.y;
        }
        
        let nx = p.x + moveX;
        let ny = p.y + moveY;
        
        // DEBUG
        if (idx === 0 && Math.random() < 0.05) {
            console.log(`P${idx}: input_mag=${mag.toFixed(2)}, dash=${p.isDashing}, move=[${moveX.toFixed(1)},${moveY.toFixed(1)}], pos=[${nx.toFixed(0)},${ny.toFixed(0)}]`);
        }
        
        nx = Math.max(0, Math.min(arena.w - PW, nx));
        ny = Math.max(0, Math.min(arena.h - PH, ny));
        
        if (!p.ghosted) {
            obstacles.forEach(o => {
                const ox = o.px * arena.w, oy = o.py * arena.h, ow = o.pw * arena.w, oh = o.ph * arena.h;
                if (nx < ox + ow && nx + PW > ox && ny < oy + oh && ny + PH > oy) {
                    const oL = (nx + PW) - ox, oR = (ox + ow) - nx, oT = (ny + PH) - oy, oB = (oy + oh) - ny;
                    const mH = Math.min(oL, oR), mV = Math.min(oT, oB);
                    if (mH < mV) {
                        nx = oL < oR ? ox - PW : ox + ow;
                    } else {
                        ny = oT < oB ? oy - PH : oy + oh;
                    }
                }
            });
        }
        
        p.x = nx;
        p.y = ny;
        
        if (doTrail && (Math.abs(moveX) > 0.1 || Math.abs(moveY) > 0.1)) {
            spawnTrail(p);
            paintHeat(p);
        }
        
        const el = document.getElementById('player_' + p.id);
        if (el) {
            el.style.left = p.x + 'px';
            el.style.top = p.y + 'px';
            if (p.isDashing) el.classList.add('dashing');
            else el.classList.remove('dashing');
        }
    });

    // Magnet effect
    const itP = gameState.players.find(p => p.isIt);
    if (itP && itP.magnet) {
        gameState.players.forEach(runner => {
            if (runner.isIt || runner.net || runner.eliminated) return;
            const dx = itP.x - runner.x, dy = itP.y - runner.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5 && dist < 220) {
                runner.x += dx / dist * 1.8;
                runner.y += dy / dist * 1.8;
                const el = document.getElementById('player_' + runner.id);
                if (el) {
                    el.style.left = runner.x + 'px';
                    el.style.top = runner.y + 'px';
                }
            }
        });
    }

    // Projectiles
    updateProjectiles(arena);

    // Pickups
    pickups.forEach(pu => {
        if (!pu.active) return;
        gameState.players.forEach(p => {
            if (p.eliminated) return;
            if (Math.abs(p.x - pu.x) < PW + 8 && Math.abs(p.y - pu.y) < PH + 8) collectPickup(p, pu);
        });
    });

    // Tags
    checkTags(now);
}

// ============================================
// PROJECTILES
// ============================================
function fireShot(shooter) {
    if (!shooter.hasShot) return;
    shooter.hasShot = false;
    sfxShot();
    const arena = getArena();
    // fire in the direction they're roughly moving — fallback: toward nearest player
    const itP = gameState.players.find(p => p.isIt && p.id !== shooter.id);
    const targets = gameState.players.filter(p => p.id !== shooter.id && !p.eliminated);
    if (!targets.length) return;
    const closest = targets.reduce((a, b) => {
        const da = Math.hypot(a.x - shooter.x, a.y - shooter.y);
        const db = Math.hypot(b.x - shooter.x, b.y - shooter.y);
        return da < db ? a : b;
    });
    const dx = closest.x - shooter.x, dy = closest.y - shooter.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const proj = {
        x: shooter.x + PW / 2, y: shooter.y + PH / 2,
        vx: (dx / dist) * 8, vy: (dy / dist) * 8,
        owner: shooter, active: true,
        id: 'proj_' + Date.now(),
    };
    projectiles.push(proj);
    const el = document.createElement('div');
    el.className = 'projectile';
    el.id = proj.id;
    el.style.left = proj.x + 'px';
    el.style.top = proj.y + 'px';
    $('arena-inner').appendChild(el);
}

function updateProjectiles(arena) {
    projectiles.forEach(proj => {
        if (!proj.active) return;
        proj.x += proj.vx;
        proj.y += proj.vy;
        const el = document.getElementById(proj.id);
        if (el) {
            el.style.left = (proj.x - 4) + 'px';
            el.style.top = (proj.y - 4) + 'px';
        }
        // bounds
        if (proj.x < 0 || proj.x > arena.w || proj.y < 0 || proj.y > arena.h) {
            proj.active = false;
            if (el) el.remove();
            return;
        }
        // wall bounce
        let bounced = false;
        obstacles.forEach(o => {
            const ox = o.px * arena.w, oy = o.py * arena.h, ow = o.pw * arena.w, oh = o.ph * arena.h;
            if (proj.x > ox && proj.x < ox + ow && proj.y > oy && proj.y < oy + oh) {
                proj.vx *= -1;
                proj.vy *= -1;
                bounced = true;
            }
        });
        // hit player
        gameState.players.forEach(p => {
            if (p.id === proj.owner.id || p.eliminated) return;
            if (Math.abs(p.x + PW / 2 - proj.x) < PW / 2 + 4 && Math.abs(p.y + PH / 2 - proj.y) < PH / 2 + 4) {
                if (p.shield) {
                    sfxShield();
                    blockShield(p);
                    proj.active = false;
                    if (el) el.remove();
                    return;
                }
                applyTag(p.id, proj.owner.id);
                proj.active = false;
                if (el) el.remove();
                spawnParticles(proj.x, proj.y, '#ffcc00', 8);
            }
        });
    });
}

// ============================================
// DECOYS
// ============================================
function spawnDecoy(p) {
    const c = PLAYER_COLORS[p.colorIdx];
    const el = document.createElement('div');
    el.className = 'decoy-el';
    el.style.cssText = `background:${c.bg}44;color:${c.txt};left:${p.x}px;top:${p.y}px;`;
    el.textContent = p.name.slice(0, 2);
    $('arena-inner').appendChild(el);
    decoys.push({ x: p.x, y: p.y, owner: p, el });
    setTimeout(() => {
        el.remove();
        decoys = decoys.filter(d => d.el !== el);
    }, 5000);
}

// ============================================
// CHECK TAGS
// ============================================
function checkTags(now) {
    const mode = gameState.mode;
    if (mode === 'infection') {
        const infected = gameState.players.filter(p => p.infected && !p.eliminated);
        const clean = gameState.players.filter(p => !p.infected && !p.eliminated);
        if (clean.length === 0) {
            endGame();
            return;
        }
        infected.forEach(inf => {
            clean.forEach(runner => {
                if (now - runner.lastTagTime < TAG_COOL || now - inf.lastTagTime < TAG_COOL) return;
                if (Math.abs(inf.x - runner.x) < PW && Math.abs(inf.y - runner.y) < PH) {
                    if (runner.shield) {
                        blockShield(runner);
                        return;
                    }
                    infectPlayer(runner, inf);
                }
            });
        });
        return;
    }
    if (mode === 'assassin') {
        gameState.players.forEach(p => {
            if (p.eliminated || p.net) return;
            const targetIdx = p.assassinTarget;
            if (targetIdx === null) return;
            const target = gameState.players[targetIdx];
            if (!target || target.eliminated) return;
            if (now - target.lastTagTime < TAG_COOL || now - p.lastTagTime < TAG_COOL) return;
            if (Math.abs(p.x - target.x) < PW && Math.abs(p.y - target.y) < PH) {
                if (target.shield) {
                    blockShield(target);
                    return;
                }
                applyAssassinTag(p, target);
            }
        });
        return;
    }
    if (['team2v2', 'ctf', 'koth'].includes(mode)) {
        // Team modes - tag only enemy team members
        gameState.players.forEach(p => {
            if (p.frozen || p.eliminated) return;
            gameState.players.forEach(opponent => {
                if (opponent.team === p.team || opponent.frozen || opponent.eliminated) return; // Same team or already dead
                if (now - opponent.lastTagTime < TAG_COOL || now - p.lastTagTime < TAG_COOL) return;
                if (Math.abs(p.x - opponent.x) < PW && Math.abs(p.y - opponent.y) < PH) {
                    if (opponent.shield) {
                        blockShield(opponent);
                        return;
                    }
                    applyTeamTag(p, opponent);
                }
            });
        });
        return;
    }
    // Classic + Potato
    const itP = gameState.players.find(p => p.isIt);
    if (!itP) return;
    gameState.players.forEach(runner => {
        if (runner.isIt || runner.frozen || runner.eliminated) return;
        if (now - runner.lastTagTime < TAG_COOL || now - itP.lastTagTime < TAG_COOL) return;
        if (Math.abs(itP.x - runner.x) < PW && Math.abs(itP.y - runner.y) < PH) {
            if (runner.shield) {
                sfxShield();
                blockShield(runner);
                return;
            }
            applyTag(runner.id, itP.id);
            if (bc && isHost) bc.postMessage({ type: 'tag', tagged: runner.id, tagger: itP.id });
        }
    });
}

// ============================================
// INFECTION MODE
// ============================================
function infectPlayer(runner, infector) {
    sfxEliminate();
    runner.infected = true;
    runner.lastTagTime = Date.now();
    infector.score++;
    matchStats.totalTags++;
    spawnParticles(runner.x, runner.y, '#cc44ff', 10);
    addKillFeed(infector, runner, 'INFECTED');
    const el = document.getElementById('player_' + runner.id);
    if (el) {
        el.className = 'player-el infected';
    }
    renderHUD();
    const alive = gameState.players.filter(p => !p.infected && !p.eliminated);
    if (alive.length === 0) endGame();
    else if (alive.length === 1) {
        alive[0].score += 3;
        const el2 = document.getElementById('player_' + alive[0].id);
        if (el2) el2.classList.add('survivor-glow');
        log(`// ${alive[0].name} IS THE LAST SURVIVOR!`);
        setTimeout(endGame, 2000);
    }
}

// ============================================
// ASSASSIN MODE
// ============================================
function applyAssassinTag(assassin, target) {
    sfxTag();
    spawnParticles(target.x, target.y, PLAYER_COLORS[target.colorIdx].bg, 10);
    assassin.score += 2;
    assassin.streak++;
    assassin.tagsMade++;
    target.tagsTaken++;
    matchStats.totalTags++;
    if (assassin.streak > matchStats.longestStreak) matchStats.longestStreak = assassin.streak;
    target.lastTagTime = Date.now();
    assassin.lastTagTime = Date.now();
    // reassign new target for assassin
    const alive = gameState.players.filter(p => !p.eliminated && p !== assassin);
    if (alive.length > 0) {
        assassin.assassinTarget = gameState.players.indexOf(alive[Math.floor(Math.random() * alive.length)]);
    }
    addKillFeed(assassin, target, 'ELIMINATED');
    updateTargetIndicator(assassin);
    renderHUD();
    $('combo-display').textContent = assassin.streak > 1 ? `${assassin.name} ×${assassin.streak}` : '';
    if (STREAK_MSGS[assassin.streak]) showStreakPopup(STREAK_MSGS[assassin.streak], PLAYER_COLORS[assassin.colorIdx].bg);
}

// ============================================
// HOT POTATO
// ============================================
function tickPotato() {
    if (!gameState || !gameState.running || paused) return;
    gameState.potatoTimer--;
    if (gameState.potatoTimer <= 0) {
        // Potato explodes — holder is eliminated
        const holder = gameState.players[gameState.potatoHolder];
        if (holder && !holder.eliminated) {
            sfxEliminate();
            holder.eliminated = true;
            const el = document.getElementById('player_' + holder.id);
            if (el) el.classList.add('eliminated');
            spawnParticles(holder.x, holder.y, '#ffcc00', 14);
            showBanner(`${holder.name}: EXPLODED! 💥`, '#ff7700');
            setTimeout(hideBanner, 2000);
            log(`// ${holder.name} HELD THE POTATO TOO LONG — ELIMINATED`);
            // pass potato to next alive player
            const alive = gameState.players.filter(p => !p.eliminated);
            if (alive.length <= 1) {
                endGame();
                return;
            }
            const next = alive[Math.floor(Math.random() * alive.length)];
            gameState.potatoHolder = gameState.players.indexOf(next);
            gameState.potatoTimer = 12 + Math.floor(Math.random() * 8);
            renderHUD();
        }
    }
    // potato holder transfer on touch
    const holder = gameState.players[gameState.potatoHolder];
    if (!holder || holder.eliminated) return;
    gameState.players.forEach((p, i) => {
        if (i === gameState.potatoHolder || p.eliminated) return;
        if (Math.abs(p.x - holder.x) < PW && Math.abs(p.y - holder.y) < PH) {
            gameState.potatoHolder = i;
            gameState.potatoTimer = 12 + Math.floor(Math.random() * 8);
            sfxTag();
            log(`// POTATO PASSED TO ${p.name}`);
            renderHUD();
        }
    });
    renderHUD();
}

// ============================================
// RAGE METER
// ============================================
function tickRage() {
    if (!gameState || !gameState.running || paused) return;
    const itP = gameState.players.find(p => p.isIt);
    if (!itP) return;
    itP.rageLevel = Math.min(100, itP.rageLevel + 3);
    const pct = itP.rageLevel;
    const rageBar = $('rage-bar');
    if (rageBar) {
        rageBar.style.width = pct + '%';
        rageBar.style.background = pct > 80 ? '#ff7700' : pct > 50 ? '#ffcc00' : '#ff2255';
    }
    const el = document.getElementById('player_' + itP.id);
    if (pct >= 100) {
        if (el && !el.classList.contains('raged')) el.classList.add('raged');
    } else {
        if (el) el.classList.remove('raged');
    }
}

// ============================================
// TAG (Classic)
// ============================================
function applyTag(taggedId, taggerId) {
    const tagged = gameState.players.find(p => p.id == taggedId);
    const tagger = gameState.players.find(p => p.id == taggerId);
    if (!tagged || !tagger) return;
    sfxTag();
    tagger.score++;
    tagger.streak++;
    tagger.tagsMade++;
    tagged.tagsTaken++;
    matchStats.totalTags++;
    if (tagger.streak > matchStats.longestStreak) matchStats.longestStreak = tagger.streak;
    tagger.rageLevel = 0; // reset rage on successful tag
    const now = Date.now();
    gameState.players.forEach(p => {
        p.isIt = false;
        p.lastTagTime = now;
    });
    tagged.isIt = true;
    tagged.streak = 0;
    spawnParticles(tagged.x, tagged.y, PLAYER_COLORS[tagger.colorIdx].bg, 10);
    addKillFeed(tagger, tagged, 'TAGGED');
    renderHUD();
    screenShake(160);
    if (STREAK_MSGS[tagger.streak]) showStreakPopup(STREAK_MSGS[tagger.streak], PLAYER_COLORS[tagger.colorIdx].bg);
    gameState.players.forEach(p => {
        const el = document.getElementById('player_' + p.id);
        if (!el) return;
        el.className = 'player-el' + (p.isIt ? ' is-it' : '') + (p.ghosted ? ' ghosted' : '') + (p.shield ? ' shielded' : '');
    });
    $('combo-display').textContent = tagger.streak > 1 ? `${tagger.name} ×${tagger.streak} STREAK` : '';
}

function applyTeamTag(tagger, tagged) {
    sfxTag();
    tagger.score++;
    tagger.tagsMade++;
    tagged.tagsTaken++;
    gameState.teamScores[tagger.team] = (gameState.teamScores[tagger.team] || 0) + 1;
    matchStats.totalTags++;
    const now = Date.now();
    tagged.lastTagTime = now;
    tagger.lastTagTime = now;
    
    spawnParticles(tagged.x, tagged.y, PLAYER_COLORS[tagger.colorIdx].bg, 10);
    addKillFeed(tagger, tagged, 'TAGGED');
    renderHUD();
    screenShake(160);
    
    // Check for team mode win conditions
    if (gameState.teamScores[tagger.team] >= 10) {
        log(`// TEAM ${tagger.team + 1} WINS!`);
        endGame();
    }
}

function blockShield(runner) {
    runner.shield = false;
    sfxShield();
    const el = document.getElementById('player_' + runner.id);
    if (el) el.classList.remove('shielded');
    spawnParticles(runner.x, runner.y, '#00ccff', 8);
    log(`// ${runner.name} SHIELD BLOCKED!`);
    showBanner(`${runner.name}: BLOCKED!`, '#00ccff');
    setTimeout(hideBanner, 1200);
    screenShake(150);
}

// ============================================
// PARTICLES
// ============================================
function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = 'particle';
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 4;
        const size = 3 + Math.random() * 5;
        el.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;background:${color};`;
        $('arena-inner').appendChild(el);
        let vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
        let life = 0;
        const tick = () => {
            life += 16;
            el.style.left = (parseFloat(el.style.left) + vx) + 'px';
            el.style.top = (parseFloat(el.style.top) + vy) + 'px';
            vy += 0.12;
            vx *= 0.95;
            el.style.opacity = Math.max(0, 1 - life / 500);
            if (life < 500 && el.parentNode) requestAnimationFrame(tick);
            else el.remove();
        };
        requestAnimationFrame(tick);
    }
}

// ============================================
// TRAILS
// ============================================
function spawnTrail(p) {
    const c = PLAYER_COLORS[p.colorIdx];
    const t = document.createElement('div');
    t.className = 'trail';
    t.style.cssText = `left:${p.x + 5}px;top:${p.y + 5}px;width:14px;height:14px;background:${c.bg};`;
    $('arena-inner').appendChild(t);
    setTimeout(() => t.remove(), 450);
}

// ============================================
// PICKUPS
// ============================================
function spawnPickup() {
    if (!gameState || !gameState.running || paused) return;
    const arena = getArena();
    const type = PICKUP_TYPES[Math.floor(Math.random() * PICKUP_TYPES.length)];
    const pu = {
        x: PW + Math.random() * (arena.w - PW * 3),
        y: PH + Math.random() * (arena.h - PH * 3),
        type, active: true,
        id: 'pu_' + Date.now()
    };
    pickups.push(pu);
    const el = document.createElement('div');
    el.className = 'pickup ' + type.cls;
    el.id = pu.id;
    posEl(el, pu.x, pu.y);
    el.textContent = type.icon;
    $('arena-inner').appendChild(el);
    setTimeout(() => {
        if (pu.active) {
            pu.active = false;
            const e = document.getElementById(pu.id);
            if (e) e.remove();
        }
    }, 9000);
}

function collectPickup(p, pu) {
    if (!pu.active) return;
    pu.active = false;
    sfxPickup();
    matchStats.pickups++;
    const el = document.getElementById(pu.id);
    if (el) {
        el.style.transform = 'scale(2.5)';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 200);
    }
    log(`// ${p.name} COLLECTED ${pu.type.icon} ${pu.type.id.toUpperCase()}`);
    showBanner(`${p.name}: ${pu.type.desc}`, pu.type.color);
    setTimeout(hideBanner, 1600);
    spawnParticles(pu.x, pu.y, pu.type.color, 6);
    const pel = document.getElementById('player_' + p.id);

    if (pu.type.id === 'shield') {
        p.shield = true;
        if (pel) pel.classList.add('shielded');
        clearTimeout(p._timers.shield);
        p._timers.shield = setTimeout(() => {
            p.shield = false;
            if (pel) pel.classList.remove('shielded');
        }, pu.type.dur);
    }
    if (pu.type.id === 'freeze') {
        sfxFreeze();
        gameState.players.forEach(other => {
            if (other.id === p.id) return;
            other.frozen = true;
            const oel = document.getElementById('player_' + other.id);
            if (oel) oel.classList.add('frozen');
            setTimeout(() => {
                other.frozen = false;
                if (oel) oel.classList.remove('frozen');
            }, pu.type.dur);
        });
        screenShake(250);
    }
    if (pu.type.id === 'ghost') {
        p.ghosted = true;
        if (pel) pel.classList.add('ghosted');
        clearTimeout(p._timers.ghost);
        p._timers.ghost = setTimeout(() => {
            p.ghosted = false;
            if (pel) pel.classList.remove('ghosted');
        }, pu.type.dur);
    }
    if (pu.type.id === 'magnet') {
        p.magnet = true;
        clearTimeout(p._timers.magnet);
        p._timers.magnet = setTimeout(() => { p.magnet = false; }, pu.type.dur);
    }
    if (pu.type.id === 'bomb') {
        const itP = gameState.players.find(x => x.isIt);
        const runners = gameState.players.filter(x => !x.isIt && !x.eliminated);
        if (runners.length && itP) {
            applyTag(runners[Math.floor(Math.random() * runners.length)].id, p.id);
            screenShake(400);
        }
    }
    if (pu.type.id === 'shot') {
        p.hasShot = true;
        // auto-fire toward nearest player after a brief moment
        setTimeout(() => { if (p.hasShot) fireShot(p); }, 200);
    }
    if (pu.type.id === 'decoy') { spawnDecoy(p); }
}

// ============================================
// KILL FEED
// ============================================
function addKillFeed(tagger, tagged, verb) {
    const kf = document.getElementById('kill-feed');
    if (!kf) return;
    const tc = PLAYER_COLORS[tagger.colorIdx].bg, dc = PLAYER_COLORS[tagged.colorIdx].bg;
    const e = document.createElement('div');
    e.className = 'kf-entry';
    e.style.borderColor = tc;
    e.innerHTML = `<span style="color:${tc}">${tagger.name}</span><span style="color:#444"> ${verb} </span><span style="color:${dc}">${tagged.name}</span>`;
    kf.appendChild(e);
    if (kf.children.length > 6) kf.firstChild.remove();
    setTimeout(() => e.remove(), 3000);
}

function showStreakPopup(msg, color) {
    const el = document.createElement('div');
    el.className = 'streak-pop';
    el.style.color = color;
    el.style.top = '28%';
    el.textContent = msg;
    $('arena-inner').appendChild(el);
    setTimeout(() => el.remove(), 1200);
}

function screenShake(dur) {
    const w = $('arena-wrap');
    w.classList.add('shaking');
    setTimeout(() => w.classList.remove('shaking'), dur);
}

// ============================================
// WEATHER SYSTEM
// ============================================
const WEATHER_TYPES = [
    { id: 'rain', name: 'RAIN', effect: 'Slippery movement', friction: 0.7 },
    { id: 'fog', name: 'FOG', effect: 'Reduced visibility', visibility: 0.6 },
    { id: 'storm', name: 'STORM', effect: 'Lightning strikes', stun: true },
    { id: 'gravity', name: 'GRAVITY FLUX', effect: 'Unstable gravity', gravity: true }
];

function initWeather() {
    if (Math.random() > 0.6) return; // 40% chance for weather
    currentWeather = WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)];
    log(`// WEATHER: ${currentWeather.name} INCOMING`);
    
    const weatherEl = document.createElement('div');
    weatherEl.id = 'weather-indicator';
    weatherEl.style.cssText = 'position:absolute;top:30px;right:60px;font-size:0.65rem;color:var(--warn);z-index:10;font-family:Orbitron;letter-spacing:0.1em;';
    weatherEl.textContent = `☁️ ${currentWeather.name}: ${currentWeather.effect}`;
    $('arena-inner').appendChild(weatherEl);
    
    if (currentWeather.id === 'storm') {
        weatherInterval = setInterval(strikeLightning, 2000);
    }
    if (currentWeather.id === 'fog') {
        $('arena-inner').classList.add('fog-effect');
    }
    if (currentWeather.id === 'rain') {
        spawnRain();
    }
}

function strikeLightning() {
    if (!gameState || !gameState.running) return;
    const arena = getArena();
    const strikex = Math.random() * arena.w;
    const strikey = Math.random() * arena.h;
    
    const bolt = document.createElement('div');
    bolt.style.cssText = `position:absolute;left:${strikex}px;top:${strikey}px;width:20px;height:80px;background:radial-gradient(circle,#ffff00,#fff,transparent);z-index:5;opacity:0.8;pointer-events:none;`;
    $('arena-inner').appendChild(bolt);
    
    sfxStrike();
    spawnParticles(strikex, strikey, '#ffff00', 10);
    screenShake(150);
    
    // Stun nearby players
    gameState.players.forEach(p => {
        if (p.eliminated) return;
        const dist = Math.hypot(p.x + PW/2 - strikex, p.y + PH/2 - strikey);
        if (dist < 100) {
            p.frozen = true;
            const el = document.getElementById('player_' + p.id);
            if (el) el.classList.add('frozen');
            setTimeout(() => {
                p.frozen = false;
                if (el) el.classList.remove('frozen');
            }, 1500);
        }
    });
    
    setTimeout(() => bolt.remove(), 200);
}

function sfxStrike() {
    playTone(200, 'sawtooth', 0.1, 0.4);
    playTone(400, 'sawtooth', 0.15, 0.3, 0.08);
}

function spawnRain() {
    const arena = getArena();
    for (let i = 0; i < 15; i++) {
        const drop = document.createElement('div');
        drop.style.cssText = `position:absolute;left:${Math.random() * arena.w}px;top:${Math.random() * arena.h}px;width:2px;height:10px;background:#00ccff;opacity:0.6;`;
        $('arena-inner').appendChild(drop);
        
        let y = parseInt(drop.style.top);
        const tick = () => {
            y += 5;
            drop.style.top = y + 'px';
            if (y < arena.h) requestAnimationFrame(tick);
            else drop.remove();
        };
        tick();
    }
}

function clearWeather() {
    if (weatherInterval) clearInterval(weatherInterval);
    currentWeather = null;
    const indicator = document.getElementById('weather-indicator');
    if (indicator) indicator.remove();
    $('arena-inner').classList.remove('fog-effect');
}

// ============================================
// TIMER
// ============================================
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (paused || !gameState) return;
        gameState.timeLeft--;
        const m = Math.floor(gameState.timeLeft / 60), s = gameState.timeLeft % 60;
        $('timer-display').textContent = m + ':' + String(s).padStart(2, '0');
        if (gameState.timeLeft === 30 && !gameState.frenzy) startFrenzy();
        if (gameState.timeLeft <= 10) $('timer-display').style.color = '#ff2255';
        if (gameState.timeLeft <= 0) endGame();
    }, 1000);
}

function startFrenzy() {
    gameState.frenzy = true;
    sfxFrenzy();
    const fr = document.createElement('div');
    fr.className = 'frenzy-overlay';
    $('arena-inner').appendChild(fr);
    showBanner('⚡ FRENZY — FINAL 30s ⚡', '#ff2255');
    setTimeout(hideBanner, 2200);
    log('// !! FRENZY MODE — GLITCH RATE DOUBLED !!');
    if (gameState.pupsOn) {
        clearInterval(pickupInterval);
        pickupInterval = setInterval(spawnPickup, PICKUP_SPAWN / 2);
    }
}

// ============================================
// GLITCHES (12 unique events)
// ============================================
const GLITCHES = [
    () => {
        gameState.glitchInverted = true;
        showBanner('CONTROLS: INVERTED', '#ff2255');
        log('// AXIS FLIP');
        setTimeout(() => {
            gameState.glitchInverted = false;
            hideBanner();
        }, 3000);
    },
    () => {
        $('arena-inner').classList.add('flickering');
        showBanner('VISUAL: CORRUPTED', '#ffcc00');
        setTimeout(() => {
            $('arena-inner').classList.remove('flickering');
            hideBanner();
        }, 2000);
    },
    () => {
        $('arena-inner').classList.add('rgb-shift');
        showBanner('CHROMATIC: ABERRATION', '#cc44ff');
        setTimeout(() => {
            $('arena-inner').classList.remove('rgb-shift');
            hideBanner();
        }, 2200);
    },
    () => { // spawn obstacle
        const arena = getArena();
        const w = 30 + Math.random() * 75, h = 14 + Math.random() * 35;
        const o = { px: 0.05 + Math.random() * 0.7, py: 0.05 + Math.random() * 0.7, pw: w / arena.w, ph: h / arena.h };
        obstacles.push(o);
        const el = document.createElement('div');
        el.className = 'obstacle';
        el.id = 'obs_' + (obstacles.length - 1);
        posEl(el, o.px * arena.w, o.py * arena.h, o.pw * arena.w, o.ph * arena.h);
        $('arena-inner').appendChild(el);
        log('// OBSTACLE SPAWNED');
    },
    () => {
        if (obstacles.length > 2) {
            const i = Math.floor(Math.random() * obstacles.length);
            const el = document.getElementById('obs_' + i);
            if (el) el.remove();
            obstacles.splice(i, 1);
            log('// OBSTACLE REMOVED');
        }
    },
    () => { // teleport
        const arena = getArena();
        const p = gameState.players.filter(p => !p.eliminated)[Math.floor(Math.random() * gameState.players.length)];
        p.x = PW + Math.random() * (arena.w - PW * 3);
        p.y = PH + Math.random() * (arena.h - PH * 3);
        const el = document.getElementById('player_' + p.id);
        if (el) {
            el.style.left = p.x + 'px';
            el.style.top = p.y + 'px';
        }
        spawnParticles(p.x, p.y, '#ff7700', 8);
        showBanner(`${p.name}: TELEPORTED`, '#ff7700');
        setTimeout(hideBanner, 1400);
        screenShake(180);
    },
    () => { // speed boost on random player
        const p = gameState.players.filter(p => !p.eliminated)[Math.floor(Math.random() * gameState.players.length)];
        const el = document.getElementById('player_' + p.id);
        if (el) el.style.outline = '2px solid #44ffcc';
        p._speedMult = 2.2;
        showBanner(`${p.name}: OVERCLOCK`, '#44ffcc');
        setTimeout(() => {
            p._speedMult = 1;
            if (el) el.style.outline = '';
            hideBanner();
        }, 3000);
    },
    () => { // gravity drift
        showBanner('GRAVITY: INVERTED', '#cc44ff');
        const start = Date.now();
        const tick = () => {
            if (!gameState || !gameState.running || Date.now() - start > 2600) {
                hideBanner();
                return;
            }
            gameState.players.forEach(p => {
                if (p.eliminated) return;
                p.y = Math.max(0, p.y - 1.4);
                const el = document.getElementById('player_' + p.id);
                if (el) el.style.top = p.y + 'px';
            });
            requestAnimationFrame(tick);
        };
        tick();
    },
    () => { // swap all positions
        showBanner('POSITIONS: SHUFFLED', '#cc44ff');
        const ps = gameState.players.filter(p => !p.eliminated);
        const pos = ps.map(p => ({ x: p.x, y: p.y }));
        for (let i = pos.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pos[i], pos[j]] = [pos[j], pos[i]];
        }
        ps.forEach((p, i) => {
            p.x = pos[i].x;
            p.y = pos[i].y;
            const el = document.getElementById('player_' + p.id);
            if (el) {
                el.style.left = p.x + 'px';
                el.style.top = p.y + 'px';
            }
        });
        screenShake(300);
        setTimeout(hideBanner, 1400);
    },
    () => { // random IT swap (classic only)
        if (gameState.mode !== 'classic' && gameState.mode !== 'potato') return;
        const runners = gameState.players.filter(p => !p.isIt && !p.eliminated);
        const itP = gameState.players.find(p => p.isIt);
        if (!runners.length || !itP) return;
        applyTag(runners[Math.floor(Math.random() * runners.length)].id, itP.id);
        showBanner('IT: RANDOMLY SWAPPED', '#ff2255');
        setTimeout(hideBanner, 1400);
    },
    () => { // mass speed
        showBanner('OVERDRIVE: ALL', '#44ffcc');
        gameState.players.forEach(p => { p._speedMult = 2.0; });
        setTimeout(() => {
            gameState.players.forEach(p => { p._speedMult = 1; });
            hideBanner();
        }, 2200);
    },
    () => { // horizontal mirror
        const arena = getArena();
        showBanner('MIRROR: FLIP', '#cc44ff');
        gameState.players.forEach(p => {
            if (p.eliminated) return;
            p.x = arena.w - PW - p.x;
            const el = document.getElementById('player_' + p.id);
            if (el) el.style.left = p.x + 'px';
        });
        screenShake(220);
        setTimeout(hideBanner, 1400);
    },
    () => { // arena zoom
        $('arena-wrap').classList.add('zoomed');
        setTimeout(() => $('arena-wrap').classList.remove('zoomed'), 400);
        showBanner('REALITY: DISTORTED', '#cc44ff');
        setTimeout(hideBanner, 1200);
    },
];

function scheduleGlitch() {
    if (glitchTimeout) clearTimeout(glitchTimeout);
    let delay = GLITCH_RATE[gameState.intensity] || 6500;
    if (gameState.frenzy) delay = Math.min(delay, 1600);
    const next = delay * 0.55 + Math.random() * delay * 0.9;
    glitchTimeout = setTimeout(() => {
        if (!gameState || !gameState.running || paused) {
            scheduleGlitch();
            return;
        }
        sfxGlitch();
        GLITCHES[Math.floor(Math.random() * GLITCHES.length)]();
        matchStats.glitches++;
        scheduleGlitch();
    }, next);
}

function showBanner(txt, color) {
    const gb = $('glitch-banner');
    gb.textContent = txt;
    gb.style.background = color || '#ff2255';
    gb.style.display = 'block';
}

function hideBanner() {
    const gb = $('glitch-banner');
    if (gb) gb.style.display = 'none';
}

function log(msg) {
    const el = $('glitch-log');
    if (el) el.textContent = msg;
}

// ============================================
// PAUSE / END
// ============================================
$('pause-btn').addEventListener('click', () => {
    paused = !paused;
    $('pause-btn').textContent = paused ? 'RESUME' : 'PAUSE';
    if (paused) log('// PAUSED');
    else {
        log('// RESUMED');
        scheduleGlitch();
    }
});

$('end-btn').addEventListener('click', endGame);

function endGame() {
    if (!gameState) return;
    gameState.running = false;
    clearTimers();
    if ($('arena-inner')) {
        $('arena-inner').classList.remove('flickering', 'rgb-shift');
    }
    showResults();
}

// ============================================
// RESULTS + AWARDS
// ============================================
function showResults() {
    const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
    $('winner-list').innerHTML = '';
    const medals = ['🥇', '🥈', '🥉'];

    // Update session LB
    sorted.forEach((p, i) => {
        const pts = Math.max(0, sorted.length - i);
        sessionLB[p.name] = (sessionLB[p.name] || 0) + pts;
    });

    sorted.forEach((p, i) => {
        const c = PLAYER_COLORS[p.colorIdx];
        const row = document.createElement('div');
        row.className = 'winner-row' + (i === 0 ? ' gold' : '') + (p.eliminated ? ' eliminated-row' : '');
        row.innerHTML = `<span><span class="rank">${medals[i] || '#' + (i + 1)}</span><span style="color:${c.bg}">${p.name}</span></span>
      <span>${p.score} pt${p.score !== 1 ? 's' : ''}</span>
      <div class="stats-mini"><span>tagged ${p.tagsMade}×</span><span>caught ${p.tagsTaken}×</span></div>`;
        $('winner-list').appendChild(row);
    });

    // Check Achievements
    if (!tutorialMode && sorted.length > 0) {
        const mvp = sorted[0];
        const matchResults = {
            tags: mvp.tagsMade || 0,
            longestStreak: matchStats.longestStreak,
            pickups: matchStats.pickups,
            mode: gameState.mode,
            survived: !mvp.eliminated,
            won: mvp === sorted[0]
        };
        const newAchievements = achievementSystem.checkAchievements(matchResults);
        if (newAchievements.length > 0) {
            log(`// 🏆 UNLOCKED: ${newAchievements.join(', ')}`);
        }
        achievementSystem.stats.totalTags += matchStats.totalTags;
        achievementSystem.stats.roundsPlayed++;
        achievementSystem.stats.pickupsCollected += matchStats.pickups;
        achievementSystem.save();
    }

    // Awards
    const awards = [];
    const topTagger = sorted.reduce((a, b) => a.tagsMade > b.tagsMade ? a : b);
    if (topTagger.tagsMade > 0) awards.push(`🏹 HITMAN: ${topTagger.name}`);
    const mostCaught = sorted.reduce((a, b) => a.tagsTaken > b.tagsTaken ? a : b);
    if (mostCaught.tagsTaken > 0) awards.push(`🎯 SLOWPOKE: ${mostCaught.name}`);
    if (matchStats.longestStreak >= 3) awards.push(`🔥 HOT STREAK: ×${matchStats.longestStreak}`);
    if (matchStats.glitches >= 5) awards.push(`⚡ CHAOTIC: ${matchStats.glitches} glitches`);
    $('award-row').innerHTML = awards.map(a => `<div class="award">${a}</div>`).join('');

    const mvp = sorted[0];
    if (mvp) $('mvp-banner').innerHTML = `★ MVP: <span style="color:${PLAYER_COLORS[mvp.colorIdx].bg}">${mvp.name}</span> — ${mvp.score} pts ★`;
    $('match-stats').innerHTML =
        `<span>Tags: <b>${matchStats.totalTags}</b></span>` +
        `<span>Glitches: <b>${matchStats.glitches}</b></span>` +
        `<span>Pickups: <b>${matchStats.pickups}</b></span>` +
        `<span>Best streak: <b>${matchStats.longestStreak}</b></span>`;

    $('result-modal').style.display = 'flex';
}

$('play-again-btn').addEventListener('click', () => {
    $('result-modal').style.display = 'none';
    const seed = Math.random();
    const mode = $('game-mode').value;
    const intensity = $('glitch-intensity').value;
    const dur = parseInt($('round-duration').value);
    const pups = $('powerup-setting').value === 'on';
    const theme = $('arena-theme').value;
    if (isHost && bc) bc.postMessage({ type: 'start', seed, mode, intensity, dur, pups, theme });
    startGame(seed, mode, intensity, dur, pups, theme);
});

$('back-lobby-btn').addEventListener('click', () => {
    $('result-modal').style.display = 'none';
    gameState = null;
    showScreen('lobby');
    $('timer-display').textContent = '—';
    $('timer-display').style.color = 'var(--warn)';
    $('combo-display').textContent = '';
    updateLobby();
});

// ============================================
// UTILS
// ============================================
const comboDisplay = $('combo-display');

function showScreen(n) {
    $('lobby-screen').className = 'screen' + (n === 'lobby' ? ' active' : '');
    $('game-screen').className = 'screen' + (n === 'game' ? ' active' : '');
}

window.addEventListener('resize', () => {
    if (!gameState || !gameState.running) return;
    const arena = getArena();
    obstacles.forEach((o, i) => {
        const el = document.getElementById('obs_' + i);
        if (el) posEl(el, o.px * arena.w, o.py * arena.h, o.pw * arena.w, o.ph * arena.h);
    });
    zones.forEach((z, i) => {
        const el = document.getElementById('zone_' + i);
        if (el) posEl(el, z.px * arena.w, z.py * arena.h, z.pw * arena.w, z.ph * arena.h);
    });
    setupHeatmap();
});

// ============================================
// ============================================
// BOOT
// ============================================
loadGraphicsSettings();
updateLobby();
startTitleGlitch();