import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const today = new Date().toISOString().split('T')[0]

export default function Profil({ session }) {
  const [weights, setWeights] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ date: today, weight_kg: '' })
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => { loadWeights() }, [])

  async function loadWeights() {
    setLoading(true)
    const { data } = await supabase.from('weight_logs').select('*')
      .eq('user_id', session.user.id).order('date', { ascending: false }).limit(60)
    setWeights(data || [])
    setLoading(false)
  }

  async function saveWeight() {
    if (!form.weight_kg) return
    await supabase.from('weight_logs').insert({
      user_id: session.user.id, date: form.date, weight_kg: parseFloat(form.weight_kg)
    })
    setShowModal(false)
    setForm({ date: today, weight_kg: '' })
    loadWeights()
  }

  async function deleteWeight(id) {
    await supabase.from('weight_logs').delete().eq('id', id)
    loadWeights()
  }

  async function signOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
  }

  const chartData = [...weights].reverse().map(w => ({
    date: new Date(w.date).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }),
    kg: w.weight_kg
  }))

  const latest = weights[0]?.weight_kg
  const oldest = weights[weights.length - 1]?.weight_kg
  const change = latest && oldest ? (latest - oldest).toFixed(1) : null

  return (
    <div className="page fade-in">
      <h1 className="text-2xl font-bold text-white mb-4">👤 Profil</h1>

      {/* Account card */}
      <div className="card mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-purple/30 to-brand-blue/30 flex items-center justify-center border border-brand-purple/20">
            <span className="text-xl">👤</span>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-white text-sm">{session.user.email}</p>
            <p className="text-xs text-slate-400">Cont activ</p>
          </div>
        </div>
      </div>

      {/* Weight section */}
      <div className="card mb-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">⚖️ Greutate corporală</h2>
          <button onClick={() => setShowModal(true)} className="text-xs bg-brand-green/20 text-brand-green px-2.5 py-1 rounded-lg hover:bg-brand-green/30 transition-colors">
            + Adaugă
          </button>
        </div>

        {/* Stats */}
        {weights.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-dark-700 rounded-xl p-2 text-center">
              <p className="text-lg font-bold text-white">{latest} kg</p>
              <p className="text-xs text-slate-500">Curent</p>
            </div>
            <div className="bg-dark-700 rounded-xl p-2 text-center">
              <p className="text-lg font-bold text-white">{Math.min(...weights.map(w => w.weight_kg))} kg</p>
              <p className="text-xs text-slate-500">Minim</p>
            </div>
            <div className="bg-dark-700 rounded-xl p-2 text-center">
              <p className={`text-lg font-bold ${change > 0 ? 'text-red-400' : change < 0 ? 'text-brand-green' : 'text-slate-300'}`}>
                {change !== null ? `${change > 0 ? '+' : ''}${change} kg` : '—'}
              </p>
              <p className="text-xs text-slate-500">Schimbare</p>
            </div>
          </div>
        )}

        {/* Chart */}
        {chartData.length > 1 && (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e2e42" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a24', border: '1px solid #2e2e42', borderRadius: 12, color: '#f1f5f9', fontSize: 12 }} />
              <Line type="monotone" dataKey="kg" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3 }} name="kg" />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* History */}
        {!loading && weights.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-4">Nicio înregistrare. Adaugă prima greutate!</p>
        ) : (
          <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
            {weights.map(w => (
              <div key={w.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2">
                <div>
                  <span className="text-sm font-semibold text-white">{w.weight_kg} kg</span>
                  <span className="text-xs text-slate-400 ml-2">📅 {new Date(w.date).toLocaleDateString('ro-RO')}</span>
                </div>
                <button onClick={() => deleteWeight(w.id)} className="text-slate-600 hover:text-red-400 transition-colors">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* App info */}
      <div className="card mb-3">
        <h2 className="text-sm font-semibold text-white mb-2">📱 Despre aplicație</h2>
        <p className="text-xs text-slate-400">FitTracker v1.0 · Construită cu React + Supabase</p>
        <p className="text-xs text-slate-500 mt-1">Instalează aplicația: apasă "Adaugă la ecranul principal" din browser.</p>
      </div>

      {/* Sign out */}
      <button onClick={signOut} disabled={signingOut}
        className="w-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium py-3 rounded-xl hover:bg-red-500/20 transition-all text-sm">
        {signingOut ? 'Se deconectează...' : '→ Deconectare'}
      </button>

      {/* Weight modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Adaugă greutate">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Data</label>
            <input className="input" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Greutate (kg)</label>
            <input className="input" type="number" step="0.1" placeholder="75.5" value={form.weight_kg}
              onChange={e => setForm(p => ({ ...p, weight_kg: e.target.value }))} />
          </div>
          <button onClick={saveWeight} className="btn-primary w-full py-3">Salvează</button>
        </div>
      </Modal>
    </div>
  )
}
