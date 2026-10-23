# UtilityCore

One pack for **power**, **water**, **home fixtures**, **utility bills**, **government ID**, and **insurance**.

Bedrock **1.26+** · Beta APIs required.

## Features (v1.1.0)

### Hierarchical water
```
Reservoir / plant / well
  → Water mains · tower · junctions
    → Neighborhood pump station
      → Building plumbing room
        → Shutoff valve · meter · heater
          → Branch pipes → sink / toilet / shower
```
Closed shutoff = dry fixtures downstream. Heater in range = hot water on use.

### Hierarchical power
```
Large/Diesel/Solar gen
  → HV lines / poles / substation
    → Neighborhood power room
      → Building power room / panel
        → Circuit breaker
          → Conduit / outlets / light switches
            → Light fixtures (need switch ON nearby)
```

## Features (v1.0.0)

### Power
Diesel + solar generation, poles, transformers, breaker panels, electric meters, **outlets**, **lights**. Fuel, overload trips, fuses.

### Water
Treatment plant, water tower, pipe junctions, water meters, **sinks**, **toilets**, **showers**. Refill levels, pressure when supplied.

### Home
Use fixtures only when the matching grid is online and the block is in range (~24 power / ~20 water).

### Bills
Link meters to yourself → usage accumulates → **Utility desk / tablet** issue & pay bills.

### ID
**ID kiosk** issues a government ID item (required for insurance).

### Insurance
**Insurance desk** — home/tenant policies, claims (needs valid ID).

## Install

[UtilityCore-v1.0.0.mcaddon](https://github.com/blocklogic-studios/utilitycore/releases/download/v1.0.0/UtilityCore-v1.0.0.mcaddon)

## Quick start

1. Power: diesel/solar → poles → breaker → meter → outlet/light  
2. Water: plant/tower → pipes → meter → sink/toilet/shower  
3. Click each block once to register  
4. Link meters → tablet/desk for bills  
5. ID kiosk → insurance desk  

## Studio

Replaces separate PowerCore for new worlds (power is included here).  
Works alongside CarrierCore, FinanceCore, PostalCore.
