import { system, world } from "@minecraft/server";
import { UtilityManager } from "./core/UtilityManager.js";
import { setupUIHandlers } from "./ui/handlers.js";

export const util = new UtilityManager();

const COMPONENTS = [
  "utilitycore:generator_diesel", "utilitycore:generator_solar", "utilitycore:generator_large",
  "utilitycore:power_pole", "utilitycore:power_line", "utilitycore:conduit",
  "utilitycore:transformer", "utilitycore:substation",
  "utilitycore:neighborhood_room", "utilitycore:building_room",
  "utilitycore:breaker_panel", "utilitycore:circuit_breaker", "utilitycore:electric_meter",
  "utilitycore:outlet", "utilitycore:light_switch", "utilitycore:light_fixture",
  "utilitycore:fridge", "utilitycore:stove", "utilitycore:microwave", "utilitycore:dishwasher",
  "utilitycore:washer", "utilitycore:dryer", "utilitycore:tv", "utilitycore:router",
  "utilitycore:ac_unit", "utilitycore:furnace", "utilitycore:ceiling_fan",
  "utilitycore:reservoir", "utilitycore:well_pump", "utilitycore:water_plant", "utilitycore:water_tower",
  "utilitycore:water_main", "utilitycore:pipe_junction", "utilitycore:pump_station",
  "utilitycore:plumbing_room", "utilitycore:shutoff_valve", "utilitycore:water_meter",
  "utilitycore:water_heater", "utilitycore:branch_pipe",
  "utilitycore:sink", "utilitycore:toilet", "utilitycore:shower",
  "utilitycore:utility_desk", "utilitycore:id_kiosk", "utilitycore:insurance_desk"
];

system.beforeEvents.startup.subscribe((event) => {
  const reg = event.blockComponentRegistry;
  for (const id of COMPONENTS) {
    try { reg.registerCustomComponent(id, { onPlayerInteract() {} }); }
    catch (e) { console.warn("[UtilityCore] component", id, e); }
  }
  console.log(`[UtilityCore] ${COMPONENTS.length} components registered`);
});

world.afterEvents.worldLoad.subscribe(() => {
  util.load();
  setupUIHandlers(util);
  console.log("[UtilityCore] Ready");
});

system.runInterval(() => { util.tick(); }, 20);
console.log("[UtilityCore] Script started");
