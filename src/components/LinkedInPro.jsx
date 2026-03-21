import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

/* ─────────────────────────────────────────────────────────────────────────────
   DESIGN TOKENS
───────────────────────────────────────────────────────────────────────────── */
const C = {
  bg: '#1a1a1a', card: '#242424',
  ivory: '#f5f0e8', ivoryMuted: '#b8b0a2', ivoryDim: '#8a8278',
  gold: '#C9A84C', goldLine: 'rgba(201,168,76,0.3)', goldBg: 'rgba(201,168,76,0.08)',
  danger: '#ef4444', success: '#4ade80', info: '#60a5fa',
  bd: 'rgba(255,255,255,0.08)', bdGold: 'rgba(201,168,76,0.3)',
  inputBg: '#1a1a1a',
}
const FONT_SERIF = "'Cormorant Garamond', 'Playfair Display', Georgia, serif"
const FONT_SANS = "'DM Sans', system-ui, sans-serif"

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
const THEMES = [
  { value: 'marche', label: 'Marchés financiers' },
  { value: 'patrimoine', label: 'Patrimoine' },
  { value: 'immobilier', label: 'Immobilier' },
  { value: 'fiscalite', label: 'Fiscalité' },
]

const TONES = [
  { value: 'expert', label: 'Expert' },
  { value: 'pedagogique', label: 'Pédagogique' },
  { value: 'engageant', label: 'Engageant' },
]

const SYSTEM_PROMPT = `Tu es un Conseiller en Gestion de Patrimoine (CGP) senior chez Entasis Conseil qui rédige des posts LinkedIn professionnels.

RÈGLES STRICTES :
- Maximum 1 300 caractères (espaces compris)
- JAMAIS de promesse de rendement garanti
- JAMAIS mentionner de performance passée comme garantie future
- Conformité AMF : "Les performances passées ne préjugent pas des performances futures"
- Rappeler que tout investissement comporte un risque de perte en capital quand pertinent
- Pas de conseil personnalisé — rester dans l'information générale et la pédagogie
- Ton professionnel adapté au registre demandé
- Terminer par 3-5 hashtags pertinents (#GestionDePatrimoine #CGP #Investissement etc.)
- Structure : accroche forte (1 ligne), développement (3-5 paragraphes courts), CTA discret, hashtags
- Ajouter des emojis avec parcimonie (1-3 max)
- Écrire en français impeccable

SIGNATURE : ne pas signer le post, le nom apparaît automatiquement sur LinkedIn.`

