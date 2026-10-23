import { world } from "@minecraft/server";

const SAVE = "utilitycore:state";
const POWER_BRIDGE = "carriercore:power_bridge";
const GRID_BRIDGE = "utilitycore:grid_bridge";

function keyAt(dim, x, y, z) {
  return `${dim}:${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
}
function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Generation capacity (relative MW) */
const POWER_GEN = {
  generator_large: 200,
  generator_diesel: 50,
  generator_solar: 25
};

/** Load when energized */
const POWER_LOAD = {
  electric_meter: 2,
  breaker_panel: 1,
  circuit_breaker: 1,
  outlet: 3,
  light_fixture: 2,
  light_switch: 0,
  transformer: 1,
  substation: 2,
  neighborhood_room: 2,
  building_room: 2,
  power_pole: 0,
  power_line: 0,
  conduit: 0
};

/**
 * Grid hierarchy tiers (power flows high → low only through allowed links)
 * 0 gen → 1 HV/distribution → 2 neighborhood → 3 building → 4 circuit → 5 endpoint
 */
const POWER_TIER = {
  generator_large: 0,
  generator_diesel: 0,
  generator_solar: 0,
  substation: 1,
  power_line: 1,
  power_pole: 1,
  transformer: 1,
  neighborhood_room: 2,
  building_room: 3,
  breaker_panel: 3,
  circuit_breaker: 4,
  electric_meter: 4,
  conduit: 5,
  outlet: 5,
  light_switch: 5,
  light_fixture: 5
};

/** Max link distance by tier pair (blocks) */
const TIER_RANGE = {
  // gen to HV
  "0-1": 48,
  "0-0": 32,
  // HV to neighborhood
  "1-2": 40,
  "1-1": 36,
  // neighborhood to building
  "2-3": 28,
  "2-2": 24,
  // building to circuit
  "3-4": 16,
  "3-3": 12,
  // circuit to endpoints / conduit chain
  "4-5": 12,
  "4-4": 10,
  "5-5": 8,
  // same-tier fallback
  default: 16
};

function tierRange(ta, tb) {
  const a = Math.min(ta, tb), b = Math.max(ta, tb);
  return TIER_RANGE[`${a}-${b}`] || TIER_RANGE.default;
}

/** Source capacity */
const WATER_GEN = {
  reservoir: 250,
  water_plant: 120,
  well_pump: 60,
  water_tower: 40
};

const WATER_LOAD = {
  water_meter: 2,
  pump_station: 3,
  plumbing_room: 2,
  shutoff_valve: 1,
  water_heater: 4,
  sink: 5,
  toilet: 8,
  shower: 12,
  pipe_junction: 0,
  water_main: 0,
  branch_pipe: 0
};

/**
 * Water hierarchy
 * 0 source → 1 transmission → 2 neighborhood → 3 building → 4 branch/meter → 5 fixture
 */
const WATER_TIER = {
  reservoir: 0,
  water_plant: 0,
  well_pump: 0,
  water_tower: 1,
  water_main: 1,
  pipe_junction: 1,
  pump_station: 2,
  plumbing_room: 3,
  shutoff_valve: 4,
  water_meter: 4,
  water_heater: 4,
  branch_pipe: 5,
  sink: 5,
  toilet: 5,
  shower: 5
};

const WATER_TIER_RANGE = {
  "0-1": 48,
  "0-0": 32,
  "1-2": 40,
  "1-1": 36,
  "2-3": 28,
  "2-2": 24,
  "3-4": 16,
  "3-3": 12,
  "4-5": 12,
  "4-4": 10,
  "5-5": 8,
  default: 16
};

function waterTierRange(ta, tb) {
  const a = Math.min(ta, tb), b = Math.max(ta, tb);
  return WATER_TIER_RANGE[`${a}-${b}`] || WATER_TIER_RANGE.default;
}


export class UtilityManager {
  constructor() {
    this.nodes = new Map();
    this.ids = new Map();
    this.policies = new Map();
    this.accounts = new Map();
    this.next = { node: 1, id: 1000, policy: 1, claim: 1, bill: 1 };
    this.settings = {
      powerRange: 24,
      waterRange: 20,
      kwhPrice: 0.12,
      waterPrice: 0.004,
      billIntervalTicks: 24000,
      solarDayOnly: true
    };
    this._tick = 0;
  }

  load() {
    try {
      const raw = world.getDynamicProperty(SAVE);
      if (!raw || typeof raw !== "string") return;
      const d = JSON.parse(raw);
      if (d.nodes) this.nodes = new Map(d.nodes);
      if (d.ids) this.ids = new Map(d.ids);
      if (d.policies) this.policies = new Map(d.policies);
      if (d.accounts) this.accounts = new Map(d.accounts);
      if (d.next) this.next = { ...this.next, ...d.next };
      if (d.settings) this.settings = { ...this.settings, ...d.settings };
    } catch (e) {
      console.warn("[UtilityCore] load", e);
    }
    console.log(`[UtilityCore] ${this.nodes.size} nodes, ${this.ids.size} IDs`);
  }

  save() {
    try {
      world.setDynamicProperty(SAVE, JSON.stringify({
        nodes: [...this.nodes.entries()],
        ids: [...this.ids.entries()],
        policies: [...this.policies.entries()],
        accounts: [...this.accounts.entries()],
        next: this.next,
        settings: this.settings
      }));
    } catch (e) {
      console.warn("[UtilityCore] save", e);
    }
  }

  registerNode(type, x, y, z, dim, owner = null) {
    const key = keyAt(dim, x, y, z);
    if (this.nodes.has(key)) return this.nodes.get(key);
    const net = this._networkOf(type);
    const node = {
      id: `n_${this.next.node++}`,
      key, type, net,
      tier: (net === "power" ? POWER_TIER[type] : WATER_TIER[type]) != null
        ? (net === "power" ? POWER_TIER[type] : WATER_TIER[type])
        : null,
      x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), dim,
      owner,
      online: true,
      broken: false,
      switchOn: (type === "light_switch" || type === "circuit_breaker") ? true : undefined,
      valveOpen: type === "shutoff_valve" ? true : undefined,
      linkedLights: type === "light_switch" ? [] : undefined,
      fuel: (type === "generator_diesel" || type === "generator_large") ? 100 : 0,
      waterLevel: WATER_GEN[type]
        ? (type === "reservoir" ? 100 : type === "water_plant" ? 100 : type === "well_pump" ? 90 : 80)
        : 0,
      generation: POWER_GEN[type] || WATER_GEN[type] || 0,
      load: POWER_LOAD[type] || WATER_LOAD[type] || 0,
      kwh: 0,
      liters: 0,
      linkedAccount: null,
      registeredAt: Date.now()
    };
    this.nodes.set(key, node);
    this.save();
    return node;
  }

  _networkOf(type) {
    if (POWER_TIER[type] != null || POWER_GEN[type] || POWER_LOAD[type] !== undefined)
      return "power";
    if (WATER_TIER[type] != null || WATER_GEN[type] || WATER_LOAD[type] !== undefined)
      return "water";
    return "water";
  }

  _canWaterLink(a, b) {
    if (a.net !== "water" || b.net !== "water") return false;
    if (a.dim !== b.dim) return false;
    if (a.broken || b.broken) return false;
    if (!a.online || !b.online) return false;
    const ta = a.tier != null ? a.tier : 5;
    const tb = b.tier != null ? b.tier : 5;
    if (Math.abs(ta - tb) > 1) {
      const relay = (t) => t === "water_main" || t === "branch_pipe" || t === "pipe_junction";
      if (!(relay(a.type) || relay(b.type))) return false;
      if (Math.abs(ta - tb) > 2) return false;
    }
    return dist(a, b) <= waterTierRange(ta, tb);
  }

  /** Can power flow between two power nodes? */
  _canPowerLink(a, b) {
    if (a.net !== "power" || b.net !== "power") return false;
    if (a.dim !== b.dim) return false;
    if (a.broken || b.broken) return false;
    if (!a.online || !b.online) return false;
    const ta = a.tier != null ? a.tier : 5;
    const tb = b.tier != null ? b.tier : 5;
    // only same tier or adjacent tiers (step by 1), or conduit bridging endpoints
    if (Math.abs(ta - tb) > 1) {
      // allow conduit/pole/line as soft bridges within 1 hop of range rules
      const relay = (t) => t === "conduit" || t === "power_pole" || t === "power_line";
      if (!(relay(a.type) || relay(b.type))) return false;
      if (Math.abs(ta - tb) > 2) return false;
    }
    const range = tierRange(ta, tb);
    return dist(a, b) <= range;
  }


  deregisterAt(x, y, z, dim) {
    const key = keyAt(dim, x, y, z);
    const n = this.nodes.get(key);
    if (!n) return null;
    this.nodes.delete(key);
    this.save();
    return n;
  }

  getNodeAt(x, y, z, dim) {
    return this.nodes.get(keyAt(dim, x, y, z));
  }

  neighbors(node, range) {
    const range = net === "power" ? (this.settings.powerRange || 24) : (this.settings.waterRange || 20);
    const out = [];
    for (const o of this.nodes.values()) {
      if (o.key === node.key || o.dim !== node.dim || o.net !== net) continue;
      if (dist(node, o) <= range) out.push(o);
    }
    return out;
  }

  computePowered(net = "power") {
    let tod = 6000;
    try { tod = world.getTimeOfDay ? world.getTimeOfDay() : 6000; } catch (e) {}
    const day = tod >= 0 && tod < 12000;
    const powered = new Set();
    const queue = [];

    for (const n of this.nodes.values()) {
      if (n.net !== net || n.broken || !n.online) continue;
      if (net === "power") {
        if ((n.type === "generator_diesel" || n.type === "generator_large") && (n.fuel || 0) > 0) {
          powered.add(n.key); queue.push(n);
        }
        if (n.type === "generator_solar" && (!this.settings.solarDayOnly || day)) {
          powered.add(n.key); queue.push(n);
        }
      } else {
        if (
          (n.type === "reservoir" || n.type === "water_plant" || n.type === "well_pump" || n.type === "water_tower") &&
          (n.waterLevel || 0) > 0
        ) {
          powered.add(n.key); queue.push(n);
        }
      }
    }

    while (queue.length) {
      const cur = queue.shift();
      for (const nb of this.nodes.values()) {
        if (nb.key === cur.key || powered.has(nb.key)) continue;
        if (nb.net !== net || nb.dim !== cur.dim) continue;
        if (nb.broken || !nb.online) continue;
        if (net === "power") {
          if (!this._canPowerLink(cur, nb)) continue;
          if (cur.type === "circuit_breaker" && cur.switchOn === false) continue;
          if (nb.type === "circuit_breaker" && nb.switchOn === false) {
            powered.add(nb.key);
            continue;
          }
        } else {
          if (!this._canWaterLink(cur, nb)) continue;
          // closed shutoff stops downstream fixtures
          if (cur.type === "shutoff_valve" && cur.valveOpen === false) continue;
          if (nb.type === "shutoff_valve" && nb.valveOpen === false) {
            powered.add(nb.key);
            continue;
          }
        }
        powered.add(nb.key);
        queue.push(nb);
      }
    }

    // Light fixtures need a switch ON on same circuit (nearby breaker branch)
    if (net === "power") {
      for (const n of this.nodes.values()) {
        if (n.type !== "light_fixture" || !powered.has(n.key)) continue;
        if (!this._lightAllowed(n, powered)) {
          powered.delete(n.key);
        }
      }
    }
    return powered;
  }

  /**
   * Light is on only if some powered light_switch within range is switchOn,
   * or no switch exists nearby (always-on fallback for simple builds).
   */
  _lightAllowed(light, powered) {
    let sawSwitch = false;
    for (const s of this.nodes.values()) {
      if (s.type !== "light_switch" || s.dim !== light.dim) continue;
      if (dist(s, light) > 10) continue;
      sawSwitch = true;
      if (s.switchOn && powered.has(s.key) && s.online && !s.broken) return true;
    }
    return !sawSwitch; // no switch in range → fixture follows grid only
  }

  toggleSwitch(key) {
    const n = this.nodes.get(key);
    if (!n) return { ok: false, error: "Unknown" };
    if (n.type === "light_switch" || n.type === "circuit_breaker") {
      n.switchOn = !n.switchOn;
      if (n.type === "circuit_breaker") n.online = true;
      this.save();
      return { ok: true, switchOn: n.switchOn, type: n.type };
    }
    return { ok: false, error: "Not a switch/breaker" };
  }

  toggleValve(key) {
    const n = this.nodes.get(key);
    if (!n || n.type !== "shutoff_valve") return { ok: false, error: "Not a shutoff valve" };
    n.valveOpen = !n.valveOpen;
    this.save();
    return { ok: true, valveOpen: n.valveOpen };
  }

  describeWaterPath(nodeKey) {
    const st = this.status("water");
    const n = this.nodes.get(nodeKey);
    if (!n) return "Unknown";
    const live = st.powered.has(nodeKey);
    const tierName = ["SOURCE","MAIN","NEIGHBORHOOD","BUILDING","BRANCH","FIXTURE"][n.tier ?? 5] || "?";
    return `${tierName} · ${live ? "PRESSURE" : "DRY"} · supply ${st.gen} demand ${st.load}`;
  }

  /** Trace path labels for UI */
  describePowerPath(nodeKey) {
    const st = this.status("power");
    const n = this.nodes.get(nodeKey);
    if (!n) return "Unknown";
    const live = st.powered.has(nodeKey);
    const tierName = ["GEN","HV","NEIGHBORHOOD","BUILDING","CIRCUIT","ENDPOINT"][n.tier ?? 5] || "?";
    return `${tierName} · ${live ? "LIVE" : "DEAD"} · gen ${st.gen} load ${st.load}`;
  }


  status(net = "power") {
    const powered = this.computePowered(net);
    let gen = 0, load = 0;
    for (const key of powered) {
      const n = this.nodes.get(key);
      if (!n) continue;
      if (net === "power" && (n.type === "generator_diesel" || n.type === "generator_solar" || n.type === "generator_large"))
        gen += n.generation || POWER_GEN[n.type] || 0;
      if (net === "water" && WATER_GEN[n.type])
        gen += n.generation || WATER_GEN[n.type] || 0;
      load += n.load || 0;
      if (n.type === "electric_meter" || n.type === "water_meter") load += 6;
    }
    const online = gen > 0 && gen >= load;
    return { powered, gen, load, online, surplus: gen - load, net };
  }

  refuelDiesel(key, amount = 50) {
    const n = this.nodes.get(key);
    if (!n || (n.type !== "generator_diesel" && n.type !== "generator_large")) return { ok: false, error: "Not a fueled generator" };
    n.fuel = Math.min(100, (n.fuel || 0) + amount);
    n.online = true; n.broken = false;
    this.save();
    return { ok: true, fuel: n.fuel };
  }

  refillWater(key, amount = 40) {
    const n = this.nodes.get(key);
    if (!n || !WATER_GEN[n.type])
      return { ok: false, error: "Not a water source" };
    n.waterLevel = Math.min(100, (n.waterLevel || 0) + amount);
    n.online = true; n.broken = false;
    this.save();
    return { ok: true, waterLevel: n.waterLevel };
  }

  toggleNode(key) {
    const n = this.nodes.get(key);
    if (!n) return { ok: false, error: "Unknown node" };
    n.online = !n.online;
    this.save();
    return { ok: true, online: n.online };
  }

  tripBreaker(key) {
    const n = this.nodes.get(key);
    if (!n) return { ok: false, error: "Unknown" };
    n.broken = true; n.online = false;
    this.save();
    return { ok: true };
  }

  replaceFuse(key) {
    const n = this.nodes.get(key);
    if (!n) return { ok: false, error: "Unknown" };
    n.broken = false; n.online = true;
    this.save();
    return { ok: true };
  }

  useFixture(key, playerName) {
    const n = this.nodes.get(key);
    if (!n) return { ok: false, error: "Not registered" };
    const st = this.status(n.net);
    if (!st.powered.has(key) || !st.online) {
      return { ok: false, error: n.net === "power" ? "No power" : "No water pressure" };
    }
    if (n.net === "power") {
      n.kwh = round2((n.kwh || 0) + 0.1);
      if (n.type === "light_fixture") {
        return { ok: true, message: "Light on", kwh: n.kwh };
      }
      if (n.type === "outlet") {
        return { ok: true, message: "Outlet live", kwh: n.kwh };
      }
    } else {
      const use = n.type === "shower" ? 15 : n.type === "toilet" ? 6 : 3;
      n.liters = round2((n.liters || 0) + use);
      // hot water if heater supplied on same water graph nearby
      let hot = false;
      for (const h of this.nodes.values()) {
        if (h.type === "water_heater" && st.powered.has(h.key) && h.dim === n.dim && dist(h, n) <= 16) {
          hot = true;
          break;
        }
      }
      this.save();
      return {
        ok: true,
        message: `${n.type} used` + (hot ? " (hot)" : " (cold)"),
        liters: n.liters,
        hot
      };
    }
    this.save();
    return { ok: true };
  }

  linkMeter(key, playerName) {
    const n = this.nodes.get(key);
    if (!n) return { ok: false, error: "No meter" };
    n.owner = playerName;
    n.linkedAccount = playerName;
    let acc = this.accounts.get(playerName);
    if (!acc) {
      acc = { player: playerName, powerDue: 0, waterDue: 0, paid: 0 };
      this.accounts.set(playerName, acc);
    }
    this.save();
    return { ok: true };
  }

  issueBills() {
    const bills = [];
    const byOwner = new Map();
    for (const n of this.nodes.values()) {
      if (n.type !== "electric_meter" && n.type !== "water_meter") continue;
      const owner = n.owner || n.linkedAccount;
      if (!owner) continue;
      if (!byOwner.has(owner)) byOwner.set(owner, { power: 0, water: 0 });
      const row = byOwner.get(owner);
      if (n.type === "electric_meter") {
        row.power += n.kwh || 0;
        n.kwh = 0;
      } else {
        row.water += n.liters || 0;
        n.liters = 0;
      }
    }
    for (const [owner, usage] of byOwner) {
      const powerAmt = round2(usage.power * (this.settings.kwhPrice || 0.12));
      const waterAmt = round2(usage.water * (this.settings.waterPrice || 0.004));
      const total = round2(powerAmt + waterAmt);
      if (total <= 0) continue;
      let acc = this.accounts.get(owner);
      if (!acc) {
        acc = { player: owner, powerDue: 0, waterDue: 0, paid: 0 };
        this.accounts.set(owner, acc);
      }
      acc.powerDue = round2((acc.powerDue || 0) + powerAmt);
      acc.waterDue = round2((acc.waterDue || 0) + waterAmt);
      const bill = {
        id: `bill_${this.next.bill++}`,
        owner, powerAmt, waterAmt, total,
        kwh: usage.power, liters: usage.water,
        at: Date.now(), status: "due"
      };
      bills.push(bill);
    }
    this.save();
    return bills;
  }

  payBill(playerName, amount) {
    const acc = this.accounts.get(playerName);
    if (!acc) return { ok: false, error: "No account" };
    const due = round2((acc.powerDue || 0) + (acc.waterDue || 0));
    if (due <= 0) return { ok: false, error: "Nothing due" };
    const pay = amount != null ? round2(amount) : due;
    if (!Number.isFinite(pay) || pay <= 0) return { ok: false, error: "Invalid amount" };
    let left = pay;
    const fromPower = Math.min(acc.powerDue || 0, left);
    acc.powerDue = round2((acc.powerDue || 0) - fromPower);
    left = round2(left - fromPower);
    const fromWater = Math.min(acc.waterDue || 0, left);
    acc.waterDue = round2((acc.waterDue || 0) - fromWater);
    acc.paid = round2((acc.paid || 0) + pay);
    this.save();
    return { ok: true, paid: pay, remaining: round2((acc.powerDue || 0) + (acc.waterDue || 0)) };
  }

  // ===== ID =====
  issueId(playerName, fullName, dob, address) {
    const card = {
      id: `ID-${this.next.id++}`,
      player: playerName,
      fullName: String(fullName || playerName).slice(0, 40),
      dob: String(dob || "2000-01-01").slice(0, 12),
      address: String(address || "").slice(0, 60),
      issuedAt: Date.now(),
      status: "valid"
    };
    this.ids.set(playerName, card);
    this.save();
    return card;
  }

  getId(playerName) {
    return this.ids.get(playerName) || null;
  }

  revokeId(playerName) {
    const id = this.ids.get(playerName);
    if (!id) return { ok: false, error: "No ID" };
    id.status = "revoked";
    this.save();
    return { ok: true };
  }

  // ===== Insurance =====
  buyPolicy(playerName, type, premium, coverage) {
    if (!this.getId(playerName) || this.getId(playerName).status !== "valid") {
      return { ok: false, error: "Valid government ID required" };
    }
    const p = {
      id: `pol_${this.next.policy++}`,
      owner: playerName,
      type: type || "home",
      premium: round2(premium || 50),
      coverage: round2(coverage || 10000),
      status: "active",
      claims: [],
      at: Date.now()
    };
    this.policies.set(p.id, p);
    this.save();
    return { ok: true, policy: p };
  }

  listPolicies(playerName) {
    return [...this.policies.values()].filter((p) => p.owner === playerName && p.status === "active");
  }

  fileClaim(playerName, policyId, amount, reason) {
    const p = this.policies.get(policyId);
    if (!p || p.owner !== playerName || p.status !== "active") {
      return { ok: false, error: "Policy not found" };
    }
    amount = round2(amount);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Invalid amount" };
    const approved = amount <= p.coverage * 0.5;
    const payout = approved ? Math.min(amount, p.coverage) : 0;
    const claim = {
      id: `clm_${this.next.claim++}`,
      amount, reason: String(reason || "").slice(0, 40),
      approved, payout, at: Date.now()
    };
    p.claims.push(claim);
    if (approved) p.coverage = round2(Math.max(0, p.coverage - payout));
    this.save();
    return { ok: true, claim };
  }

  publishBridges() {
    const power = this.status("power");
    const water = this.status("water");
    try {
      world.setDynamicProperty(GRID_BRIDGE, JSON.stringify({
        powerOnline: power.online, powerGen: power.gen, powerLoad: power.load,
        waterOnline: water.online, waterGen: water.gen, waterLoad: water.load,
        at: Date.now()
      }));
      world.setDynamicProperty(POWER_BRIDGE, JSON.stringify({
        gridOnline: power.online, generation: power.gen, load: power.load, at: Date.now()
      }));
    } catch (e) {}
  }

  tick() {
    this._tick++;
    const power = this.status("power");
    const water = this.status("water");

    if (this._tick % 100 === 0) {
      for (const n of this.nodes.values()) {
        if ((n.type === "generator_diesel" || n.type === "generator_large") && n.online && !n.broken && (n.fuel || 0) > 0) {
          n.fuel = Math.max(0, (n.fuel || 0) - 1);
          if (n.fuel <= 0) n.online = false;
        }
        if (WATER_GEN[n.type] && n.online && !n.broken) {
          const drain = n.type === "reservoir" ? 0.2 : 0.5;
          n.waterLevel = Math.max(0, (n.waterLevel || 0) - drain);
          if (n.waterLevel <= 0) n.online = false;
        }
      }
    }

    if (power.online && this._tick % 20 === 0) {
      for (const key of power.powered) {
        const n = this.nodes.get(key);
        if (n && n.type === "electric_meter") n.kwh = round2((n.kwh || 0) + 0.05);
      }
    }
    if (water.online && this._tick % 20 === 0) {
      for (const key of water.powered) {
        const n = this.nodes.get(key);
        if (n && n.type === "water_meter") n.liters = round2((n.liters || 0) + 0.2);
      }
    }

    if (power.gen > 0 && power.load > power.gen * 1.15 && this._tick % 40 === 0) {
      const cands = [...this.nodes.values()].filter(
        (n) => (n.type === "transformer" || n.type === "breaker_panel") && !n.broken
      );
      if (cands.length) {
        const v = cands[Math.floor(Math.random() * cands.length)];
        v.broken = true; v.online = false;
      }
    }

    if (this._tick % 40 === 0) {
      this.publishBridges();
      this.save();
    }
    if (this._tick % (this.settings.billIntervalTicks || 24000) === 0) {
      this.issueBills();
    }
  }

  formatStatus() {
    const p = this.status("power");
    const w = this.status("water");
    return (
      `Power ${p.online ? "ONLINE" : "OFFLINE"}  gen ${p.gen} load ${p.load}\n` +
      `Water ${w.online ? "ONLINE" : "OFFLINE"}  gen ${w.gen} load ${w.load}\n` +
      `Nodes ${this.nodes.size}`
    );
  }
}
