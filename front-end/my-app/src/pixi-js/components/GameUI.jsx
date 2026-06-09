import { useEffect, useState, useRef } from "react";
import { network } from "../game/Network";
import { setForward,setBackward,setRight,setLeft,setBoost,setHandbrake,resetInputs } from "../game/Input";

export default function GameUI(){

    const isTouchDevice =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0;

    const [myReady, setMyReady]             = useState(false);
    const [countdownNum, setCountdownNum]   = useState(null);
    const [roundCountdownNum, setRoundCountdownNum]   = useState(null);
    const [gameScreen, setGameScreen]       = useState("waiting"); // waiting | countdown | playing | round_end | game_over
    const [playerList, setPlayerList]       = useState([]);
    const [myId, setMyId]                   = useState(null);
    const [hud, setHud]                     = useState(null);      // { round, timeLeft }
    const [notification, setNotification]   = useState(null);      // string
    const [fullScreenNote, setFullScreenNote] = useState(true);

    const countdownIntervalRef = useRef(null);

    function countDownTimer(gameScreen, seconds){
      clearInterval(countdownIntervalRef.current);

      const endAt =
        Date.now() + seconds * 1000;

      const update = () => {

        const remaining =
          Math.max(0,
            Math.ceil((endAt - Date.now()) / 1000)
          );

        if(gameScreen === "countdown") setCountdownNum(remaining);
        else setRoundCountdownNum(remaining);

        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      }

      update();

      countdownIntervalRef.current =
        setInterval(update, 100);
    }

    useEffect(()=>{
      //hide note of full screen
      setTimeout(() => {
        setFullScreenNote(false);
      }, 5000);

      const onInit = ({id}) => {
        setMyId(id);
      }

      const onCountDown = (seconds) => {
        setGameScreen("countdown");
        countDownTimer("countdown", seconds);
      }

      const onGameStart = () => {
        setGameScreen("playing");
      }

      const onRoundStart = (data) => {
        setGameScreen("playing");
        countDownTimer(null, data.timeLeft);
        setHud({ round: data.round, timeLeft: data.timeLeft });
        setNotification(`Round ${data.round}`);
        setPlayerList(data.players || []);
        setTimeout(() => setNotification(null), 2000);
      };

      const onRoundEnd = ({players, eleminated}) => {
        const isEleminated = eleminated?.some(id => id === myId);
        setGameScreen("round_end");
        resetInputs();
        setPlayerList(players || []);
        setNotification(`Round completed! You are ${isEleminated?'UN-SAFE':'SAFE'}, ready for next round`);
        setTimeout(() => setNotification(null), 3000);
      };

      const OnLobby = ({players, gameState})=>{
        setGameScreen(gameState);
        setPlayerList(players);
      }

      const onGameOver = ({players}) => {
        setGameScreen("game_over")
        resetInputs();
        setPlayerList(players);
      };

      const onGameReset = (data) => {
        setGameScreen("waiting");
        resetInputs();
        setMyReady(false);
        setHud(null);
        setNotification(null);
        setPlayerList(data.players || []);
      };

      network.on("init", onInit);
         
      network.on("countdown", onCountDown);

      network.on("game_start", onGameStart);

      network.on("round_start", onRoundStart);

      network.on("round_end", onRoundEnd);

      network.on("game_over", onGameOver);

      network.on("game_reset", onGameReset);

      network.on("lobby", OnLobby);

      return ()=>{
        network.off("init", onInit);
         
        network.off("countdown", onCountDown);

        network.off("game_start", onGameStart);

        network.off("round_start", onRoundStart);

        network.off("round_end", onRoundEnd);

        network.off("game_over", onGameOver);

        network.off("game_reset", onGameReset);

        network.off("lobby", OnLobby);
      }
    },[myId])

    async function toggleFullscreen() {

      try {

        // EXIT
        if (document.fullscreenElement) {

          await document.exitFullscreen();
          return;

        }

        // ENTER
        await document.documentElement.requestFullscreen();

        // LANDSCAPE LOCK
        if (screen.orientation?.lock) {
          await screen.orientation.lock("landscape");
        }

      } catch (err) {
        console.log(err);
      }
    }

    // ── Ready button handler ───────────────────────────────────────
    function handleReady() {
        network.sendReady();
        setMyReady(true);
    }

    // Countdown function

    return <>
        {/* ── Countdown ── */}
      {gameScreen === "countdown" && countdownNum !== null && (
        <div style={styles.overlayTransparent}>
          <div style={{ ...styles.bigNumber, color: "#00ff88" }}>
            {countdownNum}
          </div>
        </div>
      )}

      {/* ── Lobby / waiting screen ── */}
      {gameScreen === "waiting" && (
        <div style={styles.overlay}>
          <div style={styles.panel}>
            <div style={styles.title}>🏎 RACE ROYALE</div>
            <div style={{ color: "#aaa", marginBottom: 20, fontSize: 14 }}>
              Waiting for players...
            </div>
            <div style={{ marginBottom: 20 }}>
              {playerList.map(p => (
                <div key={p.id} style={styles.playerRow}>
                  <span style={{ color: p.id === myId ? "#00ff88" : "#ccc" }}>
                    {p.id === myId ? "You" : `Player ${p.id}`}
                  </span>
                  <span style={{ color: p.ready ? "#00ff88" : "#555" }}>
                    {p.ready ? "✓ Ready" : "waiting..."}
                  </span>
                </div>
              ))}
            </div>
            {!myReady ? (
              <button style={styles.btn} onClick={handleReady}>
                Ready Up
              </button>
            ) : (
              <div style={{ color: "#00ff88", fontSize: 14 }}>
                Waiting for others...
              </div>
            )}
            <div style={{ color: "#555", fontSize: 12, marginTop: 12 }}>
              Need at least 2 players all ready to start
            </div>
          </div>
        </div>
      )}

      {/* ── Player stats (bottom right) ── */}
      {gameScreen === "playing" && playerList.length > 0 && (
        <div style={{
          position:      "fixed",
          top:        16,
          right:         100,   // sit left of minimap
          zIndex:        100,
          pointerEvents: "none",
          fontFamily:    "monospace",
          fontSize:      13,
        }}>
          {playerList.map(p => (
            <div key={p.id} style={{
              display:        "flex",
              justifyContent: "space-between",
              gap:            24,
              padding:        "3px 10px",
              marginBottom:   3,
              borderRadius:   5,
              background:     p.id === myId
                ? "rgba(0,255,136,0.12)"
                : "rgba(0,0,0,0.45)",
              border:         p.id === myId
                ? "1px solid rgba(0,255,136,0.3)"
                : "1px solid rgba(255,255,255,0.06)",
              color:          p.status === "spectating" ? "#555" : "#ccc",
            }}>
              <span style={{ color: p.id === myId ? "#00ff88" : "inherit" }}>
                {p.id === myId ? "You" : `P${p.id}`}
              </span>
              <span style={{ color: "#f0c040" }}>
                {p.wins || 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── HUD (round + timer) ── */}
      {gameScreen === "playing" && hud && (
        <div style={styles.hud}>
          Round {hud.round} — {roundCountdownNum}s
        </div>
      )}

      {/* ── Round start & end brief notification ── */}
      {notification && gameScreen !== "game_over" && (
        <div style={{
          ...styles.notification,
          color: "#fff",
          borderColor: "#666",
        }}>
          {notification}
        </div>
      )}

      {/* ── Game over screen ── */}
      {gameScreen === "game_over" && (
        <div style={styles.overlay}>
          <div style={styles.panel}>
            <div style={{ fontSize: 22, fontWeight: "bold", color: "#fff", marginBottom: 16 }}>
              Final Results
            </div>

            <div style={{ width: "100%" }}>
              {[...(playerList || [])]
                .sort((a, b) => b.wins - a.wins)
                .map((p, i) => (
                  <div key={p.id} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    marginBottom: 4,
                    borderRadius: 6,
                    background: p.id === myId ? "rgba(0,255,136,0.08)" : "transparent",
                    border: p.id === myId ? "1px solid rgba(0,255,136,0.3)" : "1px solid rgba(255,255,255,0.05)",
                  }}>
                    <span style={{ color: "#555", width: 24 }}>#{i + 1}</span>
                    <span style={{ flex: 1, color: p.id === myId ? "#00ff88" : "#ccc" }}>
                      {p.id === myId ? "You" : `Player ${p.id}`}
                    </span>
                    <span style={{ color: "#FFD700" }}>{p.wins} wins</span>
                  </div>
                ))}
            </div>

            <div style={{ color: "#555", fontSize: 13, marginTop: 16 }}>
              Returning to lobby shortly...
            </div>
          </div>
        </div>
      )}
      {gameScreen === "playing" && isTouchDevice && (
        <div style={styles.controls}>

          {/* LEFT SIDE */}

          <div
            style={{ ...styles.controlBtn, ...styles.leftBtn }}
            
            onTouchStart={() => setLeft(true)}
            onTouchEnd={() => setLeft(false)}
            onTouchCancel={() => setLeft(false)}

            onMouseDown={() => setLeft(true)}
            onMouseUp={() => setLeft(false)}
          >
            ◀
          </div>

          <div
            style={{ ...styles.controlBtn, ...styles.rightBtn }}
            
            onTouchStart={() => setRight(true)}
            onTouchEnd={() => setRight(false)}
            onTouchCancel={() => setRight(false)}

            onMouseDown={() => setRight(true)}
            onMouseUp={() => setRight(false)}
          >
            ▶
          </div>

          <div
            style={{
              ...styles.controlBtn,
              ...styles.smallBtn,
              ...styles.boostBtn
            }}
            
            onTouchStart={() => setBoost(true)}
            onTouchEnd={() => setBoost(false)}
            onTouchCancel={() => setBoost(false)}

            onMouseDown={() => setBoost(true)}
            onMouseUp={() => setBoost(false)}
          >
            BOOST
          </div>

          {/* RIGHT SIDE */}

          <div
            style={{ ...styles.controlBtn, ...styles.forwardBtn }}
            
            onTouchStart={() => setForward(true)}
            onTouchEnd={() => setForward(false)}
            onTouchCancel={() => setForward(false)}

            onMouseDown={() => setForward(true)}
            onMouseUp={() => setForward(false)}
          >
            ▲
          </div>

          <div
            style={{
              ...styles.controlBtn,
              ...styles.smallBtn,
              ...styles.handbrakeBtn
            }}
            
            onTouchStart={() => setHandbrake(true)}
            onTouchEnd={() => setHandbrake(false)}
            onTouchCancel={() => setHandbrake(false)}

            onMouseDown={() => setHandbrake(true)}
            onMouseUp={() => setHandbrake(false)}
          >
            DRIFT
          </div>

          <div
            style={{ ...styles.controlBtn, ...styles.backwardBtn }}
            
            onTouchStart={() => setBackward(true)}
            onTouchEnd={() => setBackward(false)}
            onTouchCancel={() => setBackward(false)}

            onMouseDown={() => setBackward(true)}
            onMouseUp={() => setBackward(false)}
          >
            ▼
          </div>

        </div>
      )}
      {fullScreenNote && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "100%",
            height: "100vh",
            display: "flex",

            zIndex: 400,

            background: "rgba(0,0,0,0.72)",
            border: "1px solid #00ff88",
            borderRadius: 10,

            padding: "12px 18px",

            color: "#00ff88",
            fontFamily: "monospace",
            fontSize: 14,
            alignItems: "center",
            justifyContent: "center",

            pointerEvents: "none",
          }}
        >
          For best experience rotate device and use fullscreen button ⛶
        </div>
      )}
      {
        <button
          onClick={toggleFullscreen}
          style={{
            position: "fixed",
            top: 14,
            right: 14,
            zIndex: 500,

            width: 46,
            height: 46,

            border: "2px solid #00ff88",
            borderRadius: 10,

            background: "rgba(0,0,0,0.7)",
            color: "#00ff88",

            fontSize: 20,
            fontWeight: "bold",
            fontFamily: "monospace",

            cursor: "pointer",

            backdropFilter: "blur(4px)",
          }}
        >
          ⛶
        </button>
      }
    </>
}

