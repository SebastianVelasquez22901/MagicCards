import { useState, useRef } from 'react'
import './App.css'

const SUITS  = ['♠', '♥', '♦', '♣']
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

const GROUP_CFG = [
  { label: 'I',   color: '#5b9fff', glow: '91,159,255'  },
  { label: 'II',  color: '#ff5fa0', glow: '255,95,160'  },
  { label: 'III', color: '#ffc940', glow: '255,201,64'  },
]

// Solo múltiplos impares de 3: son los únicos donde el truco converge
const VALID_COUNTS = [9, 15, 21, 27, 33, 39, 45, 51]
const DEFAULT_N    = 21

// ── Lógica del truco ─────────────────────────────────────────────────────────
// Calcula cuántas vueltas son necesarias y en qué posición quedará la carta.
// La carta siempre termina en (n-1)/2 (el centro exacto del mazo).
function calcTrick(n) {
  const k = n / 3
  let lo = k, hi = 2 * k - 1, rounds = 1
  while (lo !== hi) {
    const nlo = k + Math.floor(lo / 3)
    const nhi = k + Math.floor(hi / 3)
    if (nlo === lo && nhi === hi) return null  // no converge (k par)
    lo = nlo; hi = nhi; rounds++
    if (rounds > 10) return null
  }
  return { rounds, position: lo }  // position = (n-1)/2
}

