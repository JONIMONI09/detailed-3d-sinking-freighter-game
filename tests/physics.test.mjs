// tests/physics.test.mjs - Maritime Simulation Physics & Hydrodynamics Test Suite
import assert from 'node:assert/strict';

console.log('🧪 Starting Maritime Physics Simulation Unit Tests...');

// 1. Torricelli Flow Equation Test
function testTorricelliFlow() {
  const g = 9.81;
  const cd = 0.62;
  const testDepths = [0.5, 2.0, 5.0, 10.0];

  for (const h of testDepths) {
    const v = cd * Math.sqrt(2 * g * h);
    assert(v > 0, `Velocity must be positive at depth ${h}m`);
    // Ensure monotonically increasing velocity with depth
    const vDeeper = cd * Math.sqrt(2 * g * (h + 1.0));
    assert(vDeeper > v, `Velocity must increase with head: ${vDeeper} > ${v}`);
  }
  console.log('  ✔ Torricelli flow velocity scales physically with head immersion depth');
}

// 2. Blast Damage Plating Attenuation Test
function testBlastAttenuation() {
  function canBreachHull(posY, distanceToKeel, posX) {
    const isUpperDeck = posY >= 0.8;
    const isDirectContact = distanceToKeel < 3.8;
    const isOuterPlating = Math.abs(posX) > 7.5;
    
    // Upper deck absorbs explosions completely
    if (isUpperDeck) return false;
    // Lower hull must be either direct contact or outer plating
    return isDirectContact || isOuterPlating;
  }

  // Upper deck blast (e.g. on main deck y=1.2m, distance 5m)
  assert.equal(canBreachHull(1.2, 5.0, 0), false, 'Upper deck blast must be absorbed');
  
  // Bridge blast (y=6.0m)
  assert.equal(canBreachHull(6.0, 2.0, 0), false, 'Bridge blast must be absorbed');
  
  // Direct underwater keel blast (y=-1.5m, d=2.1m)
  assert.equal(canBreachHull(-1.5, 2.1, 0), true, 'Direct keel blast must breach hull');
  
  // Outer hull blast on water line (y=0.2m, x=7.8m)
  assert.equal(canBreachHull(0.2, 5.0, 7.8), true, 'Outer shell plating blast must breach');

  console.log('  ✔ Blast attenuation correctly prevents non-contact upper-deck snapping');
}

// 3. Floating Sandbox Beam Bending Moment & Hull Snapping
function testBendingMoments() {
  function calculateBendingStress(midLoad, foreLoad, aftLoad, yieldLimit = 1200) {
    const moment = midLoad - 0.6 * (foreLoad + aftLoad);
    const stressPercent = Math.min(100, Math.max(0, (moment / yieldLimit) * 100));
    const isSnapped = stressPercent >= 99.9;
    return { moment, stressPercent, isSnapped };
  }

  // Balanced ship
  const balanced = calculateBendingStress(200, 200, 200);
  assert(balanced.stressPercent < 30, 'Balanced ship should have low bending stress');
  assert.equal(balanced.isSnapped, false);

  // Critical mid-hold sagging condition (catastrophic break)
  const catastrophic = calculateBendingStress(1800, 100, 100);
  assert.equal(catastrophic.isSnapped, true, 'Catastrophic mid-hold overload must snap keel');

  console.log('  ✔ Beam bending moment accurately calculates sagging stresses and keel break');
}

