import { simulatePlayer } from "./Physics";

export class Reconciler {
  constructor() {
    this.seq               = 0;
    this.lastReconciledSeq = 0;
    this.pendingInputs = [];
  }

  reset(){
    this.pendingInputs = [];
  }


  getSeq() {
    this.seq++;
    return this.seq;
  }

  recordInput(seq, input) {
    this.pendingInputs.push({
      seq,
      input
    });
  }

  reconcile(player, serverState) {
    const FIXED_DT = 1/60;
    // Ignore old snapshots
    if (serverState.seq <= this.lastReconciledSeq) {
      return;
    }

    this.lastReconciledSeq = serverState.seq;

    // STEP 1:
    // Apply exact authoritative state

    player.x = serverState.x;
    player.y = serverState.y;
    player.vx = serverState.vx;
    player.vy = serverState.vy;
    player.rotation = serverState.rotation;

    // STEP 2:
    // Remove acknowledged inputs

    this.pendingInputs =
      this.pendingInputs.filter(
        frame => frame.seq > serverState.seq
      );

    // STEP 3:
    // Replay remaining pending inputs
    
    for (const frame of this.pendingInputs) {
      simulatePlayer(
        player,
        FIXED_DT,
        frame.input
      );
    }
  }
}
