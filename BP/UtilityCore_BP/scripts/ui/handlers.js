import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { system, world, ItemStack } from "@minecraft/server";

function nextForm(fn) {
  system.run(() => {
    try { fn(); } catch (e) { console.warn("[UtilityCore] form", e); }
  });
}

function parseAmt(raw) {
  const n = Number(String(raw || "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function heldItem(player) {
  try {
    const inv = player.getComponent("inventory")?.container;
    if (!inv) return null;
    const slot = player.selectedSlotIndex ?? player.selectedSlot ?? 0;
    return { inv, slot, item: inv.getItem(slot) };
  } catch (e) { return null; }
}

function consumeHeld(player, held) {
  if (!held?.item) return;
  try {
    if (held.item.amount <= 1) held.inv.setItem(held.slot, undefined);
    else { held.item.amount -= 1; held.inv.setItem(held.slot, held.item); }
  } catch (e) {}
}

const BLOCK_TYPES = {
  "utilitycore:generator_diesel": "generator_diesel",
  "utilitycore:generator_solar": "generator_solar",
  "utilitycore:generator_large": "generator_large",
  "utilitycore:power_pole": "power_pole",
  "utilitycore:power_line": "power_line",
  "utilitycore:conduit": "conduit",
  "utilitycore:transformer": "transformer",
  "utilitycore:substation": "substation",
  "utilitycore:neighborhood_room": "neighborhood_room",
  "utilitycore:building_room": "building_room",
  "utilitycore:breaker_panel": "breaker_panel",
  "utilitycore:circuit_breaker": "circuit_breaker",
  "utilitycore:electric_meter": "electric_meter",
  "utilitycore:outlet": "outlet",
  "utilitycore:light_switch": "light_switch",
  "utilitycore:light_fixture": "light_fixture",
  "utilitycore:fridge": "fridge",
  "utilitycore:stove": "stove",
  "utilitycore:microwave": "microwave",
  "utilitycore:dishwasher": "dishwasher",
  "utilitycore:washer": "washer",
  "utilitycore:dryer": "dryer",
  "utilitycore:tv": "tv",
  "utilitycore:router": "router",
  "utilitycore:ac_unit": "ac_unit",
  "utilitycore:furnace": "furnace",
  "utilitycore:ceiling_fan": "ceiling_fan",
  "utilitycore:reservoir": "reservoir",
  "utilitycore:well_pump": "well_pump",
  "utilitycore:water_plant": "water_plant",
  "utilitycore:water_tower": "water_tower",
  "utilitycore:water_main": "water_main",
  "utilitycore:pipe_junction": "pipe_junction",
  "utilitycore:pump_station": "pump_station",
  "utilitycore:plumbing_room": "plumbing_room",
  "utilitycore:shutoff_valve": "shutoff_valve",
  "utilitycore:water_meter": "water_meter",
  "utilitycore:water_heater": "water_heater",
  "utilitycore:branch_pipe": "branch_pipe",
  "utilitycore:sink": "sink",
  "utilitycore:toilet": "toilet",
  "utilitycore:shower": "shower",
  "utilitycore:utility_desk": "utility_desk",
  "utilitycore:id_kiosk": "id_kiosk",
  "utilitycore:insurance_desk": "insurance_desk"
};

const APPLIANCE_TYPES = new Set([
  "fridge","stove","microwave","dishwasher","washer","dryer","tv","router","ac_unit","furnace","ceiling_fan"
]);
const WATER_SOURCE = new Set(["water_plant","water_tower","reservoir","well_pump"]);
const FIXTURES = new Set(["light_fixture","sink","toilet","shower"]);

export function setupUIHandlers(util) {
  world.afterEvents.itemUse.subscribe((ev) => {
    const item = ev.itemStack;
    if (!item) return;
    const player = ev.source;
    if (item.typeId === "utilitycore:multimeter" || item.typeId === "utilitycore:tablet") {
      nextForm(() => showTablet(player, util));
    } else if (item.typeId === "utilitycore:id_card") {
      const card = util.getId(player.name);
      player.sendMessage(card ? `§bID ${card.id} §f${card.fullName}` : "§7No ID — use ID Kiosk");
    }
  });

  world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
    const type = BLOCK_TYPES[ev.block?.typeId];
    if (!type) return;
    try { ev.cancel = true; } catch (e) {}
    const player = ev.player;
    const dim = ev.block.dimension.id;
    const b = ev.block;
    if (type === "utility_desk") return nextForm(() => showDesk(player, util));
    if (type === "id_kiosk") return nextForm(() => showIdKiosk(player, util));
    if (type === "insurance_desk") return nextForm(() => showInsurance(player, util));
    let node = util.getNodeAt(b.x, b.y, b.z, dim);
    if (!node) {
      node = util.registerNode(type, b.x, b.y, b.z, dim, player.name);
      player.sendMessage(`§aRegistered §f${type.replace(/_/g, " ")}`);
    }
    nextForm(() => showNode(player, util, node));
  });

  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    try {
      const id = ev.brokenBlockPermutation?.type?.id;
      if (!id || !id.startsWith("utilitycore:")) return;
      const b = ev.block;
      util.deregisterAt(b.x, b.y, b.z, ev.player?.dimension?.id || b.dimension?.id);
    } catch (e) {}
  });
}

