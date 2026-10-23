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

const BLOCK_TYPES = {
  "utilitycore:generator_diesel": "generator_diesel",
  "utilitycore:generator_solar": "generator_solar",
  "utilitycore:power_pole": "power_pole",
  "utilitycore:transformer": "transformer",
  "utilitycore:breaker_panel": "breaker_panel",
  "utilitycore:electric_meter": "electric_meter",
  "utilitycore:outlet": "outlet",
  "utilitycore:light_fixture": "light_fixture",
  "utilitycore:water_plant": "water_plant",
  "utilitycore:water_tower": "water_tower",
  "utilitycore:pipe_junction": "pipe_junction",
  "utilitycore:water_meter": "water_meter",
  "utilitycore:sink": "sink",
  "utilitycore:toilet": "toilet",
  "utilitycore:shower": "shower",
  "utilitycore:utility_desk": "utility_desk",
  "utilitycore:id_kiosk": "id_kiosk",
  "utilitycore:insurance_desk": "insurance_desk",
  "utilitycore:ceiling_fan": "ceiling_fan",
  "utilitycore:furnace": "furnace",
  "utilitycore:ac_unit": "ac_unit",
  "utilitycore:router": "router",
  "utilitycore:tv": "tv",
  "utilitycore:dryer": "dryer",
  "utilitycore:washer": "washer",
  "utilitycore:dishwasher": "dishwasher",
  "utilitycore:microwave": "microwave",
  "utilitycore:stove": "stove",
  "utilitycore:fridge": "fridge",
  "utilitycore:reservoir": "reservoir",
  "utilitycore:well_pump": "well_pump",
  "utilitycore:water_main": "water_main",
  "utilitycore:pump_station": "pump_station",
  "utilitycore:plumbing_room": "plumbing_room",
  "utilitycore:shutoff_valve": "shutoff_valve",
  "utilitycore:branch_pipe": "branch_pipe",
  "utilitycore:water_heater": "water_heater",
  "utilitycore:generator_large": "generator_large"
};

export function setupUIHandlers(util) {
  world.afterEvents.itemUse.subscribe((ev) => {
    const item = ev.itemStack;
    if (!item) return;
    const player = ev.source;
    if (item.typeId === "utilitycore:multimeter" || item.typeId === "utilitycore:tablet") {
      nextForm(() => showTablet(player, util));
    } else if (item.typeId === "utilitycore:id_card") {
      const id = util.getId(player.name);
      player.sendMessage(id
        ? `§bID ${id.id} §f${id.fullName} §7(${id.status})`
        : "§7No ID on file — use an ID Kiosk");
    }
  });

  world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
    const type = BLOCK_TYPES[ev.block?.typeId];
    if (!type) return;
    ev.cancel = true;
    const player = ev.player;
    const dim = ev.block.dimension.id;
    const b = ev.block;

    if (type === "utility_desk") return nextForm(() => showDesk(player, util));
    if (type === "id_kiosk") return nextForm(() => showIdKiosk(player, util));
    if (type === "insurance_desk") return nextForm(() => showInsurance(player, util));

    let node = util.getNodeAt(b.x, b.y, b.z, dim);
    if (!node) {
      node = util.registerNode(type, b.x, b.y, b.z, dim, player.name);
      player.sendMessage(`§aRegistered §f${type}`);
    }
    nextForm(() => showNode(player, util, node));
  });

  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    try {
      const id = ev.brokenBlockPermutation?.type?.id;
      if (!id || !id.startsWith("utilitycore:")) return;
      const b = ev.block;
      const dim = ev.player?.dimension?.id || b.dimension?.id;
      util.deregisterAt(b.x, b.y, b.z, dim);
    } catch (e) {}
  });
}


