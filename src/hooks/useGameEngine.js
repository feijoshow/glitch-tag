import { useEffect, useRef, useState } from 'react';
import { MAP_PRESETS, createInitialPlayers, getArchetypeById } from '../constants/game';

const PLAYER_RADIUS = 11;

const MODIFIER_META = {
  lowgravity: 'Low Gravity',
  speedstorm: 'Speed Storm',
  hazardsurge: 'Hazard Surge',
};

const COMPETITIVE_TUNING = {
  powerupSpawnInterval: 6,
  glitchPulseDelaySolo: 12.2,
  glitchPulseDelayTeam: 13.4,
  glitchPulseDamage: 3,
  shieldPickupMs: 1500,
  overloadItHeal: 12,
  overloadTagCdCut: 0.12,
  overloadRunnerSpeedMs: 1300,
  overloadRunnerDashMs: 350,
};

function getModifierPool() {
  return Object.keys(MODIFIER_META);
}

function getActiveModifierIds(game, isClassicPrecisionDuel) {
  return isClassicPrecisionDuel
    ? []
    : [game.modifiers.primary?.id, game.modifiers.secondary?.id].filter(Boolean);
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function getRoundDuration(gameSettings) {
  return gameSettings.mode === 'tournament' ? 45 : gameSettings.duration;
}

function getMapData(mapId, mapsCatalog) {
  return mapsCatalog[mapId] || MAP_PRESETS.core;
}

function collidesRect(x, y, rect, radius = PLAYER_RADIUS) {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return (dx * dx + dy * dy) < (radius * radius);
}

function getZoneEffect(player, zones) {
  for (const zone of zones) {
    const distance = Math.hypot(zone.x - player.x, zone.y - player.y);
    if (distance <= zone.r) return zone.type;
  }
  return null;
}

function segmentDistance(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const lenSq = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
  const projX = x1 + t * vx;
  const projY = y1 + t * vy;
  return Math.hypot(px - projX, py - projY);
}

function resolveObstacleFrame(baseMap, simTime) {
  const obstacles = (baseMap.obstacles || []).map((obstacle) => {
    if (!obstacle.motion) return { ...obstacle };
    const axis = obstacle.motion.axis || 'x';
    const amp = obstacle.motion.amplitude || 0;
    const speed = obstacle.motion.speed || 1;
    const phase = Math.sin(simTime * speed);
    const offset = amp * phase;
    return {
      ...obstacle,
      x: obstacle.x + (axis === 'x' ? offset : 0),
      y: obstacle.y + (axis === 'y' ? offset : 0),
    };
  });

  const hazards = (baseMap.hazards || []).map((hazard) => {
    const angle = simTime * (hazard.speed || 1) + (hazard.offset || 0);
    const half = (hazard.length || 100) / 2;
    const dx = Math.cos(angle) * half;
    const dy = Math.sin(angle) * half;
    return {
      ...hazard,
      angle,
      x1: hazard.x - dx,
      y1: hazard.y - dy,
      x2: hazard.x + dx,
      y2: hazard.y + dy,
    };
  });

  return {
    ...baseMap,
    obstacles,
    hazards,
  };
}

function makeInitialState(gameSettings, mapsCatalog) {
  const isClassicPrecision = gameSettings.mode === 'classic' && (gameSettings.classicProfile || 'precision') === 'precision';
  const effectivePlayerCount = isClassicPrecision ? 2 : gameSettings.playerCount;
  const effectiveAiBots = isClassicPrecision ? Math.min(gameSettings.aiBots || 0, 1) : (gameSettings.aiBots || 0);

  const pickModifiers = () => {
    const options = getModifierPool();
    if (gameSettings.roundModifier === 'none') {
      return { primary: null, secondary: null };
    }
    const shouldRandomize = gameSettings.roundModifier === 'random' || !options.includes(gameSettings.roundModifier);
    const chosen = shouldRandomize
      ? options[Math.floor(Math.random() * options.length)]
      : gameSettings.roundModifier;
    const secondaryPool = options.filter((option) => option !== chosen);
    const secondary = gameSettings.mode === 'team'
      ? null
      : secondaryPool[Math.floor(Math.random() * secondaryPool.length)] || null;
    return {
      primary: { id: chosen, label: MODIFIER_META[chosen] || 'Normal' },
      secondary: secondary ? { id: secondary, label: MODIFIER_META[secondary] || 'Normal' } : null,
    };
  };

  const baseMap = getMapData(gameSettings.mapId, mapsCatalog);
  const map = resolveObstacleFrame(baseMap, 0);
  const targetMaxHp = clampNumber(gameSettings.maxHp ?? 100, 40, 300, 100);
  const players = createInitialPlayers(effectivePlayerCount, {
    aiBots: effectiveAiBots,
    botPersonality: gameSettings.botPersonality || 'aggressive',
    aiSkills: {
      aggressive: gameSettings.aiSkillAggressive ?? 70,
      evasive: gameSettings.aiSkillEvasive ?? 65,
      support: gameSettings.aiSkillSupport ?? 60,
    },
    mode: gameSettings.mode,
    playerNames: gameSettings.playerNames || [],
    playerControls: gameSettings.playerControls || [],
  }).map((player) => ({
    ...player,
    maxHp: targetMaxHp,
    hp: Math.min(targetMaxHp, player.hp),
    displayHp: Math.min(targetMaxHp, player.hp),
    hasBeenIt: !!player.isIt,
    tagCombo: 0,
    tagComboExpiresAt: 0,
  }));

  return {
    players,
    pickups: [],
    timeLeft: getRoundDuration(gameSettings),
    status: 'running',
    winnerText: '',
    tournamentScore: {},
    teamScores: { alpha: 0, beta: 0 },
    modifiers: pickModifiers(),
    lateModifierApplied: false,
    round: 1,
    spawnAt: COMPETITIVE_TUNING.powerupSpawnInterval,
    objective: null,
    objectiveTimer: 9,
    glitchPulseAt: COMPETITIVE_TUNING.glitchPulseDelaySolo,
    feed: [],
    simTime: 0,
    map,
    teamMode: gameSettings.mode === 'team',
    events: [], // Track game events for effects (tags, abilities, clutch moments)
    maxCombo: 0, // Track highest combo in the match
  };
}

function pushFeed(game, text) {
  game.feed = [...game.feed, { id: `${Date.now()}-${Math.random()}`, t: game.simTime, text }].slice(-8);
}

function spawnObjective(game) {
  for (let i = 0; i < 14; i += 1) {
    const x = 40 + Math.random() * 560;
    const y = 40 + Math.random() * 340;
    const blocked = (game.map.obstacles || []).some((obstacle) => collidesRect(x, y, obstacle, 16));
    if (!blocked) {
      game.objective = { x, y, r: 10 };
      pushFeed(game, 'Objective core spawned');
      return;
    }
  }
}

function pickPowerupType() {
  const roll = Math.random();
  if (roll < 0.35) return 'heal';
  if (roll < 0.7) return 'speed';
  if (roll < 0.88) return 'shield';
  return 'overload';
}

function spawnPickup(game, now) {
  for (let i = 0; i < 18; i += 1) {
    const x = 34 + Math.random() * 572;
    const y = 34 + Math.random() * 352;
    const blockedByObstacle = (game.map.obstacles || []).some((obstacle) => collidesRect(x, y, obstacle, 18));
    const blockedByObjective = game.objective && Math.hypot(game.objective.x - x, game.objective.y - y) < 34;
    const blockedByPlayer = game.players.some((player) => !player.eliminated && Math.hypot(player.x - x, player.y - y) < 28);
    if (!blockedByObstacle && !blockedByObjective && !blockedByPlayer) {
      game.pickups.push({
        id: `${Date.now()}-${Math.random()}`,
        x,
        y,
        type: pickPowerupType(),
        bornAt: now,
        expiresAt: now + 10000,
      });
      return;
    }
  }
}

function triggerAbility(player, now, game) {
  const archetype = getArchetypeById(player.archetypeId);
  if (player.abilityCd > 0 || player.eliminated) return;

  if (player.archetypeId === 'sprinter') {
    player.dashUntil = now + 500;
  } else if (player.archetypeId === 'sentinel') {
    player.shieldUntil = now + 2400;
  } else if (player.archetypeId === 'trickster') {
    const angle = Math.random() * Math.PI * 2;
    player.x = Math.max(10, Math.min(610, player.x + Math.cos(angle) * 70));
    player.y = Math.max(10, Math.min(390, player.y + Math.sin(angle) * 70));
  } else {
    player.hp = Math.min(player.maxHp, player.hp + 16);
  }

  player.abilityCd = archetype.ability.cooldown;
  player.abilityHintUntil = now + 900;
  
  // Track ability event for effects
  if (game) {
    game.events.push({
      id: `ability-${Date.now()}-${Math.random()}`,
      type: 'ability',
      playerId: player.id,
      playerName: player.name,
      archetypeId: player.archetypeId,
      abilityName: archetype.ability.name,
      t: game.simTime,
    });
  }
}

function getSkillValue(bot) {
  return Math.max(0, Math.min(100, bot.botSkill || 0));
}

function getTeamProfile(gameSettings) {
  if (gameSettings.mode !== 'team') return 'default';
  return gameSettings.teamProfile || 'defensive';
}

function getClassicProfile(gameSettings) {
  if (gameSettings.mode !== 'classic') return 'default';
  return gameSettings.classicProfile || 'precision';
}

function getBotInput(bot, game, now, gameSettings, runtimeOverrides = {}) {
  const skill = getSkillValue(bot);
  // allow runtime adjustment of bot aggressiveness (0-100)
  const aggressiveness = Number(runtimeOverrides.botAggressiveness ?? 50);
  const skillBias = (aggressiveness - 50) * 0.6; // scale influence
  const effectiveSkill = Math.max(0, Math.min(100, skill + skillBias));
  const teamProfile = getTeamProfile(gameSettings);
  const classicProfile = getClassicProfile(gameSettings);
  const teamBias = teamProfile === 'rush' ? -25 : teamProfile === 'botplay' ? 20 : 8;
  const classicBias = classicProfile === 'chaos' ? -20 : classicProfile === 'stalker' ? 22 : 10;
  const personalityLag = bot.botPersonality === 'aggressive' ? -20 : bot.botPersonality === 'evasive' ? 15 : 25;
  const reactionInterval = Math.max(60, 320 - effectiveSkill * 1.9 + personalityLag + teamBias + classicBias);
  const aimNoise = Math.max(0.01, 0.28 - effectiveSkill * 0.0022 + (bot.botPersonality === 'evasive' ? 0.03 : 0) - (classicProfile === 'precision' ? 0.02 : 0));
  const needsThink = now >= (bot.botNextThink || 0) || !bot.botGoalX;
  let dx = bot.botGoalX || 0;
  let dy = bot.botGoalY || 0;
  let abilityPressed = false;

  if (needsThink) {
    bot.botNextThink = now + reactionInterval;
    const livePlayers = game.players.filter((player) => !player.eliminated && player.id !== bot.id);
    const itPlayers = livePlayers.filter((player) => player.isIt);
    const nonItPlayers = livePlayers.filter((player) => !player.isIt);
    const nearestThreat = itPlayers.sort((a, b) =>
      Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y)
    )[0];
    const nearestPrey = nonItPlayers.sort((a, b) =>
      Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y)
    )[0];
    const nearestPlayer = livePlayers.sort((a, b) =>
      Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y)
    )[0];

    const objective = game.objective;
    let tx = bot.x;
    let ty = bot.y;

    if (gameSettings.mode === 'team' && objective && teamProfile === 'rush') {
      tx = objective.x;
      ty = objective.y;
    }

    if (bot.botPersonality === 'aggressive') {
      if (bot.isIt) {
        if (nearestPrey) {
          tx = nearestPrey.x;
          ty = nearestPrey.y;
        }
      } else {
        const escapeFrom = nearestThreat || nearestPlayer;
        if (escapeFrom) {
          tx = bot.x + (bot.x - escapeFrom.x);
          ty = bot.y + (bot.y - escapeFrom.y);
        }
      }
    }

    if (bot.botPersonality === 'evasive') {
      if (nearestThreat) {
        tx = bot.x + (bot.x - nearestThreat.x);
        ty = bot.y + (bot.y - nearestThreat.y);
      } else if (objective) {
        tx = objective.x;
        ty = objective.y;
      }
    }

    if (bot.botPersonality === 'support') {
      const ally = livePlayers.find((player) => player.team && player.team === bot.team && player.hp < player.maxHp * 0.7);
      if (ally) {
        tx = ally.x;
        ty = ally.y;
      } else if (objective) {
        tx = objective.x;
        ty = objective.y;
      }
    }

    if (gameSettings.mode === 'team' && teamProfile === 'botplay') {
      const closestAlly = livePlayers
        .filter((player) => player.team && player.team === bot.team)
        .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
      if (closestAlly && Math.hypot(closestAlly.x - bot.x, closestAlly.y - bot.y) > 110) {
        tx = (closestAlly.x + (objective?.x || closestAlly.x)) / 2;
        ty = (closestAlly.y + (objective?.y || closestAlly.y)) / 2;
      }
    }

    if (!bot.isIt) {
      const escapeFrom = nearestThreat || nearestPlayer;
      if (escapeFrom) {
        // Run away more decisively and sometimes dash if skilled
        const fleeMul = 1.6 + (skill > 70 ? 0.25 : 0);
        tx = bot.x + (bot.x - escapeFrom.x) * fleeMul;
        ty = bot.y + (bot.y - escapeFrom.y) * fleeMul;
        if (skill > 50 && Math.random() < 0.18) {
          // attempt ability (dash) to escape
          bot.botGoalAbility = true;
        }
      } else {
        // No immediate threat — wander randomly to make movement less static
        tx = bot.x + (Math.random() - 0.5) * 120;
        ty = bot.y + (Math.random() - 0.5) * 80;
      }
    }

    let dx = tx - bot.x;
    let dy = ty - bot.y;
    const mag = Math.hypot(dx, dy) || 1;
    const objectiveDistance = objective ? Math.hypot(objective.x - bot.x, objective.y - bot.y) : Infinity;
    const abilityOddsDivisor = teamProfile === 'rush'
      ? 95
      : classicProfile === 'chaos'
        ? 100
        : classicProfile === 'stalker'
          ? 140
          : classicProfile === 'precision'
            ? 155
          : 120;
    const triggerAbilityNow = objectiveDistance < 110 && bot.abilityCd <= 0 && skill > 30 && Math.random() < (skill / abilityOddsDivisor);

    bot.botGoalX = (dx / mag) + (Math.random() - 0.5) * aimNoise;
    bot.botGoalY = (dy / mag) + (Math.random() - 0.5) * aimNoise;
    bot.botGoalAbility = triggerAbilityNow;
    dx = bot.botGoalX;
    dy = bot.botGoalY;
    abilityPressed = triggerAbilityNow;
  } else {
    abilityPressed = false;
  }

  return {
    dx,
    dy,
    abilityPressed,
  };
}

