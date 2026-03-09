import { useEffect, useRef, useState } from 'react'

/**
 * BarcodeScanner — folosește camera și ZXing pentru a citi coduri de bare.
 * Căutare automată pe Open Food Facts (baza de date publică, gratuită).
 *
 * Props:
 *   onFound(foodData) — apelat cu { name, calories, protein, carbs, fat, barcode }
 *   onClose()        — apelat când userul închide
 */
export default function BarcodeScanner({ onFound, onClose }) {
  const videoRef   = useRef(null)
  const readerRef  = useRef(null)
  const streamRef  = useRef(null)

  const [status,   setStatus]   = useState('init')   // init | scanning | found | error | notfound
  const [product,  setProduct]  = useState(null)
  const [barcode,  setBarcode]  = useState('')
  const [manual,   setManual]   = useState('')
  const [showManual, setShowManual] = useState(false)

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

  async function startCamera() {
    try {
      // Importăm ZXing dinamic
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setStatus('scanning')

      // Scanare continuă
      const controls = await reader.decodeFromStream(stream, videoRef.current, (result, err) => {
        if (result) {
          const code = result.getText()
          controls.stop()
          handleBarcode(code)
        }
      })
    } catch (err) {
      console.error('Camera error:', err)
      if (err.name === 'NotAllowedError') {
        setStatus('error')
      } else {
        setStatus('error')
      }
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    if (readerRef.current) {
      try { readerRef.current.reset?.() } catch {}
    }
  }

  async function handleBarcode(code) {
    stopCamera()
    setBarcode(code)
    setStatus('searching')
    await searchProduct(code)
  }

  async function searchProduct(code) {
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${code}.json`
      )
      const json = await res.json()

      if (json.status === 0 || !json.product) {
        setStatus('notfound')
        return
      }

      const p = json.product
      const n = p.nutriments || {}

      // OpenFoodFacts poate returna valori per 100g sau per serving
      // Preferăm _100g
      const food = {
        barcode: code,
        name:     p.product_name || p.product_name_ro || p.product_name_en || `Produs ${code}`,
        brand:    p.brands || '',
        calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || (n['energy_100g'] || 0) / 4.184 || 0),
        protein:  Math.round((n.proteins_100g || n.proteins || 0) * 10) / 10,
        carbs:    Math.round((n.carbohydrates_100g || n.carbohydrates || 0) * 10) / 10,
        fat:      Math.round((n.fat_100g || n.fat || 0) * 10) / 10,
        fiber:    Math.round((n.fiber_100g || n.fiber || 0) * 10) / 10,
        serving:  p.serving_size || null,
      }

      setProduct(food)
      setStatus('found')
    } catch (err) {
      console.error('OpenFoodFacts error:', err)
      setStatus('notfound')
    }
  }

  async function handleManualSearch() {
    if (!manual.trim()) return
    stopCamera()
    setBarcode(manual.trim())
    setStatus('searching')
    await searchProduct(manual.trim())
  }

  function handleUse() {
    if (product) {
      onFound(product)
    }
  }

  function retry() {
    setStatus('init')
    setProduct(null)
    setBarcode('')
    setShowManual(false)
    startCamera()
  }

  return (
    <div className="space-y-3">

      {/* Camera viewport */}
      {(status === 'init' || status === 'scanning') && (
        <div className="relative rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '4/3' }}>
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />

          {/* Scanning overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-56 h-40">
              {/* Corners */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-brand-green rounded-tl-sm" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-brand-green rounded-tr-sm" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-brand-green rounded-bl-sm" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-brand-green rounded-br-sm" />
              {/* Scan line */}
              <div className="absolute inset-x-2 h-0.5 bg-brand-green/60 animate-bounce" style={{ top: '50%' }} />
            </div>
          </div>

          {status === 'scanning' && (
            <div className="absolute bottom-3 inset-x-0 text-center">
              <span className="text-xs text-white/80 bg-black/50 px-3 py-1 rounded-full">
                📸 Îndreaptă camera spre codul de bare
              </span>
            </div>
          )}
        </div>
      )}

      {/* Searching */}
      {status === 'searching' && (
        <div className="bg-dark-700 rounded-xl p-8 text-center space-y-3">
          <div className="text-3xl animate-pulse">🔍</div>
          <p className="text-white text-sm font-medium">Caut produsul...</p>
          <p className="text-slate-500 text-xs font-mono">{barcode}</p>
        </div>
      )}

      {/* Found */}
      {status === 'found' && product && (
        <div className="space-y-3">
          <div className="bg-brand-green/10 border border-brand-green/30 rounded-xl p-4 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-2xl">✅</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm leading-tight">{product.name}</p>
                {product.brand && <p className="text-slate-400 text-xs mt-0.5">{product.brand}</p>}
                <p className="text-slate-500 text-xs mt-0.5 font-mono">{barcode}</p>
              </div>
            </div>

            {/* Macros per 100g */}
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-dark-600">
              {[
                { label: 'Kcal',     value: product.calories, color: 'text-brand-green' },
                { label: 'Proteine', value: `${product.protein}g`, color: 'text-brand-blue' },
                { label: 'Carbo',    value: `${product.carbs}g`,   color: 'text-brand-orange' },
                { label: 'Grăsimi', value: `${product.fat}g`,     color: 'text-purple-400' },
              ].map(m => (
                <div key={m.label} className="text-center">
                  <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-[10px] text-slate-500">{m.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 text-center">per 100g · sursa: Open Food Facts</p>
          </div>

          <div className="flex gap-2">
            <button onClick={retry} className="btn-ghost flex-1 py-2.5 text-sm">🔄 Scanează alt cod</button>
            <button onClick={handleUse} className="btn-primary flex-1 py-2.5 text-sm">✓ Folosește</button>
          </div>
        </div>
      )}

      {/* Not found */}
      {status === 'notfound' && (
        <div className="bg-dark-700 rounded-xl p-6 text-center space-y-3">
          <p className="text-3xl">😕</p>
          <p className="text-white text-sm font-medium">Produs negăsit</p>
          <p className="text-slate-400 text-xs">Codul <span className="font-mono text-brand-orange">{barcode}</span> nu există în baza de date Open Food Facts.</p>
          <div className="flex gap-2 pt-1">
            <button onClick={retry} className="btn-ghost flex-1 py-2 text-sm">🔄 Încearcă din nou</button>
            <button onClick={() => { onClose(); }} className="btn-primary flex-1 py-2 text-sm">✏️ Adaugă manual</button>
          </div>
        </div>
      )}

      {/* Camera error */}
      {status === 'error' && (
        <div className="bg-dark-700 rounded-xl p-6 text-center space-y-3">
          <p className="text-3xl">📷</p>
          <p className="text-white text-sm font-medium">Camera nu e disponibilă</p>
          <p className="text-slate-400 text-xs">Permite accesul la cameră din setările browser-ului sau introdu codul manual.</p>
        </div>
      )}

      {/* Manual barcode input (always available) */}
      {(status === 'scanning' || status === 'error' || status === 'notfound') && (
        <div>
          {!showManual ? (
            <button onClick={() => setShowManual(true)}
              className="w-full text-xs text-slate-500 hover:text-slate-300 py-1 transition-colors">
              ⌨️ Introdu codul manual
            </button>
          ) : (
            <div className="flex gap-2">
              <input className="input flex-1 font-mono text-sm" placeholder="ex: 5941058001215"
                value={manual} onChange={e => setManual(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualSearch()} />
              <button onClick={handleManualSearch} disabled={!manual.trim()}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-40">Caută</button>
            </div>
          )}
        </div>
      )}

      {/* Close */}
      <button onClick={() => { stopCamera(); onClose() }}
        className="w-full btn-ghost py-2 text-sm text-slate-500">
        ✕ Închide
      </button>
    </div>
  )
}