function showTablet(player, util) {
  new ActionFormData().title("Utility tablet").body(util.formatStatus())
    .button("Pay bills").button("My ID").button("My insurance").button("Issue bills now").button("Close")
    .show(player).then((res) => {
      if (res.canceled || res.selection === 4) return;
      if (res.selection === 0) nextForm(() => showPayBills(player, util));
      if (res.selection === 1) {
        const id = util.getId(player.name);
        player.sendMessage(id ? `§f${id.fullName} §7${id.id}` : "§7No ID");
      }
      if (res.selection === 2) {
        const list = util.listPolicies(player.name);
        player.sendMessage(list.length ? list.map((p) => `${p.id} ${p.type}`).join("\n") : "§7No policies");
      }
      if (res.selection === 3) {
        const bills = util.issueBills();
        player.sendMessage(bills.length ? `§aIssued ${bills.length}` : "§7Nothing to bill");
      }
    });
}

function showDesk(player, util) {
  new ActionFormData().title("Utility desk").body(util.formatStatus())
    .button("Pay my bill").button("Issue all bills").button("Rate settings").button("Close")
    .show(player).then((res) => {
      if (res.canceled || res.selection === 3) return;
      if (res.selection === 0) nextForm(() => showPayBills(player, util));
      if (res.selection === 1) {
        const bills = util.issueBills();
        player.sendMessage(bills.length ? `§a${bills.length} bill(s)` : "§7None");
      }
      if (res.selection === 2) {
        nextForm(() => {
          new ModalFormData().title("Rates")
            .textField("$/kWh", String(util.settings.kwhPrice))
            .textField("$/L water", String(util.settings.waterPrice))
            .show(player).then((r) => {
              if (r.canceled) return;
              const k = Number(r.formValues[0]), w = Number(r.formValues[1]);
              if (Number.isFinite(k) && k >= 0) util.settings.kwhPrice = k;
              if (Number.isFinite(w) && w >= 0) util.settings.waterPrice = w;
              util.save();
              player.sendMessage("§aSaved");
            });
        });
      }
    });
}

function showPayBills(player, util) {
  const acc = util.accounts.get(player.name) || { powerDue: 0, waterDue: 0 };
  const due = Math.round(((acc.powerDue || 0) + (acc.waterDue || 0)) * 100) / 100;
  new ModalFormData().title("Pay utilities")
    .textField(`Amount due $${due.toFixed(2)}`, String(due || 0))
    .show(player).then((r) => {
      if (r.canceled) return;
      const out = util.payBill(player.name, parseAmt(r.formValues[0]));
      player.sendMessage(out.ok ? `§aPaid $${out.paid}` : `§c${out.error}`);
    });
}

function showIdKiosk(player, util) {
  const existing = util.getId(player.name);
  new ActionFormData().title("ID kiosk")
    .body(existing ? `§f${existing.fullName}\n§7${existing.id}` : "§7No government ID")
    .button(existing ? "Update ID" : "Issue ID").button("Close")
    .show(player).then((res) => {
      if (res.canceled || res.selection === 1) return;
      nextForm(() => {
        new ModalFormData().title("Government ID")
          .textField("Full legal name", existing?.fullName || player.name)
          .textField("Date of birth", existing?.dob || "2000-01-01")
          .textField("Address", existing?.address || "")
          .show(player).then((r) => {
            if (r.canceled) return;
            const card = util.issueId(player.name, r.formValues[0], r.formValues[1], r.formValues[2]);
            try {
              const stack = new ItemStack("utilitycore:id_card", 1);
              stack.nameTag = `ID ${card.id}`;
              stack.setLore([`§f${card.fullName}`, `§7DOB ${card.dob}`]);
              const inv = player.getComponent("inventory")?.container;
              if (inv) { const left = inv.addItem(stack); if (left) player.dimension.spawnItem(left, player.location); }
            } catch (e) {}
            player.sendMessage(`§aID issued ${card.id}`);
          });
      });
    });
}