function buildDeck() {
  const deck = []
  for (const suit of SUITS)
    for (const value of VALUES)
      deck.push({ id: `${value}${suit}`, suit, value, isRed: suit === '♥' || suit === '♦' })
  return deck
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Reparte en 3 listas — aquí vive el algoritmo
function dealToColumns(deck) {
  const cols = [[], [], []]
  deck.forEach((card, i) => cols[i % 3].push(card))
  return cols
}

// La clave: la lista elegida queda sandwichada en el centro
function collectCards(columns, chosen) {
  const others = [0, 1, 2].filter(i => i !== chosen)
  return [...columns[others[0]], ...columns[chosen], ...columns[others[1]]]
}

// ── Config visual de los círculos (no afecta al algoritmo) ───────────────────
function getCircleConfig(n) {
  const k = n / 3
  const cardW = k <= 7 ? 40 : k <= 11 ? 36 : 32
  const cardH = k <= 7 ? 56 : k <= 11 ? 50 : 44
  const spacing = cardW + 4
  const radius  = Math.max(70, Math.ceil(k * spacing / (2 * Math.PI)))
  const diameter = (radius + Math.ceil(cardH / 2) + 8) * 2
  return { k, radius, cardW, cardH, diameter }
}

// ── Mensaje por vuelta ───────────────────────────────────────────────────────
function getRoundMsg(round, total) {
  if (round === 0)         return <>Piensa en tu carta. <strong>¿En qué círculo la ves?</strong></>
  if (round === total - 1) return <>Última vez. <strong>¿En cuál de los 3 círculos está tu carta?</strong></>
  return <>Las cartas se han reorganizado. <strong>¿En qué círculo está ahora?</strong></>
}

// ── Destellos ────────────────────────────────────────────────────────────────
function Sparkles() {
  const colors = ['#f5c842', '#fff', '#ff9f43', '#c8f5ff', '#ff5fa0', '#5b9fff']
  return (
    <div className="sparkles" aria-hidden>
      {Array.from({ length: 24 }, (_, i) => {
        const angle = (i / 24) * Math.PI * 2
        const dist  = 50 + (i % 4) * 24
        return (
          <span key={i} className="spark" style={{
            '--tx':    `${Math.cos(angle) * dist}px`,
            '--ty':    `${Math.sin(angle) * dist}px`,
            '--delay': `${i * 38}ms`,
            '--size':  `${3 + (i % 4) * 2}px`,
            '--color': colors[i % colors.length],
          }} />
        )
      })}
    </div>
  )
}

// ── Carta jugando (volteo 3-D) ───────────────────────────────────────────────
function PlayCard({ card, idx, flipped, highlight }) {
  return (
    <div
      className={`pc${flipped ? ' pc-flip' : ''}${highlight ? ' pc-glow' : ''}`}
      style={{ '--i': idx }}
    >
      <div className="pc-inner">
        <div className={`pc-face pc-front ${card.isRed ? 'red' : 'black'}`}>
          <span className="pc-corner pc-tl">{card.value}<br />{card.suit}</span>
          <span className="pc-center">{card.suit}</span>
          <span className="pc-corner pc-br">{card.value}<br />{card.suit}</span>
        </div>
        <div className="pc-face pc-back"><span className="pc-back-sym">✦</span></div>
      </div>
    </div>
  )
}

// ── Círculo de cartas ────────────────────────────────────────────────────────
// Visualmente: un anillo con las cartas distribuidas en el arco.
// Internamente: sigue siendo una lista plana — el algoritmo no cambia.
function CircleGroup({ cards, idx, flipped, dealKey, onPick, busy, cfg: { radius, cardW, cardH, diameter } }) {
  const grp = GROUP_CFG[idx]
  const N   = cards.length
  const sizeClass = cardW <= 32 ? 'cg-tiny' : cardW <= 36 ? 'cg-small' : ''

  return (
    <button
      className="circle-grp"
      style={{
        '--gc': grp.color, '--gcr': grp.glow,
        width: `${diameter}px`, height: `${diameter}px`,
      }}
      onClick={() => onPick(idx)}
      disabled={busy}
      aria-label={`Grupo ${grp.label}`}
    >
      <span className="cg-ring outer" />
      <span className="cg-ring inner" />
      <span className="cg-label">{grp.label}</span>

      {cards.map((card, i) => (
        <div
          key={`${card.id}-${dealKey}`}
          className={`cg-slot ${sizeClass}`}
          style={{
            '--angle':  (i / N) * 360,
            '--i':      i,
            '--radius': `${radius}px`,
            width:      `${cardW}px`,
            height:     `${cardH}px`,
            marginLeft: `-${cardW  / 2}px`,
            marginTop:  `-${cardH / 2}px`,
          }}
        >
          <PlayCard card={card} idx={i} flipped={flipped} highlight={false} />
        </div>
      ))}
    </button>
  )
}

// ── Selector de cartas ───────────────────────────────────────────────────────
function CardPicker({ value, onChange }) {
  const idx = VALID_COUNTS.indexOf(value)
  const trick = calcTrick(value)
  return (
    <div className="picker">
      <div className="picker-header">
        <span className="picker-label">Número de cartas</span>
        <span className="picker-value">{value}</span>
      </div>
      <input
        type="range"
        className="picker-range"
        min={0}
        max={VALID_COUNTS.length - 1}
        value={idx}
        onChange={e => onChange(VALID_COUNTS[+e.target.value])}
      />
      <div className="picker-ticks">
        {VALID_COUNTS.map(v => (
          <button
            key={v}
            className={`picker-tick${v === value ? ' active' : ''}`}
            onClick={() => onChange(v)}
          >
            {v}
          </button>
        ))}
      </div>
      <p className="picker-hint">
        {trick?.rounds} {trick?.rounds === 1 ? 'vuelta' : 'vueltas'} — carta en posición {trick?.position + 1} de {value}
      </p>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [phase,     setPhase]     = useState('start')
  const [numCards,  setNumCards]  = useState(DEFAULT_N)
  const [columns,   setColumns]   = useState([[], [], []])
  const [round,     setRound]     = useState(0)
  const [numRounds, setNumRounds] = useState(3)
  const [midPos,    setMidPos]    = useState(10)
  const [finalDeck, setFinalDeck] = useState([])
  const [revealed,  setRevealed]  = useState(false)
  const [flipped,   setFlipped]   = useState(false)
  const [dealKey,   setDealKey]   = useState(0)
  const [busy,      setBusy]      = useState(false)
  const [sparks,    setSparks]    = useState(false)
  const timers = useRef([])

  const startGame = (n = numCards) => {
    timers.current.forEach(clearTimeout)
    const trick = calcTrick(n)
    if (!trick) return
    const deck = shuffle(buildDeck()).slice(0, n)
    setColumns(dealToColumns(deck))
    setNumRounds(trick.rounds)
    setMidPos(trick.position)
    setRound(0)
    setFinalDeck([]); setRevealed(false)
    setFlipped(false); setDealKey(k => k + 1)
    setBusy(false); setSparks(false)
    setPhase('playing')
  }

  const pick = (ci) => {
    if (busy) return
    setBusy(true)
    setFlipped(true)
    const t1 = setTimeout(() => {
      const stacked = collectCards(columns, ci)
      if (round < numRounds - 1) {
        setColumns(dealToColumns(stacked))
        setRound(r => r + 1)
        setDealKey(k => k + 1)
        setFlipped(false)
        const t2 = setTimeout(() => setBusy(false), 600)
        timers.current.push(t2)
      } else {
        setFinalDeck(stacked)
        setPhase('done')
        setFlipped(false)
        setBusy(false)
      }
    }, 500)
    timers.current.push(t1)
  }

  const reveal = () => {
    setRevealed(true)
    setSparks(true)
    setTimeout(() => setSparks(false), 2200)
  }

  const circleCfg = getCircleConfig(numCards)

  // ── Inicio ─────────────────────────────────────────────────────────────────
  if (phase === 'start') return (
    <div className="app">
      <div className="bg-glow" />
      <h1 className="app-title">✦ 21 Cartas ✦</h1>
      <div className="start-wrap">
        <div className="demo-float">
          <div className="pc demo-pc">
            <div className="pc-inner">
              <div className="pc-face pc-front black">
                <span className="pc-corner pc-tl">?<br />✦</span>
                <span className="pc-center" style={{ fontSize: '1.4rem' }}>✦</span>
                <span className="pc-corner pc-br">?<br />✦</span>
              </div>
              <div className="pc-face pc-back"><span className="pc-back-sym">✦</span></div>
            </div>
          </div>
        </div>

        <p className="instr">Piensa en una carta. <strong>Yo la adivinaré.</strong></p>

        <CardPicker value={numCards} onChange={setNumCards} />

        <div className="rules-box">
          {[
            `Mira las ${numCards} cartas en 3 círculos y piensa en una`,
            `Dime en cuál de los 3 círculos está — ${calcTrick(numCards)?.rounds} veces`,
            'La magia revelará exactamente cuál es tu carta',
          ].map((txt, i) => (
            <div key={i} className="rule">
              <span className="rule-n">{i + 1}</span>{txt}
            </div>
          ))}
        </div>

        <button className="btn-gold" onClick={() => startGame(numCards)}>
          Comenzar el truco
        </button>
      </div>
    </div>
  )

  // ── Revelación ─────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const chosen = finalDeck[midPos]
    return (
      <div className="app">
        <div className="bg-glow" />
        {sparks && <Sparkles />}
        <h1 className="app-title">✦ 21 Cartas ✦</h1>
        <p className="app-sub">Aquí están todas las cartas…</p>

        <div className="reveal-board">
          {finalDeck.map((card, i) => (
            <PlayCard key={card.id} card={card} idx={i}
              flipped={i === midPos && !revealed}
              highlight={i === midPos && revealed}
            />
          ))}
        </div>

        {!revealed ? (
          <div className="reveal-cta">
            <p className="instr">Una carta está oculta… <strong>¿es la tuya?</strong></p>
            <button className="btn-gold pulse-glow" onClick={reveal}>✦ Revelar la carta ✦</button>
          </div>
        ) : (
          <div className="reveal-cta">
            <p className="reveal-msg">
              Tu carta es el{' '}
              <strong className={chosen.isRed ? 'reveal-red' : 'reveal-black'}>
                {chosen.value} {chosen.suit}
              </strong>
            </p>
            <div className="btn-row">
              <button className="btn-ghost" onClick={() => startGame(numCards)}>Jugar de nuevo</button>
              <button className="btn-ghost" onClick={() => setPhase('start')}>Cambiar cartas</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Jugando ────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="bg-glow" />
      <h1 className="app-title">✦ 21 Cartas ✦</h1>

      <div className="pips">
        {Array.from({ length: numRounds }, (_, i) => (
          <div key={i} className={`pip${i < round ? ' pip-done' : i === round ? ' pip-cur' : ''}`} />
        ))}
        <span className="pip-lbl">Vuelta {round + 1} / {numRounds}</span>
      </div>

      <p className="instr">{getRoundMsg(round, numRounds)}</p>

      <div className="groups">
        {columns.map((col, ci) => (
          <CircleGroup
            key={ci}
            cards={col}
            idx={ci}
            flipped={flipped}
            dealKey={dealKey}
            onPick={pick}
            busy={busy}
            cfg={circleCfg}
          />
        ))}
      </div>
    </div>
  )
}