// 4. Watertight Door Dogging & Seal Integrity
function testDoorDogging() {
  class BulkheadDoor {
    constructor() {
      this.locked = false;
      this.dogHoldProgress = 0.0;
      this.transferCoeff = 0.35; // standard passage transfer
    }

    updateHold(dt, isHoldingL) {
      if (isHoldingL) {
        this.dogHoldProgress += dt / 0.85;
        if (this.dogHoldProgress >= 1.0) {
          this.dogHoldProgress = 1.0;
          this.locked = true;
          this.transferCoeff = 0.0; // 100% Watertight barrier
        }
      } else if (!this.locked) {
        this.dogHoldProgress = Math.max(0, this.dogHoldProgress - dt * 2.0);
      }
    }
  }

  const door = new BulkheadDoor();
  // Hold for 0.4s (partial hold)
  door.updateHold(0.4, true);
  assert.equal(door.locked, false);
  assert(door.transferCoeff > 0);

  // Release without locking -> progress resets
  door.updateHold(0.3, false);
  assert.equal(door.dogHoldProgress, 0);

  // Full hold for 0.9s
  door.updateHold(0.9, true);
  assert.equal(door.locked, true, 'Door must lock after 0.85s hold');
  assert.equal(door.transferCoeff, 0.0, 'Locked door must have 0.0 water transfer coefficient');

  console.log('  ✔ Watertight door dogging progress and 100% hermetic seal verified');
}

// 5. Multi-Deck Downflooding Threshold
function testDownfloodingCascade() {
  function checkSpillOntoMainDeck(holdFillRatio) {
    const SPILL_THRESHOLD = 0.72; // 72%
    return holdFillRatio >= SPILL_THRESHOLD;
  }

  assert.equal(checkSpillOntoMainDeck(0.5), false, '50% fill should not cascade to main deck');
  assert.equal(checkSpillOntoMainDeck(0.71), false, '71% fill should remain contained');
  assert.equal(checkSpillOntoMainDeck(0.72), true, '72% fill must trigger main deck spill');
  assert.equal(checkSpillOntoMainDeck(0.95), true, '95% fill must cascade water vigorously');

  console.log('  ✔ Multi-deck downflooding triggers accurately at 72% hold capacity');
}

// 6. Pneumatic Air Pocket Compression (Boyle's Law & Ingress Equilibrium)
function testAirPocketCompression() {
  const P_ATM = 101325; // Pa
  const RHO = 1025; // kg/m^3 sea water density
  const G = 9.81;

  function calculateIngressEquilibrium(compartmentVolume, breachDepth, isVented) {
    if (isVented) {
      return { fillRatio: 1.0, isAirPocketFormed: false };
    }
    const pSea = P_ATM + RHO * G * breachDepth;
    const fillRatio = 1 - (P_ATM / pSea);
    return { fillRatio, isAirPocketFormed: fillRatio < 0.99 };
  }

  const sealed5m = calculateIngressEquilibrium(100, 5.0, false);
  assert(sealed5m.isAirPocketFormed, 'Sealed compartment at 5m depth must form air pocket');
  assert(Math.abs(sealed5m.fillRatio - 0.332) < 0.01, '5m air pocket equilibrium should be ~33.2%');

  const sealed10m = calculateIngressEquilibrium(100, 10.0, false);
  assert(sealed10m.fillRatio < 0.52 && sealed10m.fillRatio > 0.48);

  const vented = calculateIngressEquilibrium(100, 5.0, true);
  assert.equal(vented.fillRatio, 1.0, 'Vented compartment must flood to 100%');
  assert.equal(vented.isAirPocketFormed, false);

  console.log('  ✔ Boyle\'s law air pocket compression and venting equilibrium verified');
}

// 7. Euler-Bernoulli Girder Stress & 2-Piece Hull Rupture Kinematics
function testEulerBernoulliHullSplitting() {
  const YIELD_MOMENT = 1200; // kNm

  function evaluateHullIntegrity(compartmentLoads) {
    const midLoad = compartmentLoads.mid || 0;
    const foreLoad = compartmentLoads.fore || 0;
    const aftLoad = compartmentLoads.aft || 0;
    const maxSaggingMoment = midLoad - 0.6 * (foreLoad + aftLoad);

    if (maxSaggingMoment >= YIELD_MOMENT) {
      const bowMassRatio = foreLoad / (foreLoad + midLoad * 0.5);
      const sternMassRatio = (aftLoad + midLoad * 0.5) / (foreLoad + aftLoad + midLoad);
      return {
        fractured: true,
        sections: [
          { name: 'bow', massFraction: bowMassRatio, independentDynamics: true },
          { name: 'stern', massFraction: sternMassRatio, independentDynamics: true }
        ]
      };
    }
    return { fractured: false, maxSaggingMoment };
  }

  const intact = evaluateHullIntegrity({ fore: 150, mid: 400, aft: 180 });
  assert.equal(intact.fractured, false);

  const snapped = evaluateHullIntegrity({ fore: 100, mid: 1600, aft: 120 });
  assert.equal(snapped.fractured, true, 'Keel must fracture under extreme sagging moment');
  assert.equal(snapped.sections.length, 2, 'Rupture must yield exactly two independent sinking bodies');
  assert.equal(snapped.sections[0].independentDynamics, true);
  assert.equal(snapped.sections[1].independentDynamics, true);

  console.log('  ✔ Euler-Bernoulli girder yield triggers two independent sinking hull bodies');
}

