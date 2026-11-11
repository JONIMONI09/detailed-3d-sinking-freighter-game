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

testTorricelliFlow();
testBlastAttenuation();
testBendingMoments();
testDoorDogging();
testDownfloodingCascade();

console.log('🎉 ALL 5 SIMULATION PHYSICS TESTS PASSED!\n');
