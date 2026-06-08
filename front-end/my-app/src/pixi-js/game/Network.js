const SERVER_URL    = "ws://localhost:3001";
const SEND_RATE     = 20;
const SEND_INTERVAL = 1000 / SEND_RATE;

class Network {

  constructor() {

    this.ws        = null;
    this.myId      = null;
    this.connected = false;

    this.listeners = {};

    this._pendingFrames = [];
    this._sendTimer     = null;
  }

  // ─────────────────────────────────────────────
  // Event System
  // ─────────────────────────────────────────────

  on(event, callback) {

    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    this.listeners[event].push(callback);
  }

  off(event, callback) {

    const list = this.listeners[event];

    if (!list) return;

    this.listeners[event] =
      list.filter(cb => cb !== callback);
  }

  emit(event, data) {

    const list = this.listeners[event];

    if (!list) return;

    for (const cb of list) {
      cb(data);
    }
  }

  // ─────────────────────────────────────────────
  // Connection
  // ─────────────────────────────────────────────

  connect() {

    this.ws = new WebSocket(SERVER_URL);

    this.ws.onopen = () => {

      this.connected = true;

      console.log("[Network] connected");

      this._startSendLoop();
    };

    this.ws.onmessage = (event) => {

      const msg = JSON.parse(event.data);

      switch (msg.type) {

        case "init":

          this.myId = msg.id;

          this.emit("init", {
            id: msg.id,
            state: msg.state,
            worldObjects: msg.worldObjects,
          });

          break;

        case "snapshot":

          this.emit("snapshot", msg.snapshot);

          break;

        case "leave":

          this.emit("leave", msg.id);

          break;

        case "full":

          this.emit("full");

          break;

        case "ping":

          this._sendPong();

          break;

        case "ready_ack":

          this.emit("ready_ack");

          break;

        case "countdown":

          this.emit("countdown", msg.seconds);

          break;

        case "countdown_cancelled":

          this.emit("countdown_cancelled");

          break;

        case "game_start":

          this.emit("game_start", msg.spawns);

          break;

        case "lobby":

          this.emit("lobby", msg);

          break;

        case "round_start":

          this.emit("round_start", msg);

          break;

        case "round_end":

          this.emit("round_end", msg);

          break;

        case "game_over":

          this.emit("game_over", msg);

          break;

        case "game_reset":

          this.emit("game_reset", msg);

          break;
      }
    };

    this.ws.onclose = () => {

      this.connected = false;

      this._stopSendLoop();

      console.log("[Network] disconnected");
    };

    this.ws.onerror = (e) => {

      console.error("[Network] error", e);
    };
  }

  // ─────────────────────────────────────────────
  // Inputs
  // ─────────────────────────────────────────────

  queueInput(seq, input) {

    this._pendingFrames.push({
      seq,
      input: { ...input }
    });
  }

  _startSendLoop() {

    this._sendTimer = setInterval(() => {

      if (
        !this.connected ||
        this._pendingFrames.length === 0
      ) {
        return;
      }

      this.ws.send(JSON.stringify({
        type: "inputs",
        frames: this._pendingFrames,
      }));

      this._pendingFrames = [];

    }, SEND_INTERVAL);
  }

  _stopSendLoop() {

    clearInterval(this._sendTimer);

    this._sendTimer = null;
  }

  // ─────────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────────

  _sendPong() {

    if (this.ws?.readyState === WebSocket.OPEN) {

      this.ws.send(JSON.stringify({
        type: "pong"
      }));
    }
  }

  sendReady() {

    if (this.ws?.readyState === WebSocket.OPEN) {

      this.ws.send(JSON.stringify({
        type: "ready"
      }));
    }
  }

  disconnect() {

    this._stopSendLoop();

    this.ws?.close();
  }
}

export const network = new Network();