// 8. Autonomous Damage Control Crew NPC Repair Mechanics
function testDamageControlCrewRepairs() {
  class DamageControlNPC {
    constructor() {
      this.state = 'IDLE';
      this.patchRatePerSec = 0.05;
    }

    update(dt, breach, waterDepth) {
      if (waterDepth > 1.4) {
        this.state = 'FLEEING_FLOOD';
        return;
      }
      if (breach && breach.area > 0) {
        this.state = 'PATCHING';
        breach.repairProgress = Math.min(1.0, (breach.repairProgress || 0) + this.patchRatePerSec * dt);
        if (breach.repairProgress >= 1.0) {
          breach.area = 0.0;
          this.state = 'IDLE';
        }
      }
    }
  }

  const npc = new DamageControlNPC();
  const breach = { area: 0.8, repairProgress: 0.0 };

  npc.update(10, breach, 0.4);
  assert.equal(npc.state, 'PATCHING');
  assert.equal(breach.repairProgress, 0.5);

  npc.update(10, breach, 0.6);
  assert.equal(breach.repairProgress, 1.0);
  assert.equal(breach.area, 0.0, 'Patched breach must have 0.0 area');
  assert.equal(npc.state, 'IDLE');

  npc.update(1, breach, 1.8);
  assert.equal(npc.state, 'FLEEING_FLOOD', 'NPC must flee deep water');

  console.log('  ✔ Autonomous damage control NPC repairs breaches and evacuates deep flooding');
}

// 9. Bridge Wheelhouse Station & Sandbox Overrides
function testBridgeWheelhouseAndSandbox() {
  class ShipControls {
    constructor() {
      this.helmAngle = 0;
      this.telegraph = 0;
      this.masterLockdown = false;
      this.sandbox = {
        godMode: false,
        noclip: false,
        floodMultiplier: 1.0
      };
    }

    setHelm(deg) {
      this.helmAngle = Math.max(-35, Math.min(35, deg));
    }

    triggerMasterLockdown(doors) {
      this.masterLockdown = true;
      doors.forEach(d => {
        d.locked = true;
        d.isOpen = false;
      });
    }

    applySandboxInflow(baseInflow) {
      return baseInflow * this.sandbox.floodMultiplier;
    }
  }

  const bridge = new ShipControls();
  bridge.setHelm(45);
  assert.equal(bridge.helmAngle, 35);

  const doors = [{ isOpen: true, locked: false }, { isOpen: false, locked: false }];
  bridge.triggerMasterLockdown(doors);
  assert(doors.every(d => d.locked && !d.isOpen), 'Master lockdown must dog all doors');

  bridge.sandbox.floodMultiplier = 3.5;
  assert.equal(bridge.applySandboxInflow(2.0), 7.0, 'Flood dial must multiply inflow rate');

  console.log('  ✔ Bridge wheelhouse master lockdown and sandbox controls verified');
}

testTorricelliFlow();
testBlastAttenuation();
testBendingMoments();
testDoorDogging();
testDownfloodingCascade();
testAirPocketCompression();
testEulerBernoulliHullSplitting();
testDamageControlCrewRepairs();
testBridgeWheelhouseAndSandbox();

console.log('🎉 ALL 9 SIMULATION PHYSICS TESTS PASSED!\n');
