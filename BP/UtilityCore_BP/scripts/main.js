import { system, world } from "@minecraft/server";
import { UtilityManager } from "./core/UtilityManager.js";
import { setupUIHandlers } from "./ui/handlers.js";

export const util = new UtilityManager();

const COMPONENTS = [
  "utilitycore:generator_diesel",
  "utilitycore:generator_solar",
  "utilitycore:power_pole",
  "utilitycore:transformer",
  "utilitycore:breaker_panel",
  "utilitycore:electric_meter",
  "utilitycore:outlet",
  "utilitycore:light_fixture",
  "utilitycore:water_plant",
  "utilitycore:water_tower",
  "utilitycore:pipe_junction",
  "utilitycore:water_meter",
  "utilitycore:sink",
  "utilitycore:toilet",
  "utilitycore:shower",
  "utilitycore:utility_desk",
  "utilitycore:id_kiosk",
  "utilitycore:insurance_desk"
];

system.beforeEvents.startup.subscribe((event) => {
  const reg = event.blockComponentRegistry;
  for (const id of COMPONENTS) {
    reg.registerCustomComponent(id, { onPlayerInteract() {} });
  }
  console.log("[UtilityCore] Components registered");
});

world.afterEvents.worldLoad.subscribe(() => {
  util.load();
  setupUIHandlers(util);
  console.log("[UtilityCore] Power + water + home + ID + insurance ready");
});

system.runInterval(() => {
  util.tick();
}, 20);

console.log("[UtilityCore] Script started");