export function useGameEngine(gameSettings, mapsCatalog, rematchToken = 0, runtimeOverrides = {}, isPaused = false) {
  const keysRef = useRef(new Set());
  const lastKeysRef = useRef(new Set());
  const engineRef = useRef(makeInitialState(gameSettings, mapsCatalog));
  const runtimeOverridesRef = useRef(runtimeOverrides);
  const pausedRef = useRef(isPaused);
  const [view, setView] = useState(() => ({ ...engineRef.current }));

  useEffect(() => {
    runtimeOverridesRef.current = runtimeOverrides;
  }, [runtimeOverrides]);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    const onDown = (event) => {
      // Prevent arrow keys from scrolling the page during play
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
        try { event.preventDefault(); } catch (e) { /* ignore */ }
      }
      keysRef.current.add(event.key.toLowerCase());
    };
    const onUp = (event) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useEffect(() => {
    engineRef.current = makeInitialState(gameSettings, mapsCatalog);
    lastKeysRef.current = new Set();

    let raf = 0;
    let last = performance.now();

    const resetRound = () => {
      const round = engineRef.current.round + 1;
      const score = engineRef.current.tournamentScore;
      engineRef.current = {
        ...makeInitialState(gameSettings, mapsCatalog),
        round,
        tournamentScore: score,
      };
    };

    const finishRound = () => {
      if (gameSettings.mode === 'team') {
        const teamProfile = getTeamProfile(gameSettings);
        const hpWeightDivisor = teamProfile === 'defensive' ? 52 : teamProfile === 'rush' ? 86 : 64;
        const alphaHp = engineRef.current.players
          .filter((player) => player.team === 'alpha')
          .reduce((sum, player) => sum + Math.max(0, player.hp), 0);
        const betaHp = engineRef.current.players
          .filter((player) => player.team === 'beta')
          .reduce((sum, player) => sum + Math.max(0, player.hp), 0);
        const alphaScore = (engineRef.current.teamScores.alpha || 0) + alphaHp / hpWeightDivisor;
        const betaScore = (engineRef.current.teamScores.beta || 0) + betaHp / hpWeightDivisor;
        engineRef.current.status = 'finished';
        engineRef.current.winnerText = alphaScore >= betaScore ? 'Team Alpha wins' : 'Team Beta wins';
        return;
      }

      const alive = engineRef.current.players.filter((player) => !player.eliminated);
      const winner = [...alive].sort((a, b) => b.hp - a.hp)[0];
      if (!winner) {
        engineRef.current.status = 'finished';
        engineRef.current.winnerText = 'No winner';
        return;
      }

      if (gameSettings.mode === 'tournament') {
        const scoreMap = engineRef.current.tournamentScore;
        scoreMap[winner.id] = (scoreMap[winner.id] || 0) + 1;
        const target = Object.entries(scoreMap).find(([, score]) => score >= 2);
        if (target) {
          const finalWinner = engineRef.current.players.find((player) => player.id === target[0]);
          engineRef.current.status = 'finished';
          engineRef.current.winnerText = `${finalWinner?.name || 'Unknown'} wins tournament`;
        } else {
          engineRef.current.status = 'round-end';
          engineRef.current.winnerText = `${winner.name} wins round ${engineRef.current.round}`;
        }
      } else {
        engineRef.current.status = 'finished';
        engineRef.current.winnerText = `${winner.name} wins`;
      }
    };

    const tick = (now) => {
      const dt = Math.min(0.035, (now - last) / 1000);
      last = now;
      const game = engineRef.current;
      const liveSettings = { ...gameSettings, ...runtimeOverridesRef.current };
      const antiSnowball = !!liveSettings.antiSnowball;
      const antiSnowballBoost = Math.max(0, Math.min(2, Number(liveSettings.antiSnowballBoost ?? 0.45)));

      if (pausedRef.current) {
        setView((prev) => ({ ...prev, paused: true }));
        raf = requestAnimationFrame(tick);
        return;
      }

      game.simTime += dt;
      const baseMap = getMapData(liveSettings.mapId, mapsCatalog);
      game.map = resolveObstacleFrame(baseMap, game.simTime);
      const teamProfile = getTeamProfile(liveSettings);
      const classicProfile = getClassicProfile(liveSettings);
      const isClassicPrecision = liveSettings.mode === 'classic' && classicProfile === 'precision';
      const isClassicPrecisionDuel = isClassicPrecision;
      const activeModifierIds = getActiveModifierIds(game, isClassicPrecisionDuel);
      const targetMaxHp = clampNumber(liveSettings.maxHp ?? 100, 40, 300, 100);
      const itDrainPerSecond = clampNumber(liveSettings.itDrainTick ?? 3, 0, 20, 3);
      const runnerRecoveryPerSecond = clampNumber(liveSettings.runnerRecoveryTick ?? 1, 0, 10, 1);
      const recoveryRequiresPriorIt = liveSettings.recoveryRequiresPriorIt ?? true;

      const lateModifierThreshold = liveSettings.mode === 'classic'
        ? (classicProfile === 'chaos' ? 0.55 : classicProfile === 'stalker' ? 0.38 : isClassicPrecisionDuel ? 0.2 : 0.24)
        : 0.4;

      if (!game.lateModifierApplied && game.timeLeft < getRoundDuration(liveSettings) * lateModifierThreshold) {
        if (isClassicPrecisionDuel) {
          game.lateModifierApplied = true;
        } else if (liveSettings.mode === 'team' && teamProfile !== 'rush') {
          game.lateModifierApplied = true;
        } else {
          const options = getModifierPool().filter((id) => !activeModifierIds.includes(id));
          const next = options[Math.floor(Math.random() * options.length)] || null;
          game.modifiers.secondary = next ? {
            id: next,
            label: MODIFIER_META[next] || 'Normal',
          } : game.modifiers.secondary;
          game.lateModifierApplied = true;
          if (game.modifiers.secondary) pushFeed(game, `Late-round modifier added: ${game.modifiers.secondary.label}`);
        }
      }

      if (game.status === 'running') {
        game.timeLeft -= dt;
        if (game.timeLeft <= 0) finishRound();

        if (!isClassicPrecisionDuel && !game.objective) {
          game.objectiveTimer -= dt;
          if (game.objectiveTimer <= 0) {
            spawnObjective(game);
            game.objectiveTimer = liveSettings.mode === 'team'
              ? (teamProfile === 'rush' ? 6.8 : teamProfile === 'botplay' ? 8.2 : 9.8)
              : liveSettings.mode === 'classic'
                ? (classicProfile === 'chaos' ? 7.0 : classicProfile === 'stalker' ? 10.6 : isClassicPrecisionDuel ? 10.2 : 9.2)
              : 9.5;
          }
        }

        if (!isClassicPrecisionDuel && liveSettings.powerups && game.timeLeft < game.spawnAt) {
          game.spawnAt -= COMPETITIVE_TUNING.powerupSpawnInterval;
          spawnPickup(game, now);
        }

        if (game.pickups.length) {
          const before = game.pickups.length;
          game.pickups = game.pickups.filter((item) => now < (item.expiresAt || 0));
          if (before !== game.pickups.length) {
            pushFeed(game, 'Powerup signal faded');
          }
        }

        if (activeModifierIds.length && game.simTime >= game.glitchPulseAt) {
          const nextPulseDelay = liveSettings.mode === 'team'
            ? COMPETITIVE_TUNING.glitchPulseDelayTeam
            : COMPETITIVE_TUNING.glitchPulseDelaySolo;
          game.glitchPulseAt = game.simTime + nextPulseDelay;

          if (activeModifierIds.includes('lowgravity')) {
            for (const player of game.players) {
              if (player.eliminated) continue;
              player.vx += (Math.random() - 0.5) * 70;
              player.vy += (Math.random() - 0.5) * 70;
            }
            pushFeed(game, 'GLITCH PULSE: Inertia drift');
          }

          if (activeModifierIds.includes('speedstorm')) {
            for (const player of game.players) {
              if (player.eliminated) continue;
              player.speedUntil = Math.max(player.speedUntil || 0, now + 900);
            }
            pushFeed(game, 'GLITCH PULSE: Speed spike');
          }

          if (activeModifierIds.includes('hazardsurge')) {
            for (const player of game.players) {
              if (player.eliminated) continue;
              player.hp = Math.max(0, player.hp - COMPETITIVE_TUNING.glitchPulseDamage);
              if (player.hp <= 0) player.eliminated = true;
            }
            pushFeed(game, 'GLITCH PULSE: Arena overload');
          }
        }

        for (const player of game.players) {
          if (player.eliminated) continue;

          if (player.maxHp !== targetMaxHp) {
            player.maxHp = targetMaxHp;
            player.hp = Math.min(player.hp, targetMaxHp);
          }

          const controls = player.controls;
          const archetype = getArchetypeById(player.archetypeId);
          const zoneEffect = getZoneEffect(player, game.map.zones || []);

          const botInput = player.isBot ? getBotInput(player, game, now, gameSettings, runtimeOverridesRef.current) : null;
          const abilityPressed = player.isBot ? botInput.abilityPressed : keysRef.current.has(controls.ability);
          const justPressed = player.isBot
            ? abilityPressed
            : (abilityPressed && !lastKeysRef.current.has(controls.ability));
          if (justPressed) triggerAbility(player, now, game);

          let dx = 0;
          let dy = 0;
          if (player.isBot) {
            dx = botInput.dx;
            dy = botInput.dy;
          } else {
            if (keysRef.current.has(controls.up)) dy -= 1;
            if (keysRef.current.has(controls.down)) dy += 1;
            if (keysRef.current.has(controls.left)) dx -= 1;
            if (keysRef.current.has(controls.right)) dx += 1;
          }

          const inputMagnitude = Math.hypot(dx, dy);
          const magnitude = inputMagnitude || 1;
          const hasInput = inputMagnitude > 0.001;
          const boostByPickup = now < player.speedUntil ? 1.45 : 1;
          const boostByDash = now < player.dashUntil ? 1.8 : 1;
          const boostByZone = zoneEffect === 'boost' ? 1.12 : zoneEffect === 'slow' ? 0.68 : 1;
          const speedStormBoost = activeModifierIds.includes('speedstorm')
            ? (isClassicPrecision ? (Math.sin(game.simTime * 3.5) > 0 ? 1.32 : 1.02) : (Math.sin(game.simTime * 3.5) > 0 ? 1.5 : 0.98))
            : 1;
          const teamTacticsMul = gameSettings.mode === 'team'
            ? (teamProfile === 'defensive' ? 0.88 : teamProfile === 'rush' ? 1.03 : 0.95)
            : 1;
          const classicTempoMul = gameSettings.mode === 'classic'
            ? (classicProfile === 'chaos' ? 1.07 : classicProfile === 'stalker' ? 0.9 : 1.0)
            : 1;
          const isHardTurn = !player.isBot && hasInput && (
            (Math.sign(dx || 0) !== Math.sign(player.vx || 0) && Math.abs(player.vx || 0) > 24) ||
            (Math.sign(dy || 0) !== Math.sign(player.vy || 0) && Math.abs(player.vy || 0) > 24)
          );
          const controlAssist = !player.isBot && hasInput ? (isHardTurn ? 1.1 : 1.05) : 1;
          const speed = liveSettings.speed * archetype.speedMul * boostByPickup * boostByDash * boostByZone * speedStormBoost * teamTacticsMul * classicTempoMul * controlAssist;

          const teamDamping = teamProfile === 'defensive' ? 0.75 : teamProfile === 'rush' ? 0.68 : 0.73;
          const classicDamping = classicProfile === 'chaos' ? 0.66 : classicProfile === 'stalker' ? 0.76 : 0.62;
          let damping = activeModifierIds.includes('lowgravity') ? 0.9 : (liveSettings.mode === 'team' ? teamDamping : liveSettings.mode === 'classic' ? classicDamping : 0.69);
          if (!hasInput) {
            damping = Math.min(0.92, damping + (player.isBot ? 0.05 : 0.16));
          } else if (!player.isBot) {
            damping = Math.max(0.56, damping - 0.05);
          }
          player.vx = (player.vx || 0) * damping + ((dx / magnitude) * speed * (1 - damping));
          player.vy = (player.vy || 0) * damping + ((dy / magnitude) * speed * (1 - damping));

          const px = player.vx * dt;
          const py = player.vy * dt;

          const nextX = Math.max(10, Math.min(610, player.x + px));
          const nextY = Math.max(10, Math.min(390, player.y + py));

          const hitX = (game.map.obstacles || []).some((obstacle) => collidesRect(nextX, player.y, obstacle));
          const hitY = (game.map.obstacles || []).some((obstacle) => collidesRect(player.x, nextY, obstacle));

          if (!hitX) player.x = nextX;
          if (!hitY) player.y = nextY;

          for (const hazard of game.map.hazards || []) {
            const width = (hazard.width || 8) + PLAYER_RADIUS;
            const dist = segmentDistance(player.x, player.y, hazard.x1, hazard.y1, hazard.x2, hazard.y2);
            if (dist < width) {
              const hazardMult = activeModifierIds.includes('hazardsurge') ? 1.6 : 1;
              const classicHazardMul = liveSettings.mode === 'classic'
                ? (classicProfile === 'chaos' ? 1.15 : classicProfile === 'stalker' ? 0.88 : 1)
                : 1;
              player.hp -= dt * 20 * hazardMult * classicHazardMul;
            }
          }

          const canRecover = !player.isIt && (!recoveryRequiresPriorIt || player.hasBeenIt);
          const lowestRecoveringHp = antiSnowball
            ? game.players
              .filter((item) => !item.eliminated && !item.isIt && (!recoveryRequiresPriorIt || item.hasBeenIt))
              .reduce((minHp, item) => Math.min(minHp, item.hp), Infinity)
            : Infinity;
          const antiSnowballBonus = antiSnowball && canRecover && player.hp <= lowestRecoveringHp + 0.01 ? antiSnowballBoost : 0;
          const drainRate = player.isIt
            ? itDrainPerSecond
            : canRecover
              ? -(runnerRecoveryPerSecond + antiSnowballBonus)
              : 0;
          player.hp -= dt * drainRate;
          player.hp = Math.max(0, Math.min(player.maxHp, player.hp));
          if (player.hp <= 0) player.eliminated = true;
          player.tagCd = Math.max(0, player.tagCd - dt);
          player.abilityCd = Math.max(0, player.abilityCd - dt);

          const pickup = game.pickups.find((item) => Math.hypot(item.x - player.x, item.y - player.y) < 20);
          if (pickup) {
            if (pickup.type === 'heal') player.hp = Math.min(player.maxHp, player.hp + 25);
            if (pickup.type === 'speed') {
              const speedPickupDuration = liveSettings.mode === 'classic'
                ? (classicProfile === 'chaos' ? 3600 : classicProfile === 'stalker' ? 2600 : 3200)
                : 3200;
              player.speedUntil = now + speedPickupDuration;
            }
            if (pickup.type === 'shield') {
              player.shieldUntil = Math.max(player.shieldUntil || 0, now + COMPETITIVE_TUNING.shieldPickupMs);
            }
            if (pickup.type === 'overload') {
              if (player.isIt) {
                player.hp = Math.min(player.maxHp, player.hp + COMPETITIVE_TUNING.overloadItHeal);
                player.tagCd = Math.max(0, player.tagCd - COMPETITIVE_TUNING.overloadTagCdCut);
              } else {
                player.speedUntil = Math.max(player.speedUntil || 0, now + COMPETITIVE_TUNING.overloadRunnerSpeedMs);
                player.dashUntil = Math.max(player.dashUntil || 0, now + COMPETITIVE_TUNING.overloadRunnerDashMs);
              }
            }
            game.pickups = game.pickups.filter((item) => item.id !== pickup.id);
            pushFeed(game, `${player.name} captured ${pickup.type.toUpperCase()} boost`);
          }

          if (!isClassicPrecisionDuel && game.objective && Math.hypot(game.objective.x - player.x, game.objective.y - player.y) < (isClassicPrecision ? 20 : 22)) {
            player.hp = Math.min(player.maxHp, player.hp + 12);
            player.score += 1;
            if (liveSettings.mode === 'team' && player.team) {
              const basePoints = teamProfile === 'defensive' ? 3 : 2;
              game.teamScores[player.team] = (game.teamScores[player.team] || 0) + basePoints;
              if (teamProfile === 'botplay') {
                const nearbyAlly = game.players.find((mate) => mate.id !== player.id && mate.team === player.team && !mate.eliminated && Math.hypot(mate.x - player.x, mate.y - player.y) < 86);
                if (nearbyAlly) {
                  game.teamScores[player.team] += 1;
                  pushFeed(game, `${player.name} linked with ${nearbyAlly.name} (+1 assist)`);
                }
              }
            }
            player.speedUntil = Math.max(player.speedUntil, now + (teamProfile === 'rush' ? 2200 : 1700));
            game.objective = null;
            game.objectiveTimer = liveSettings.mode === 'team'
              ? (teamProfile === 'rush' ? 6.2 : teamProfile === 'botplay' ? 7.6 : 8.8)
              : liveSettings.mode === 'classic'
                ? (classicProfile === 'chaos' ? 6.6 : classicProfile === 'stalker' ? 10.2 : isClassicPrecisionDuel ? 9.8 : 9.0)
              : 10;
            const teamText = teamProfile === 'defensive' ? ' (+3 team)' : teamProfile === 'botplay' ? ' (+2 team, combo-ready)' : ' (+2 team)';
            pushFeed(game, `${player.name} secured the objective${liveSettings.mode === 'team' ? teamText : ' (+1)'}`);
          }
        }

        const alive = game.players.filter((player) => !player.eliminated);
        const aliveItPlayers = alive.filter((player) => player.isIt);
        if (alive.length > 1 && aliveItPlayers.length === 0) {
          const randomIt = alive[Math.floor(Math.random() * alive.length)];
          randomIt.isIt = true;
          randomIt.hasBeenIt = true;
          randomIt.tagCd = 0.35;
          pushFeed(game, `${randomIt.name} is now IT`);
        }
        if (alive.length <= 1) finishRound();

        for (const it of game.players.filter((player) => player.isIt && !player.eliminated && player.tagCd <= 0)) {
          const target = game.players.find(
            (player) =>
              !player.eliminated &&
              !player.isIt &&
                Math.hypot(player.x - it.x, player.y - it.y) < (liveSettings.mode === 'team' ? (teamProfile === 'defensive' ? 20 : teamProfile === 'rush' ? 24 : 22) : liveSettings.mode === 'classic' ? (classicProfile === 'chaos' ? 28 : classicProfile === 'stalker' ? 24 : isClassicPrecisionDuel ? 21 : 24) : 26) &&
              now >= player.shieldUntil
          );
          if (target) {
            it.isIt = false;
            target.isIt = true;
            target.hasBeenIt = true;
            it.score += 1;
            // Track combo for tagger
            const wasComboActive = now < (it.tagComboExpiresAt || 0);
            if (!wasComboActive) {
              it.tagCombo = 1;
            } else {
              it.tagCombo += 1;
            }
            it.tagComboExpiresAt = now + 3.0; // 3 second combo window
            game.maxCombo = Math.max(game.maxCombo || 0, it.tagCombo);
            
            const teamTagCd = teamProfile === 'defensive' ? 0.55 : teamProfile === 'rush' ? 0.35 : 0.45;
            const classicTagCd = classicProfile === 'chaos' ? 0.28 : classicProfile === 'stalker' ? 0.42 : isClassicPrecisionDuel ? 0.5 : 0.38;
            it.tagCd = liveSettings.mode === 'team' ? teamTagCd : liveSettings.mode === 'classic' ? classicTagCd : 0.35;
            target.tagCd = liveSettings.mode === 'team' ? teamTagCd : liveSettings.mode === 'classic' ? classicTagCd : 0.35;
            target.shieldUntil = Math.max(target.shieldUntil || 0, now + 320);
            target.speedUntil = Math.max(target.speedUntil || 0, now + 900);
            // mark a short 'justTagged' window for UI feedback
            target.justTaggedUntil = now + 0.9;
            it.justTaggedUntil = now + 0.9;
            // Track tag event for effects
            game.events.push({
              id: `tag-${Date.now()}-${Math.random()}`,
              type: 'tag',
              taggerId: it.id,
              targetId: target.id,
              taggerName: it.name,
              targetName: target.name,
              combo: it.tagCombo,
              t: game.simTime,
            });
            // Fire combo event if 2+ tags
            if (it.tagCombo >= 2) {
              game.events.push({
                id: `combo-${Date.now()}-${Math.random()}`,
                type: 'combo',
                playerId: it.id,
                playerName: it.name,
                count: it.tagCombo,
                t: game.simTime,
              });
            }
            const comboLabel = it.tagCombo > 1 ? ` [${it.tagCombo}x COMBO]` : '';
            pushFeed(game, `${it.name} tagged ${target.name}${comboLabel}`);
          }
        }
      } else if (game.status === 'round-end') {
        resetRound();
      }

      // Detect clutch moments (last 2 seconds with active IT)
      const itPlayers = game.players.filter((p) => p.isIt && !p.eliminated);
      if (game.timeLeft < 2 && game.timeLeft > 0 && itPlayers.length > 0) {
        const lastClutchEvent = game.events.find((e) => e.type === 'clutch');
        if (!lastClutchEvent) {
          game.events.push({
            id: `clutch-${Date.now()}-${Math.random()}`,
            type: 'clutch',
            t: game.simTime,
          });
        }
      }

      // Clean up old events
      game.events = game.events.filter((entry) => game.simTime - entry.t < 2);

      game.feed = game.feed.filter((entry) => game.simTime - entry.t < 9);

      lastKeysRef.current = new Set(keysRef.current);

      // Smooth HP transitions and telegraph tracking
      const smoothedPlayers = game.players.map((player) => {
        const prev = { ...player };
        // Smooth HP display towards actual HP
        const hpDiff = player.hp - player.displayHp;
        const smoothRate = 0.15; // interpolation factor per frame
        prev.displayHp = player.displayHp + hpDiff * smoothRate;
        
        // Track cooldown percentage for telegraph
        const archetype = getArchetypeById(player.archetypeId);
        const abilityCdPercent = 1 - (player.abilityCd / (archetype.ability.cooldown || 1));
        prev.abilityCdPercent = Math.max(0, Math.min(1, abilityCdPercent));
        prev.tagComboActive = now < (player.tagComboExpiresAt || 0);
        
        return prev;
      });

      setView({
        ...game,
        paused: false,
        nextGlitchIn: activeModifierIds.length ? Math.max(0, game.glitchPulseAt - game.simTime) : null,
        players: smoothedPlayers,
        pickups: game.pickups.map((pickup) => ({ ...pickup })),
        teamScores: { ...game.teamScores },
        modifiers: {
          primary: game.modifiers.primary ? { ...game.modifiers.primary } : null,
          secondary: game.modifiers.secondary ? { ...game.modifiers.secondary } : null,
        },
        objective: game.objective ? { ...game.objective } : null,
        feed: game.feed.map((entry) => ({ ...entry })),
        map: {
          ...game.map,
          obstacles: (game.map.obstacles || []).map((obstacle) => ({ ...obstacle })),
          zones: (game.map.zones || []).map((zone) => ({ ...zone })),
          hazards: (game.map.hazards || []).map((hazard) => ({ ...hazard })),
        },
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gameSettings, mapsCatalog, rematchToken]);

  return view;
}