function showPlugs(player, util, outletKey) {
  const live = util.getNode(outletKey);
  const plugs = (live && live.plugs) || [];
  if (!plugs.length) {
    player.sendMessage("§7Nothing plugged in");
    return;
  }
  const form = new ActionFormData().title("Plugged devices");
  for (const p of plugs) {
    form.button(`${p.name}\n${p.on ? "ON" : "off"} · load ${p.load}`);
  }
  form.button("Close");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === plugs.length) return;
    const idx = res.selection;
    nextForm(() => {
      new ActionFormData()
        .title(plugs[idx].name)
        .button(plugs[idx].on ? "Switch off" : "Switch on")
        .button("Unplug")
        .button("Back")
        .show(player)
        .then((r2) => {
          if (r2.canceled || r2.selection === 2) return;
          if (r2.selection === 0) {
            util.togglePlug(outletKey, idx);
            player.sendMessage("§aToggled");
          }
          if (r2.selection === 1) {
            const out = util.unplugDevice(outletKey, idx);
            if (out.ok && out.removed) {
              try {
                const stack = new ItemStack(out.removed.itemTypeId, 1);
                const inv = player.getComponent("inventory")?.container;
                if (inv) {
                  const left = inv.addItem(stack);
                  if (left) player.dimension.spawnItem(left, player.location);
                }
              } catch (e) {}
              player.sendMessage("§aUnplugged");
            }
          }
        });
    });
  });
}

function showTablet(player, util) {
  new ActionFormData()
    .title("Utility tablet")
    .body(util.formatStatus())
    .button("Pay bills")
    .button("My ID")
    .button("My insurance")
    .button("Issue bills now")
    .button("Close")
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === 4) return;
      if (res.selection === 0) nextForm(() => showPayBills(player, util));
      if (res.selection === 1) {
        const id = util.getId(player.name);
        player.sendMessage(id ? `§f${id.fullName} §7${id.id} · ${id.status}` : "§7No ID");
      }
      if (res.selection === 2) {
        const list = util.listPolicies(player.name);
        player.sendMessage(list.length
          ? list.map((p) => `${p.id} ${p.type} cov $${p.coverage}`).join("\n")
          : "§7No policies");
      }
      if (res.selection === 3) {
        const bills = util.issueBills();
        player.sendMessage(bills.length ? `§aIssued ${bills.length} bill(s)` : "§7Nothing to bill");
      }
    });
}

