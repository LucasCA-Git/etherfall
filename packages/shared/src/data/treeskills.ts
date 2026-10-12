import type { ActionDef, HitDef } from './actions';

/**
 * Active skills unlocked in the skill trees (data/talents.ts). Each archetype of each class
 * grants two. They reuse the same data-driven mechanics as the base kits (projectiles, zones,
 * strikes, seals, heals, summons); `element`, `icon` and `anim` tell the client how to draw them.
 */
const deg = (d: number) => (d * Math.PI) / 180;
const R = Math.PI;

/** Projectile / zone / strike hit with no reach of its own. */
const areaHit = (o: Partial<HitDef> & Pick<HitDef, 'damage' | 'scaling' | 'type'>): HitDef => ({
  range: 0, arc: R, poise: 10, knockback: 1, parryable: false, ...o,
});

export const TREE_SKILLS: ActionDef[] = [
  // ======================= VANGUARDA =======================
  // Paladino
  {
    id: 'pal_light', name: 'Luz Sagrada', desc: 'Cura você e aliados próximos com luz divina.', element: 'holy', icon: 'cross', anim: 'castRaise',
    startup: 10, active: 1, recovery: 12, stamina: 6, mana: 16, cooldown: 240, moveMul: 0.3,
    heal: { radius: 6, amount: 60, scaling: { wil: 1.2, str: 0.4 } },
  },
  {
    id: 'pal_hammer', name: 'Martelo Sagrado', desc: 'Arremessa um martelo de luz que prende o alvo por um instante.', element: 'holy', icon: 'hammer', anim: 'throw',
    startup: 10, active: 1, recovery: 12, stamina: 10, mana: 12, cooldown: 150, moveMul: 0.2,
    projectile: { id: 'holy_hammer', speed: 14, radius: 0.3, ttl: 34, hit: areaHit({ damage: 42, poise: 45, knockback: 3, scaling: { str: 0.8, wil: 0.8 }, type: 'arcane', status: { id: 'root', ticks: 30, power: 1 } }) },
  },
  // Guardião
  {
    id: 'grd_bash', name: 'Golpe de Escudo', desc: 'Pancada com o escudo que prende o alvo no lugar.', element: 'physical', icon: 'shield', anim: 'thrust',
    startup: 6, active: 3, recovery: 12, stamina: 18, cooldown: 150, moveMul: 0.1, lunge: { speed: 6, from: 3, to: 7 },
    hit: { range: 1.3, arc: deg(50), damage: 26, poise: 110, knockback: 4, scaling: { str: 1.0, vit: 0.4 }, type: 'physical', parryable: true, status: { id: 'root', ticks: 45, power: 1 } },
  },
  {
    id: 'grd_bulwark', name: 'Muralha', desc: 'Você e os aliados próximos recebem 45% menos dano por 5 s.', element: 'physical', icon: 'tower', anim: 'guard',
    startup: 6, active: 1, recovery: 10, stamina: 20, cooldown: 600, moveMul: 0.2,
    heal: { radius: 6, amount: 0, scaling: {}, status: { id: 'ironguard', ticks: 150, power: 0.45 } },
  },
  // Gladiador
  {
    id: 'gla_flurry', name: 'Rajada de Golpes', desc: 'Sequência rápida de cortes à frente.', element: 'blood', icon: 'swords', anim: 'slash',
    startup: 6, active: 18, recovery: 12, stamina: 30, cooldown: 240, moveMul: 0.35, rehitEvery: 5,
    hit: { range: 1.6, arc: deg(70), damage: 14, poise: 14, knockback: 1, scaling: { str: 0.9, dex: 0.6 }, type: 'physical', parryable: false },
  },
  {
    id: 'gla_execute', name: 'Execução', desc: 'Golpe lento e devastador, com armadura durante a preparação.', element: 'blood', icon: 'sword', anim: 'heavy',
    startup: 16, active: 3, recovery: 18, stamina: 34, cooldown: 360, moveMul: 0, hyperArmor: [0, 19], lunge: { speed: 4, from: 12, to: 17 },
    hit: { range: 1.7, arc: deg(40), damage: 95, poise: 80, knockback: 6, scaling: { str: 1.6 }, type: 'physical', parryable: true },
  },

  // ======================= ARCANISTA =======================
  // Criomante
  {
    id: 'cryo_nova', name: 'Nova Gélida', desc: 'Explosão de gelo ao seu redor que deixa os inimigos lentos.', element: 'frost', icon: 'snow', anim: 'castPlant',
    startup: 10, active: 2, recovery: 12, stamina: 6, mana: 20, cooldown: 300, moveMul: 0, shockwave: 3,
    hit: { range: 3, arc: R, damage: 24, poise: 30, knockback: 3, scaling: { int: 1.2 }, type: 'arcane', parryable: false, status: { id: 'slow', ticks: 90, power: 0.55 } },
  },
  {
    id: 'cryo_blizzard', name: 'Nevasca', desc: 'Granizo cai em uma área por alguns segundos.', element: 'frost', icon: 'cloud', anim: 'castSky',
    startup: 18, active: 1, recovery: 16, stamina: 10, mana: 34, cooldown: 540, moveMul: 0,
    strikes: { count: 12, dist: 5, spread: 3, radius: 1.1, delay: 8, interval: 3, hit: areaHit({ damage: 18, poise: 10, scaling: { int: 1.1 }, type: 'arcane', status: { id: 'slow', ticks: 45, power: 0.4 } }) },
  },
  // Piromante
  {
    id: 'pyro_fireball', name: 'Bola de Fogo', desc: 'Projétil de fogo que deixa o alvo queimando.', element: 'fire', icon: 'fire', anim: 'cast',
    startup: 9, active: 1, recovery: 10, stamina: 6, mana: 14, cooldown: 45, moveMul: 0.3, cancelFrom: 12,
    projectile: { id: 'fireball', speed: 13, radius: 0.32, ttl: 38, hit: areaHit({ damage: 40, poise: 16, knockback: 2.5, scaling: { int: 1.6 }, type: 'arcane', status: { id: 'burn', ticks: 90, power: 9 } }) },
  },
  {
    id: 'pyro_meteor', name: 'Meteoro', desc: 'Três rochas em chamas caem do céu no ponto mirado.', element: 'fire', icon: 'comet', anim: 'castSky',
    startup: 28, active: 1, recovery: 22, stamina: 16, mana: 45, cooldown: 720, moveMul: 0,
    strikes: { count: 3, dist: 5, spread: 1.4, radius: 2.0, delay: 24, interval: 8, hit: areaHit({ damage: 70, poise: 70, knockback: 5, scaling: { int: 1.7 }, type: 'arcane', status: { id: 'burn', ticks: 90, power: 10 } }) },
  },
  // Mestre Arcano
  {
    id: 'arc_missiles', name: 'Mísseis Arcanos', desc: 'Leque de cinco mísseis de energia.', element: 'arcane', icon: 'star', anim: 'cast',
    startup: 8, active: 1, recovery: 10, stamina: 6, mana: 18, cooldown: 150, moveMul: 0.3,
    projectile: { id: 'arcane_missile', speed: 16, radius: 0.18, ttl: 32, count: 5, spread: deg(7), hit: areaHit({ damage: 15, poise: 8, scaling: { int: 1.3 }, type: 'arcane' }) },
  },
  {
    id: 'arc_blink', name: 'Teleporte', desc: 'Some e reaparece alguns metros adiante, intocável.', element: 'arcane', icon: 'swirl', anim: 'cast',
    startup: 1, active: 4, recovery: 8, stamina: 6, mana: 18, cooldown: 150, moveMul: 0, lunge: { speed: 28, from: 1, to: 5 }, iframes: [0, 6],
  },

  // ======================= CURANDEIRA =======================
  // Sacerdotisa da Aurora
  {
    id: 'dawn_renew', name: 'Renovação', desc: 'Círculo de luz que cura aliados a cada meio segundo.', element: 'holy', icon: 'sun', anim: 'castPlant',
    startup: 10, active: 1, recovery: 12, stamina: 6, mana: 24, cooldown: 600, moveMul: 0.2,
    zone: { kind: 'sanctuary', dist: 0, radius: 3.4, ticks: 240, pulseEvery: 15, hit: areaHit({ damage: 0, poise: 0, knockback: 0, scaling: {}, type: 'arcane' }), heal: { amount: 11, scaling: { wil: 0.9 } } },
  },
  {
    id: 'dawn_halo', name: 'Auréola', desc: 'Cura o grupo e aumenta o dano de todos por 10 s.', element: 'holy', icon: 'halo', anim: 'castRaise',
    startup: 14, active: 1, recovery: 14, stamina: 8, mana: 30, cooldown: 720, moveMul: 0.2,
    heal: { radius: 7, amount: 40, scaling: { wil: 1.0 }, status: { id: 'empower', ticks: 300, power: 0.2 } },
  },
  // Inquisidora
  {
    id: 'inq_judgment', name: 'Julgamento', desc: 'Três pilares de luz descem sobre os inimigos.', element: 'holy', icon: 'sword', anim: 'castSky',
    startup: 16, active: 1, recovery: 14, stamina: 8, mana: 26, cooldown: 360, moveMul: 0,
    strikes: { count: 3, dist: 5, spread: 1.6, radius: 1.4, delay: 16, interval: 6, hit: areaHit({ damage: 46, poise: 40, knockback: 3, scaling: { wil: 1.4 }, type: 'arcane' }) },
  },
  {
    id: 'inq_chains', name: 'Correntes Sagradas', desc: 'Acorrenta o inimigo mais próximo à frente por 3 s.', element: 'holy', icon: 'chain', anim: 'cast',
    startup: 8, active: 1, recovery: 10, stamina: 6, mana: 14, cooldown: 240, moveMul: 0.3,
    seal: { range: 10, arc: deg(35), status: { id: 'root', ticks: 90, power: 1 } },
  },
  // Druida
  {
    id: 'dru_thorns', name: 'Espinheiro', desc: 'Espinhos brotam do chão, ferindo e prendendo.', element: 'nature', icon: 'leaf', anim: 'castPlant',
    startup: 10, active: 1, recovery: 12, stamina: 6, mana: 20, cooldown: 360, moveMul: 0.2,
    zone: { kind: 'thorns', dist: 4, radius: 2.4, ticks: 210, pulseEvery: 15, hit: areaHit({ damage: 9, poise: 6, knockback: 0, scaling: { wil: 0.8 }, type: 'physical', status: { id: 'root', ticks: 18, power: 1 } }) },
  },
  {
    id: 'dru_wolves', name: 'Espíritos da Matilha', desc: 'Dois lobos espirituais lutam ao seu lado por 25 s.', element: 'nature', icon: 'paw', anim: 'castSky',
    startup: 16, active: 1, recovery: 14, stamina: 8, mana: 30, cooldown: 900, moveMul: 0.2,
    summon: { enemyId: 'spiritwolf', count: 2, ticks: 30 * 25, max: 2 },
  },

  // ======================= PATRULHEIRO =======================
  // Atirador de Elite
  {
    id: 'snp_pierce', name: 'Flecha Perfurante', desc: 'Disparo muito rápido e pesado.', element: 'physical', icon: 'arrow', anim: 'bow',
    startup: 16, active: 1, recovery: 12, stamina: 26, cooldown: 180, moveMul: 0.1,
    projectile: { id: 'arrow_heavy', speed: 32, radius: 0.2, ttl: 40, hit: areaHit({ damage: 70, poise: 50, knockback: 4, scaling: { dex: 1.7 }, type: 'physical' }) },
  },
  {
    id: 'snp_multishot', name: 'Tiro Múltiplo', desc: 'Nove flechas em leque.', element: 'physical', icon: 'arrows', anim: 'bow',
    startup: 10, active: 1, recovery: 12, stamina: 24, cooldown: 240, moveMul: 0.2,
    projectile: { id: 'arrow', speed: 21, radius: 0.15, ttl: 26, count: 9, spread: deg(6), hit: areaHit({ damage: 14, poise: 8, scaling: { dex: 1.1 }, type: 'physical' }) },
  },
  // Mestre das Feras
  {
    id: 'bst_wolf', name: 'Companheiro Lobo', desc: 'Um lobo fiel acompanha você por 60 s.', element: 'nature', icon: 'paw', anim: 'shout',
    startup: 10, active: 1, recovery: 10, stamina: 10, mana: 18, cooldown: 900, moveMul: 0.2,
    summon: { enemyId: 'spiritwolf', count: 1, ticks: 30 * 60, max: 1 },
  },
  {
    id: 'bst_hawk', name: 'Mergulho do Falcão', desc: 'Falcões mergulham sobre a área mirada.', element: 'nature', icon: 'wing', anim: 'shout',
    startup: 10, active: 1, recovery: 12, stamina: 14, cooldown: 300, moveMul: 0.2,
    strikes: { count: 4, dist: 6, spread: 1.5, radius: 0.9, delay: 8, interval: 4, hit: areaHit({ damage: 22, poise: 14, scaling: { dex: 1.2 }, type: 'physical' }) },
  },
  // Guardião da Mata
  {
    id: 'wdn_entangle', name: 'Enredar', desc: 'Raízes prendem quem pisar na área.', element: 'nature', icon: 'leaf', anim: 'castPlant',
    startup: 8, active: 1, recovery: 10, stamina: 8, mana: 16, cooldown: 300, moveMul: 0.2,
    zone: { kind: 'thorns', dist: 5, radius: 2, ticks: 150, pulseEvery: 15, hit: areaHit({ damage: 6, poise: 4, knockback: 0, scaling: { dex: 0.6 }, type: 'physical', status: { id: 'root', ticks: 30, power: 1 } }) },
  },
  {
    id: 'wdn_toxic', name: 'Nuvem Tóxica', desc: 'Névoa venenosa que envenena quem estiver dentro.', element: 'poison', icon: 'drop', anim: 'throw',
    startup: 8, active: 1, recovery: 10, stamina: 8, mana: 18, cooldown: 360, moveMul: 0.2,
    zone: { kind: 'poison', dist: 4, radius: 2.6, ticks: 180, pulseEvery: 15, hit: areaHit({ damage: 4, poise: 2, knockback: 0, scaling: { dex: 0.5 }, type: 'physical', status: { id: 'poison', ticks: 45, power: 10 } }) },
  },

  // ======================= LADINA =======================
  // Assassina
  {
    id: 'asn_shadowstrike', name: 'Golpe Sombrio', desc: 'Atravessa as sombras até o alvo e golpeia.', element: 'shadow', icon: 'dagger', anim: 'thrust',
    startup: 2, active: 6, recovery: 10, stamina: 20, cooldown: 240, moveMul: 0, lunge: { speed: 22, from: 2, to: 7 }, iframes: [0, 7],
    hit: { range: 1.0, arc: deg(50), damage: 58, poise: 40, knockback: 3, scaling: { dex: 1.5 }, type: 'physical', parryable: false, once: true },
  },
  {
    id: 'asn_mark', name: 'Marca da Morte', desc: 'Amaldiçoa o alvo: ele sangra por 10 s.', element: 'shadow', icon: 'skull', anim: 'cast',
    startup: 6, active: 1, recovery: 8, stamina: 10, mana: 10, cooldown: 300, moveMul: 0.3,
    seal: { range: 9, arc: deg(35), status: { id: 'curse', ticks: 300, power: 22 } },
  },
  // Ilusionista
  {
    id: 'ilu_mirror', name: 'Imagens Espelhadas', desc: 'Três cópias ilusórias suas atacam por 15 s.', element: 'illusion', icon: 'mask', anim: 'castRaise',
    startup: 8, active: 1, recovery: 10, stamina: 8, mana: 24, cooldown: 600, moveMul: 0.2,
    selfStatus: { id: 'stealth', ticks: 45, power: 1 },
    summon: { enemyId: 'phantom', count: 3, ticks: 30 * 15, max: 3 },
  },
  {
    id: 'ilu_blur', name: 'Véu de Ilusão', desc: 'Fica invisível e confunde quem está por perto (lentidão).', element: 'illusion', icon: 'eye', anim: 'castRaise',
    startup: 5, active: 1, recovery: 8, stamina: 8, mana: 20, cooldown: 540, moveMul: 0.3,
    selfStatus: { id: 'stealth', ticks: 210, power: 1 },
    zone: { kind: 'illusion', dist: 0, radius: 3, ticks: 120, pulseEvery: 15, hit: areaHit({ damage: 1, poise: 0, knockback: 0, scaling: {}, type: 'arcane', status: { id: 'slow', ticks: 30, power: 0.5 } }) },
  },
  // Envenenadora
  {
    id: 'psn_flask', name: 'Frasco Tóxico', desc: 'Arremessa um frasco que envenena forte.', element: 'poison', icon: 'flask', anim: 'throw',
    startup: 8, active: 1, recovery: 10, stamina: 14, cooldown: 180, moveMul: 0.3,
    projectile: { id: 'toxic_flask', speed: 12, radius: 0.24, ttl: 30, hit: areaHit({ damage: 12, poise: 8, scaling: { dex: 0.9 }, type: 'physical', status: { id: 'poison', ticks: 180, power: 16 } }) },
  },
  {
    id: 'psn_fan', name: 'Leque Envenenado', desc: 'Cinco facas com veneno.', element: 'poison', icon: 'daggers', anim: 'throw',
    startup: 7, active: 1, recovery: 9, stamina: 18, cooldown: 240, moveMul: 0.3,
    projectile: { id: 'knife', speed: 18, radius: 0.14, ttl: 22, count: 5, spread: deg(12), hit: areaHit({ damage: 10, poise: 6, scaling: { dex: 1.0 }, type: 'physical', status: { id: 'poison', ticks: 120, power: 8 } }) },
  },

  // ======================= BÁRBARO =======================
  // Chefe de Guerra
  {
    id: 'wch_banner', name: 'Estandarte de Guerra', desc: 'Finca um estandarte: o grupo ganha dano e se cura aos poucos.', element: 'physical', icon: 'flag', anim: 'castPlant',
    startup: 10, active: 1, recovery: 12, stamina: 16, cooldown: 900, moveMul: 0,
    heal: { radius: 6, amount: 20, scaling: { vit: 0.5 }, status: { id: 'empower', ticks: 300, power: 0.2 } },
    zone: { kind: 'banner', dist: 0, radius: 4, ticks: 300, pulseEvery: 30, hit: areaHit({ damage: 0, poise: 0, knockback: 0, scaling: {}, type: 'physical' }), heal: { amount: 8, scaling: { vit: 0.4 } } },
  },
  {
    id: 'wch_shout', name: 'Brado Intimidador', desc: 'Grito que desequilibra e deixa lentos os inimigos ao redor.', element: 'physical', icon: 'horn', anim: 'shout',
    startup: 8, active: 2, recovery: 12, stamina: 20, cooldown: 360, moveMul: 0, shockwave: 3.2,
    hit: { range: 3.2, arc: R, damage: 10, poise: 60, knockback: 4, scaling: { str: 0.6 }, type: 'physical', parryable: false, status: { id: 'slow', ticks: 120, power: 0.4 } },
  },
  // Fúria Sangrenta
  {
    id: 'bld_frenzy', name: 'Frenesi', desc: '+40% de dano por 10 s.', element: 'blood', icon: 'drop', anim: 'shout',
    startup: 6, active: 1, recovery: 8, stamina: 10, cooldown: 600, moveMul: 0.3,
    selfStatus: { id: 'empower', ticks: 300, power: 0.4 },
  },
  {
    id: 'bld_slam', name: 'Esmagar Sangrento', desc: 'Machadada no chão que rouba vida de todos atingidos.', element: 'blood', icon: 'axe', anim: 'heavy',
    startup: 14, active: 3, recovery: 18, stamina: 30, cooldown: 300, moveMul: 0, hyperArmor: [0, 17], shockwave: 2.2,
    hit: { range: 2.0, arc: deg(70), damage: 70, poise: 70, knockback: 5, scaling: { str: 1.5 }, type: 'physical', parryable: false, drain: 0.3 },
  },
  // Xamã Ancestral
  {
    id: 'sha_storm', name: 'Fúria da Tempestade', desc: 'Raios caem ao seu redor.', element: 'lightning', icon: 'bolt', anim: 'castSky',
    startup: 14, active: 1, recovery: 14, stamina: 16, mana: 10, cooldown: 420, moveMul: 0,
    strikes: { count: 6, dist: 3, spread: 3, radius: 1.4, delay: 10, interval: 4, hit: areaHit({ damage: 30, poise: 30, knockback: 2, scaling: { str: 0.8, wil: 0.8 }, type: 'arcane' }) },
  },
  {
    id: 'sha_spirits', name: 'Espíritos Ancestrais', desc: 'Dois guerreiros ancestrais lutam por 20 s.', element: 'spirit', icon: 'ghost', anim: 'shout',
    startup: 16, active: 1, recovery: 14, stamina: 16, mana: 16, cooldown: 900, moveMul: 0,
    summon: { enemyId: 'ancestor', count: 2, ticks: 30 * 20, max: 2 },
  },

  // ======================= BRUXO =======================
  // Demonologista
  {
    id: 'dem_felhound', name: 'Cão Infernal', desc: 'Invoca um cão de fogo por 40 s (até 2).', element: 'fire', icon: 'horns', anim: 'castSky',
    startup: 14, active: 1, recovery: 12, stamina: 8, mana: 26, cooldown: 600, moveMul: 0.2,
    summon: { enemyId: 'felhound', count: 1, ticks: 30 * 40, max: 2 },
  },
  {
    id: 'dem_hellfire', name: 'Fogo Infernal', desc: 'Chão em chamas que queima os inimigos.', element: 'fire', icon: 'fire', anim: 'castPlant',
    startup: 10, active: 1, recovery: 12, stamina: 8, mana: 24, cooldown: 420, moveMul: 0.2,
    zone: { kind: 'fire', dist: 4, radius: 2.6, ticks: 180, pulseEvery: 12, hit: areaHit({ damage: 12, poise: 4, knockback: 0, scaling: { int: 0.9 }, type: 'arcane', status: { id: 'burn', ticks: 30, power: 6 } }) },
  },
  // Ceifador de Almas
  {
    id: 'rea_scythe', name: 'Foice Espectral', desc: 'Corte largo que rouba vida.', element: 'shadow', icon: 'scythe', anim: 'slash',
    startup: 9, active: 3, recovery: 12, stamina: 14, mana: 14, cooldown: 180, moveMul: 0.2,
    hit: { range: 2.4, arc: deg(110), damage: 40, poise: 30, knockback: 3, scaling: { int: 1.3 }, type: 'arcane', parryable: false, drain: 0.25 },
  },
  {
    id: 'rea_harvest', name: 'Colheita de Almas', desc: 'Drena a vida de todos ao redor e os amaldiçoa.', element: 'shadow', icon: 'skull', anim: 'castPlant',
    startup: 16, active: 2, recovery: 14, stamina: 10, mana: 30, cooldown: 600, moveMul: 0, shockwave: 3.5,
    hit: { range: 3.5, arc: R, damage: 30, poise: 30, knockback: 2, scaling: { int: 1.3 }, type: 'arcane', parryable: false, drain: 0.4, status: { id: 'curse', ticks: 150, power: 8 } },
  },
  // Mestre das Sombras
  {
    id: 'shd_tendrils', name: 'Tentáculos Sombrios', desc: 'Tentáculos rompem o chão em linha e prendem.', element: 'shadow', icon: 'tentacle', anim: 'castPlant',
    startup: 10, active: 7, recovery: 12, stamina: 8, mana: 20, cooldown: 300, moveMul: 0,
    spikes: { count: 7, spacing: 0.9, startDist: 1.0, radius: 0.7, hit: areaHit({ damage: 20, poise: 20, knockback: 1, scaling: { int: 1.2 }, type: 'arcane', status: { id: 'root', ticks: 40, power: 1 } }) },
  },
  {
    id: 'shd_veil', name: 'Manto Sombrio', desc: 'Some nas sombras por 6 s; o próximo golpe surpreende.', element: 'shadow', icon: 'moon', anim: 'castRaise',
    startup: 4, active: 1, recovery: 6, stamina: 6, mana: 16, cooldown: 480, moveMul: 0.4,
    selfStatus: { id: 'stealth', ticks: 180, power: 1 },
  },

  // ======================= summons' attacks =======================
  {
    id: 'phantom_slash', name: 'Corte Ilusório', startup: 6, active: 2, recovery: 8, moveMul: 0.3, lunge: { speed: 4, from: 3, to: 7 }, trackUntil: 4, turnRate: deg(20), telegraph: 'normal',
    hit: { range: 1.1, arc: deg(55), damage: 12, poise: 6, knockback: 1, scaling: { dex: 0.8 }, type: 'physical', parryable: true },
  },
  {
    id: 'spirit_bite', name: 'Mordida Espiritual', startup: 8, active: 2, recovery: 10, moveMul: 0.2, lunge: { speed: 5, from: 5, to: 9 }, trackUntil: 5, turnRate: deg(20), telegraph: 'normal',
    hit: { range: 1.1, arc: deg(55), damage: 18, poise: 12, knockback: 1.5, scaling: { wil: 0.7, dex: 0.5 }, type: 'physical', parryable: true },
  },
  {
    id: 'fel_bite', name: 'Mordida Flamejante', startup: 9, active: 2, recovery: 10, moveMul: 0.2, lunge: { speed: 5, from: 6, to: 10 }, trackUntil: 6, turnRate: deg(20), telegraph: 'normal',
    hit: { range: 1.1, arc: deg(55), damage: 20, poise: 14, knockback: 1.5, scaling: { int: 0.8 }, type: 'arcane', parryable: true, status: { id: 'burn', ticks: 60, power: 5 } },
  },
  {
    id: 'ancestor_cleave', name: 'Golpe Ancestral', startup: 11, active: 3, recovery: 12, moveMul: 0.1, lunge: { speed: 3.5, from: 8, to: 12 }, trackUntil: 8, turnRate: deg(16), telegraph: 'normal',
    hit: { range: 1.6, arc: deg(70), damage: 26, poise: 30, knockback: 3, scaling: { str: 0.8, wil: 0.5 }, type: 'physical', parryable: true },
  },
];