function showInsurance(player, util) {
  new ActionFormData().title("Insurance")
    .button("Buy home policy").button("Buy tenant policy").button("My policies / claim").button("Close")
    .show(player).then((res) => {
      if (res.canceled || res.selection === 3) return;
      if (res.selection === 0 || res.selection === 1) {
        const type = res.selection === 0 ? "home" : "tenant";
        const out = util.buyPolicy(player.name, type, type === "home" ? 75 : 40, type === "home" ? 25000 : 5000);
        player.sendMessage(out.ok ? `§aPolicy ${out.policy.id}` : `§c${out.error}`);
      }
      if (res.selection === 2) {
        const list = util.listPolicies(player.name);
        if (!list.length) return player.sendMessage("§7No policies (need valid ID)");
        const f = new ActionFormData().title("Policies");
        for (const p of list) f.button(`${p.type} ${p.id}\n$${p.coverage}`);
        f.button("Back");
        f.show(player).then((r) => {
          if (r.canceled || r.selection === list.length) return;
          const pol = list[r.selection];
          nextForm(() => {
            new ModalFormData().title("File claim").textField("Amount", "500").textField("Reason", "Damage")
              .show(player).then((r2) => {
                if (r2.canceled) return;
                const amt = parseAmt(r2.formValues[0]);
                if (amt == null) return player.sendMessage("§cInvalid amount");
                const out = util.fileClaim(player.name, pol.id, amt, r2.formValues[1]);
                if (!out.ok) return player.sendMessage(`§c${out.error}`);
                player.sendMessage(out.claim.approved ? `§aApproved $${out.claim.payout}` : "§eDenied");
              });
          });
        });
      }
    });
}

function showPlugs(player, util, outletKey) {
  const live = util.getNode(outletKey);
  const plugs = (live && live.plugs) || [];
  if (!plugs.length) return player.sendMessage("§7Nothing plugged in");
  const form = new ActionFormData().title("Plugged devices");
  for (const p of plugs) form.button(`${p.name}\n${p.on ? "ON" : "off"} · load ${p.load}`);
  form.button("Close");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === plugs.length) return;
    const idx = res.selection;
    nextForm(() => {
      new ActionFormData().title(plugs[idx].name)
        .button(plugs[idx].on ? "Switch off" : "Switch on").button("Unplug").button("Back")
        .show(player).then((r2) => {
          if (r2.canceled || r2.selection === 2) return;
          if (r2.selection === 0) { util.togglePlug(outletKey, idx); player.sendMessage("§aToggled"); }
          if (r2.selection === 1) {
            const out = util.unplugDevice(outletKey, idx);
            if (out.ok && out.removed) {
              try {
                const stack = new ItemStack(out.removed.itemTypeId, 1);
                const inv = player.getComponent("inventory")?.container;
                if (inv) { const left = inv.addItem(stack); if (left) player.dimension.spawnItem(left, player.location); }
              } catch (e) {}
              player.sendMessage("§aUnplugged");
            }
          }
        });
    });
  });
}