function showDesk(player, util) {
  new ActionFormData()
    .title("Utility desk")
    .body(util.formatStatus())
    .button("Pay my bill")
    .button("Issue all bills")
    .button("Rate settings")
    .button("Close")
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === 3) return;
      if (res.selection === 0) nextForm(() => showPayBills(player, util));
      if (res.selection === 1) {
        const bills = util.issueBills();
        player.sendMessage(bills.length ? `§a${bills.length} bill(s)` : "§7None");
      }
      if (res.selection === 2) {
        nextForm(() => {
          new ModalFormData()
            .title("Rates")
            .textField("$/kWh", String(util.settings.kwhPrice))
            .textField("$/L water", String(util.settings.waterPrice))
            .show(player)
            .then((r) => {
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
  new ModalFormData()
    .title("Pay utilities")
    .textField(`Amount due $${due.toFixed(2)}`, String(due || 0))
    .show(player)
    .then((r) => {
      if (r.canceled) return;
      const amt = parseAmt(r.formValues[0]);
      const out = util.payBill(player.name, amt);
      player.sendMessage(out.ok
        ? `§aPaid $${out.paid} · remaining $${out.remaining}`
        : `§c${out.error}`);
    });
}

function showIdKiosk(player, util) {
  const existing = util.getId(player.name);
  new ActionFormData()
    .title("ID kiosk")
    .body(existing
      ? `§f${existing.fullName}\n§7${existing.id} · ${existing.status}`
      : "§7No government ID on file")
    .button(existing ? "Update ID" : "Issue ID")
    .button("Close")
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === 1) return;
      nextForm(() => {
        new ModalFormData()
          .title("Government ID")
          .textField("Full legal name", existing?.fullName || player.name)
          .textField("Date of birth", existing?.dob || "2000-01-01")
          .textField("Address", existing?.address || "")
          .show(player)
          .then((r) => {
            if (r.canceled) return;
            const card = util.issueId(player.name, r.formValues[0], r.formValues[1], r.formValues[2]);
            try {
              const stack = new ItemStack("utilitycore:id_card", 1);
              stack.nameTag = `ID ${card.id}`;
              stack.setLore([
                `§f${card.fullName}`,
                `§7DOB ${card.dob}`,
                `§8${card.address || "—"}`,
                `§eid:${card.id}`
              ]);
              const inv = player.getComponent("inventory")?.container;
              if (inv) {
                const left = inv.addItem(stack);
                if (left) player.dimension.spawnItem(left, player.location);
              }
            } catch (e) {}
            player.sendMessage(`§aID issued ${card.id}`);
          });
      });
    });
}

function showInsurance(player, util) {
  new ActionFormData()
    .title("Insurance")
    .body("Home · tenant · contents policies")
    .button("Buy home policy")
    .button("Buy tenant policy")
    .button("My policies / claim")
    .button("Close")
    .show(player)
    .then((res) => {
      if (res.canceled || res.selection === 3) return;
      if (res.selection === 0 || res.selection === 1) {
        const type = res.selection === 0 ? "home" : "tenant";
        const out = util.buyPolicy(player.name, type, type === "home" ? 75 : 40, type === "home" ? 25000 : 5000);
        if (!out.ok) return player.sendMessage(`§c${out.error}`);
        player.sendMessage(`§aPolicy ${out.policy.id} (${type}) coverage $${out.policy.coverage}`);
      }
      if (res.selection === 2) {
        const list = util.listPolicies(player.name);
        if (!list.length) return player.sendMessage("§7No policies — need valid ID first");
        const f = new ActionFormData().title("Policies");
        for (const p of list) f.button(`${p.type} ${p.id}\nCov $${p.coverage}`);
        f.button("Back");
        f.show(player).then((r) => {
          if (r.canceled || r.selection === list.length) return;
          const pol = list[r.selection];
          nextForm(() => {
            new ModalFormData()
              .title("File claim")
              .textField("Amount", "500")
              .textField("Reason", "Damage")
              .show(player)
              .then((r2) => {
                if (r2.canceled) return;
                const amt = parseAmt(r2.formValues[0]);
                if (amt == null) return player.sendMessage("§cInvalid amount");
                const out = util.fileClaim(player.name, pol.id, amt, r2.formValues[1]);
                if (!out.ok) return player.sendMessage(`§c${out.error}`);
                player.sendMessage(out.claim.approved
                  ? `§aClaim approved · payout $${out.claim.payout}`
                  : "§eClaim denied");
              });
          });
        });
      }
    });
}

function showNode(player, util, node) {
  const st = util.status(node.net);
  const powered = st.powered.has(node.key);
  let body =
    `§f${node.type}\n§7${node.id} · ${node.net}\n` +
    `§7Supplied: ${powered ? "§aYES" : "§cNO"}\n` +
    `§7Online: ${node.online ? "§aON" : "§cOFF"}` +
    (node.broken ? " §cTRIPPED" : "");
  if (node.type === "generator_diesel" || node.type === "generator_large") body += `\n§7Fuel: §f${node.fuel || 0}%`;
  if (node.type === "water_plant" || node.type === "water_tower" || node.type === "reservoir" || node.type === "well_pump")
    body += `\n§7Level: §f${Math.round(node.waterLevel || 0)}%`;
  if (node.type === "electric_meter") body += `\n§7kWh: §f${(node.kwh || 0).toFixed(2)}`;
  if (node.type === "water_meter") body += `\n§7L: §f${(node.liters || 0).toFixed(1)}`;
  if (node.net === "power" && util.describePowerPath) {
    body += `\n§8${util.describePowerPath(node.key)}`;
  }
  if (node.net === "water" && util.describeWaterPath) {
    body += `\n§8${util.describeWaterPath(node.key)}`;
  }

  const form = new ActionFormData().title("Equipment").body(body);

  // Fixtures: use
  if (node.type === "outlet") {
    const plugs = node.plugs || [];
    let pbody = body + `\n§7Plugs: §f${plugs.length}`;
    for (const p of plugs) pbody += `\n§8- ${p.name} ${p.on ? "§aON" : "§7off"}`;
    form.body(pbody);
    form.button("Plug held item");
    form.button("Manage plugs");
    form.button("Toggle online");
    form.button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 3) return;
      if (res.selection === 0) {
        let held = null;
        try {
          const slot = player.selectedSlotIndex ?? player.selectedSlot ?? 0;
          held = player.getComponent("inventory")?.container?.getItem(slot);
        } catch (e) {}
        if (!held) return player.sendMessage("§cHold a household device to plug in");
        const r = util.plugDevice(node.key, held.typeId);
        if (!r.ok) return player.sendMessage(`§c${r.error}`);
        try {
          const inv = player.getComponent("inventory")?.container;
          if (inv) {
            const slot2 = player.selectedSlotIndex ?? player.selectedSlot ?? 0;
            if (held.amount <= 1) inv.setItem(slot2, undefined);
            else { held.amount -= 1; inv.setItem(slot2, held); }
          }
        } catch (e) {}
        player.sendMessage(`§aPlugged in`);
      }
      if (res.selection === 1) nextForm(() => showPlugs(player, util, node.key));
      if (res.selection === 2) {
        const r = util.toggleNode(node.key);
        player.sendMessage(r.online ? "§aOnline" : "§eOffline");
      }
    });
    return;
  }

  if (["fridge","stove","microwave","dishwasher","washer","dryer","tv","router","ac_unit","furnace","ceiling_fan"].includes(node.type)) {
    const run = node.running ? "§aRUNNING" : "§7idle";
    form.body(body + `\n§7Status: ${run}`);
    form.button(node.running ? "Turn off" : "Turn on / run");
    form.button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 1) return;
      if (node.running) {
        util.stopAppliance(node.key);
        player.sendMessage("§eStopped");
      } else {
        const r = util.runAppliance(node.key, player.name);
        player.sendMessage(r.ok ? `§a${r.message}` : `§c${r.error}`);
      }
    });
    return;
  }

  if (["light_fixture", "sink", "toilet", "shower"].includes(node.type)) {
    form.button("Use");
    form.button("Toggle online");
    form.button("Close");
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
    form.button("Refuel +50");
    form.button("Toggle");
    form.button("Close");
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

  if (node.type === "water_plant" || node.type === "water_tower" || node.type === "reservoir" || node.type === "well_pump") {
    form.button("Refill +40");
    form.button("Toggle");
    form.button("Close");
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
    form.button("Link to me (billing)");
    form.button("Toggle");
    form.button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 2) return;
      if (res.selection === 0) {
        util.linkMeter(node.key, player.name);
        player.sendMessage("§aMeter linked for billing");
      }
      if (res.selection === 1) {
        const r = util.toggleNode(node.key);
        player.sendMessage(r.online ? "§aOn" : "§eOff");
      }
    });
    return;
  }

  
  if (node.type === "shutoff_valve") {
    const state = node.valveOpen !== false ? "OPEN" : "CLOSED";
    form.body(body + "\n§7Valve: §f" + state);
    form.button(node.valveOpen !== false ? "Close valve" : "Open valve");
    form.button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 1) return;
      const r = util.toggleValve(node.key);
      player.sendMessage(r.ok ? (r.valveOpen ? "§aValve open" : "§eValve closed") : `§c${r.error}`);
    });
    return;
  }

  if (node.type === "light_switch" || node.type === "circuit_breaker") {
    const state = node.switchOn !== false ? "CLOSED/ON" : "OPEN/OFF";
    form.body(body + "\n§7State: §f" + state);
    form.button(node.switchOn !== false ? "Turn OFF / open" : "Turn ON / close");
    form.button("Close");
    form.show(player).then((res) => {
      if (res.canceled || res.selection === 1) return;
      const r = util.toggleSwitch(node.key);
      player.sendMessage(r.ok
        ? (r.switchOn ? "§aON / closed" : "§eOFF / open")
        : `§c${r.error}`);
    });
    return;
  }

  // poles, transformers, panels, junctions
  form.button(node.broken ? "Replace fuse" : "Trip (test)");
  form.button("Toggle");
  form.button("Close");
  form.show(player).then((res) => {
    if (res.canceled || res.selection === 2) return;
    if (res.selection === 0) {
      if (node.broken) {
        let used = false;
        try {
          const inv = player.getComponent("inventory")?.container;
          if (inv) {
            for (let i = 0; i < inv.size; i++) {
              const it = inv.getItem(i);
              if (it && it.typeId === "utilitycore:fuse") {
                if (it.amount <= 1) inv.setItem(i, undefined);
                else { it.amount -= 1; inv.setItem(i, it); }
                used = true;
                break;
              }
            }
          }
        } catch (e) {}
        if (!used) return player.sendMessage("§cNeed a fuse");
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