const styles = {
  // EXISTING STYLES
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.78)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 200,
  },

  overlayTransparent: {
    position: "fixed", inset: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 200, pointerEvents: "none",
  },

  panel: {
    background: "rgba(10,10,24,0.97)",
    border: "2px solid #00ff88",
    borderRadius: 14,
    padding: "36px 48px",
    textAlign: "center",
    fontFamily: "monospace",
    color: "#fff",
    minWidth: 320,
  },

  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00ff88",
    marginBottom: 8,
  },

  playerRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "6px 0",
    borderBottom: "1px solid #1a1a2e",
    fontFamily: "monospace",
    fontSize: 14,
  },

  btn: {
    background: "#00ff88",
    color: "#000",
    border: "none",
    borderRadius: 8,
    padding: "10px 32px",
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "monospace",
    cursor: "pointer",
  },

  hud: {
    position: "fixed",
    top: 20,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.65)",
    color: "#00ff88",
    fontFamily: "monospace",
    fontSize: 22,
    fontWeight: "bold",
    padding: "8px 24px",
    borderRadius: 8,
    border: "2px solid #00ff88",
    pointerEvents: "none",
    zIndex: 100,
  },

  spectateBanner: {
    position: "fixed",
    bottom: 200,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.7)",
    color: "#aaa",
    fontFamily: "monospace",
    fontSize: 16,
    padding: "6px 20px",
    borderRadius: 6,
    border: "1px solid #444",
    pointerEvents: "none",
    zIndex: 100,
  },

  notification: {
    position: "fixed",
    top: "42%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "rgba(0,0,0,0.82)",
    fontFamily: "monospace",
    fontSize: 22,
    fontWeight: "bold",
    padding: "16px 36px",
    borderRadius: 10,
    border: "2px solid",
    pointerEvents: "none",
    zIndex: 150,
    textAlign: "center",
  },

  bigNumber: {
    fontSize: 120,
    fontWeight: "bold",
    fontFamily: "monospace",
    textShadow: "0 0 40px #00ff88",
  },

  // MOBILE TOUCH CONTROLS

  controls: {
    position: "fixed",
    inset: 0,
    zIndex: 120,
    pointerEvents: "none",
    touchAction: "none",
  },

  controlBtn: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.42)",
    border: "2px solid #00ff88",
    color: "#00ff88",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "monospace",
    fontWeight: "bold",
    fontSize: 15,
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "none",
    pointerEvents: "auto",
    backdropFilter: "blur(4px)",
  },

  smallBtn: {
    width: 35,
    height: 35,
    fontSize: 10,
  },

  // LEFT SIDE

  leftBtn: {
    bottom: 42,
    left: 26,
  },

  rightBtn: {
    bottom: 42,
    left: 136,
  },

  boostBtn: {
    bottom: 148,
    left: 90,
  },

  // RIGHT SIDE

  forwardBtn: {
    bottom: 150,
    right: 58,
  },

  handbrakeBtn: {
    bottom: 95,
    right: 172,
  },

  backwardBtn: {
    bottom: 36,
    right: 58,
  },
};