function showNode(player, util, node) {
  node = util.getNode(node.key) || node;
  const st = util.status(node.net);
  const powered = st.powered.has(node.key);
  let body = `§f${node.type.replace(/_/g, " ")}\n§7${node.id} · ${node.net}\n` +
    `§7Supplied: ${powered ? "§aYES" : "§cNO"}\n` +
    `§7Online: ${node.online ? "§aON" : "§cOFF"}` + (node.broken ? " §cTRIPPED" : "");
  if (node.type === "generator_diesel" || node.type === "generator_large") body += `\n§7Fuel: §f${node.fuel || 0}%`;
  if (WATER_SOURCE.has(node.type)) body += `\n§7Level: §f${Math.round(node.waterLevel || 0)}%`;
  if (node.type === "electric_meter") body += `\n§7kWh: §f${(node.kwh || 0).toFixed(2)}`;
  if (node.type === "water_meter") body += `\n§7L: §f${(node.liters || 0).toFixed(1)}`;
  if (node.net === "power" && util.describePowerPath) body += `\n§8${util.describePowerPath(node.key)}`;
  if (node.net === "water" && util.describeWaterPath) body += `\n§8${util.describeWaterPath(node.key)}`;

  const form = new ActionFormData().title("Equipment").body(body);

  if (node.type === "outlet") {
    const plugs = node.plugs || [];
    let pbody = body + `\n§7Plugs: §f${plugs.length}`;
    for (const p of plugs) pbody += `\n§8- ${p.name} ${p.on ? "§aON" : "§7off"}`;
    form.body(pbody);
    form.button("Plug held item").button("Manage plugs").button("Toggle online").button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 3) return;
      if (res.selection === 0) {
        const held = heldItem(player);
        if (!held?.item) return player.sendMessage("§cHold a household device");
        const r = util.plugDevice(node.key, held.item.typeId);
        if (!r.ok) return player.sendMessage(`§c${r.error}`);
        consumeHeld(player, held);
        player.sendMessage("§aPlugged in");
      }
      if (res.selection === 1) nextForm(() => showPlugs(player, util, node.key));
      if (res.selection === 2) {
        const r = util.toggleNode(node.key);
        player.sendMessage(r.online ? "§aOnline" : "§eOffline");
      }
    });
    return;
  }

  if (APPLIANCE_TYPES.has(node.type)) {
    form.body(body + `\n§7Status: ${node.running ? "§aRUNNING" : "§7idle"}`);
    form.button(node.running ? "Turn off" : "Turn on / run").button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 1) return;
      if (node.running) { util.stopAppliance(node.key); player.sendMessage("§eStopped"); }
      else {
        const r = util.runAppliance(node.key, player.name);
        player.sendMessage(r.ok ? `§a${r.message}` : `§c${r.error}`);
      }
    });
    return;
  }

  if (node.type === "light_switch" || node.type === "circuit_breaker") {
    form.body(body + `\n§7State: §f${node.switchOn !== false ? "ON/CLOSED" : "OFF/OPEN"}`);
    form.button(node.switchOn !== false ? "Turn OFF / open" : "Turn ON / close").button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 1) return;
      const r = util.toggleSwitch(node.key);
      player.sendMessage(r.ok ? (r.switchOn ? "§aON" : "§eOFF") : `§c${r.error}`);
    });
    return;
  }

  if (node.type === "shutoff_valve") {
    form.body(body + `\n§7Valve: §f${node.valveOpen !== false ? "OPEN" : "CLOSED"}`);
    form.button(node.valveOpen !== false ? "Close valve" : "Open valve").button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 1) return;
      const r = util.toggleValve(node.key);
      player.sendMessage(r.ok ? (r.valveOpen ? "§aOpen" : "§eClosed") : `§c${r.error}`);
    });
    return;
  }

  if (FIXTURES.has(node.type)) {
    form.button("Use").button("Toggle online").button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 2) return;
      if (res.selection === 0) {
        const r = util.useFixture(node.key, player.name);
        player.sendMessage(r.ok ? `§a${r.message}` : `§c${r.error}`);
      }
      if (res.selection === 1) {
        const r = util.toggleNode(node.key);
        player.sendMessage(r.online ? "§aOnline" : "§eOffline");
      }
    });
    return;
  }

  if (node.type === "generator_diesel" || node.type === "generator_large") {
    form.button("Refuel +50").button("Toggle").button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 2) return;
      if (res.selection === 0) {
        const r = util.refuelDiesel(node.key);
        player.sendMessage(r.ok ? `§aFuel ${r.fuel}%` : `§c${r.error}`);
      }
      if (res.selection === 1) {
        const r = util.toggleNode(node.key);
        player.sendMessage(r.online ? "§aOn" : "§eOff");
      }
    });
    return;
  }

  if (WATER_SOURCE.has(node.type)) {
    form.button("Refill +40").button("Toggle").button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 2) return;
      if (res.selection === 0) {
        const r = util.refillWater(node.key);
        player.sendMessage(r.ok ? `§aLevel ${Math.round(r.waterLevel)}%` : `§c${r.error}`);
      }
      if (res.selection === 1) {
        const r = util.toggleNode(node.key);
        player.sendMessage(r.online ? "§aOn" : "§eOff");
      }
    });
    return;
  }

  if (node.type === "electric_meter" || node.type === "water_meter") {
    form.button("Link to me (billing)").button("Toggle").button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 2) return;
      if (res.selection === 0) { util.linkMeter(node.key, player.name); player.sendMessage("§aMeter linked"); }
      if (res.selection === 1) {
        const r = util.toggleNode(node.key);
        player.sendMessage(r.online ? "§aOn" : "§eOff");
      }
    });
    return;
  }

  form.button(node.broken ? "Replace fuse" : "Trip (test)").button("Toggle").button("Close");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === 2) return;
    if (res.selection === 0) {
      if (node.broken) {
        const held = heldItem(player);
        if (!held?.item || held.item.typeId !== "utilitycore:fuse") return player.sendMessage("§cHold a fuse");
        consumeHeld(player, held);
        util.replaceFuse(node.key);
        player.sendMessage("§aRestored");
      } else {
        util.tripBreaker(node.key);
        player.sendMessage("§eTripped");
      }
    }
    if (res.selection === 1) {
      const r = util.toggleNode(node.key);
      player.sendMessage(r.online ? "§aOn" : "§eOff");
    }
  });
}