/* ─────────────────────────────────────────────────────────────────────────────
   AI HELPER
───────────────────────────────────────────────────────────────────────────── */
async function callAI(system, userMsg) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, system, messages: [{ role: 'user', content: userMsg }] }),
  })
  const data = await res.json()
  return data.content?.[0]?.text || 'Erreur : pas de réponse'
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED UI
───────────────────────────────────────────────────────────────────────────── */
function PillSelect({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => {
        const active = value === o.value
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{
              padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: FONT_SANS, transition: 'all .15s',
              border: `1px solid ${active ? C.gold : C.bdGold}`,
              background: active ? C.gold : 'transparent',
              color: active ? '#1a1a1a' : C.ivoryMuted,
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Btn({ children, onClick, variant = 'gold', disabled, style: extra }) {
  const styles = {
    gold: { background: C.gold, color: '#1a1a1a', border: 'none' },
    outline: { background: 'transparent', color: C.gold, border: `1px solid ${C.bdGold}` },
    ghost: { background: 'transparent', color: C.ivoryMuted, border: `1px solid ${C.bd}` },
    danger: { background: 'transparent', color: C.danger, border: '1px solid rgba(239,68,68,0.3)' },
  }
  const s = styles[variant] || styles.gold
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...s, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: FONT_SANS, opacity: disabled ? 0.5 : 1, transition: 'all .15s', display: 'inline-flex', alignItems: 'center', gap: 6, ...extra }}>
      {children}
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════ */
export default function LinkedInPro({ profile }) {
  // Generator state
  const [theme, setTheme] = useState('patrimoine')
  const [context, setContext] = useState('')
  const [tone, setTone] = useState('expert')
  const [generatedPost, setGeneratedPost] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  // Saved posts
  const [posts, setPosts] = useState([])
  const [postsLoading, setPostsLoading] = useState(true)

  useEffect(() => { loadPosts() }, [])

  async function loadPosts() {
    setPostsLoading(true)
    const { data } = await supabase
      .from('linkedin_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setPosts(data || [])
    setPostsLoading(false)
  }

  const charCount = generatedPost.length

  async function handleGenerate() {
    setLoading(true)
    try {
      const themeName = THEMES.find(t => t.value === theme)?.label
      const toneName = TONES.find(t => t.value === tone)?.label
      const prompt = `Rédige un post LinkedIn sur le thème "${themeName}".
Ton : ${toneName}
${context ? `Contexte / angle souhaité : ${context}` : 'Pas de contexte spécifique — choisis un angle pertinent et actuel.'}

Rappel : 1300 caractères maximum, hashtags inclus.`
      const text = await callAI(SYSTEM_PROMPT, prompt)
      setGeneratedPost(text)
    } catch (e) {
      setGeneratedPost('Erreur : ' + e.message)
    }
    setLoading(false)
  }

  async function handleRegenerate() {
    await handleGenerate()
  }

  function handleCopy() {
    navigator.clipboard.writeText(generatedPost).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSave() {
    if (!generatedPost) return
    setSaving(true)
    const record = {
      theme,
      tone,
      content: generatedPost,
      context_input: context || null,
      conseiller_id: profile?.id || null,
      conseiller_name: profile?.full_name || profile?.email || 'Inconnu',
    }
    const { error } = await supabase.from('linkedin_posts').insert([record])
    if (error) {
      toast.error('Erreur sauvegarde : ' + error.message)
    } else {
      toast.success('Post sauvegardé')
      await loadPosts()
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('linkedin_posts').delete().eq('id', id)
    if (error) {
      toast.error('Erreur : ' + error.message)
    } else {
      setPosts(prev => prev.filter(p => p.id !== id))
      toast.success('Post supprimé')
    }
  }

  function handleCopyPost(content) {
    navigator.clipboard.writeText(content).catch(() => {})
    toast.success('Copié')
  }

  return (
    <div style={{ fontFamily: FONT_SANS }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap');
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: '55% 45%', gap: 20 }}>
        {/* ── LEFT PANEL: GENERATOR ────────────────────────────────── */}
        <div style={{ background: C.bg, border: `1px solid ${C.bdGold}`, borderRadius: 14, padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.gold, fontFamily: FONT_SERIF, marginBottom: 4 }}>Générateur de posts LinkedIn</div>
          <div style={{ fontSize: 12, color: C.ivoryDim, marginBottom: 20 }}>Créez du contenu conforme AMF pour votre audience patrimoniale</div>

          {/* Theme */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Thème</div>
            <PillSelect options={THEMES} value={theme} onChange={setTheme} />
          </div>

          {/* Context */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Contexte / angle (optionnel)</div>
            <textarea value={context} onChange={e => setContext(e.target.value)} rows={3}
              placeholder="Ex: La hausse des taux et son impact sur l'immobilier neuf…"
              style={{
                width: '100%', padding: '10px 14px', background: C.inputBg, border: `1px solid ${C.bdGold}`,
                borderRadius: 8, color: C.ivory, fontSize: 13, lineHeight: 1.6, fontFamily: FONT_SANS,
                resize: 'vertical', outline: 'none',
              }} />
          </div>

          {/* Tone */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, fontFamily: FONT_SANS }}>Ton</div>
            <PillSelect options={TONES} value={tone} onChange={setTone} />
          </div>

          {/* Generate */}
          <Btn onClick={handleGenerate} disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '12px 0', fontSize: 14 }}>
            {loading ? 'Génération en cours…' : 'Générer le post'}
          </Btn>

          {/* Generated post */}
          {generatedPost && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.ivoryMuted, textTransform: 'uppercase', letterSpacing: '.06em' }}>Post généré</span>
                <span style={{ fontSize: 11, color: charCount > 1300 ? C.danger : C.ivoryDim, fontWeight: 600 }}>
                  {charCount} / 1 300 caractères {charCount > 1300 && '⚠'}
                </span>
              </div>
              <textarea value={generatedPost} onChange={e => setGeneratedPost(e.target.value)}
                style={{
                  width: '100%', minHeight: 250, padding: '14px 16px', background: C.card,
                  border: `1px solid ${C.bdGold}`, borderRadius: 10, color: C.ivory, fontSize: 13,
                  lineHeight: 1.7, fontFamily: FONT_SANS, resize: 'vertical', outline: 'none',
                }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Btn onClick={handleCopy} variant={copied ? 'outline' : 'gold'}>{copied ? '✓ Copié' : 'Copier'}</Btn>
                <Btn onClick={handleSave} variant="outline" disabled={saving}>{saving ? 'Sauvegarde…' : 'Sauvegarder'}</Btn>
                <Btn onClick={handleRegenerate} variant="ghost" disabled={loading}>Régénérer</Btn>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL: SAVED POSTS ─────────────────────────────── */}
        <div style={{ background: C.bg, border: `1px solid ${C.bdGold}`, borderRadius: 14, padding: 24, maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.gold, fontFamily: FONT_SERIF }}>Posts sauvegardés</div>
              <div style={{ fontSize: 11, color: C.ivoryDim, marginTop: 2 }}>{posts.length} post{posts.length !== 1 ? 's' : ''}</div>
            </div>
            <Btn onClick={loadPosts} variant="ghost" style={{ padding: '5px 10px', fontSize: 11 }}>↻</Btn>
          </div>

          {postsLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.ivoryDim, fontSize: 13 }}>Chargement…</div>
          ) : posts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 32, opacity: 0.3, marginBottom: 8 }}>📝</div>
              <div style={{ fontSize: 13, color: C.ivoryDim }}>Aucun post sauvegardé</div>
              <div style={{ fontSize: 11, color: C.ivoryDim, marginTop: 4 }}>Générez un post et cliquez "Sauvegarder"</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {posts.map(post => {
                const themeLabel = THEMES.find(t => t.value === post.theme)?.label || post.theme
                const date = post.created_at ? new Date(post.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
                const excerpt = (post.content || '').slice(0, 120) + (post.content?.length > 120 ? '…' : '')

                return (
                  <div key={post.id} style={{ background: C.card, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '12px 14px', transition: 'border-color .15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = C.goldLine}
                    onMouseLeave={e => e.currentTarget.style.borderColor = C.bd}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                          background: C.goldBg, color: C.gold, border: `1px solid ${C.goldLine}`,
                        }}>{themeLabel}</span>
                        {post.tone && <span style={{ fontSize: 10, color: C.ivoryDim }}>{post.tone}</span>}
                      </div>
                      <span style={{ fontSize: 10, color: C.ivoryDim }}>{date}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.ivoryMuted, lineHeight: 1.5, marginBottom: 4 }}>{post.conseiller_name}</div>
                    <div style={{ fontSize: 12, color: C.ivory, lineHeight: 1.5, marginBottom: 10 }}>{excerpt}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn onClick={() => handleCopyPost(post.content)} variant="ghost" style={{ padding: '4px 10px', fontSize: 10 }}>Copier</Btn>
                      <Btn onClick={() => handleDelete(post.id)} variant="danger" style={{ padding: '4px 10px', fontSize: 10 }}>Supprimer</Btn>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
