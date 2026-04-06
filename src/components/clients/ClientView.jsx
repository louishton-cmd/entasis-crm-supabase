import { useState, useEffect } from 'react'
import { toast } from 'react-hot-toast'
import ClientModal from './ClientModal.jsx'

// Helper pour formatage monétaire
function euro(amount) {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Annualisation PP
function annualize(pp) {
  return (pp || 0) * 12
}

// Statuts avec couleurs
const STATUS_CLASS = {
  'Signé': 'badge badge-signed',
  'En cours': 'badge badge-progress',
  'Prévu': 'badge badge-forecast',
  'Annulé': 'badge badge-cancelled',
}

const PIPELINE_STATUS_CLASS = {
  'prospect': 'badge badge-progress',
  'presente': 'badge badge-progress',
  'reservation': 'badge badge-forecast',
  'financement': 'badge badge-forecast',
  'acte': 'badge badge-signed',
  'livraison': 'badge badge-signed',
  'honoraires': 'badge badge-signed'
}

export default function ClientView({ clientId, onBack, supabase, profile, onEditDeal, onAddDeal }) {
  const [client, setClient] = useState(null)
  const [clientDeals, setClientDeals] = useState([])
  const [clientDossiers, setClientDossiers] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [editModalOpen, setEditModalOpen] = useState(false)

  const isManager = profile?.role === 'manager'

  // Charger toutes les données du client
  useEffect(() => {
    if (!clientId) return

    async function loadClientData() {
      setLoading(true)
      try {
        // 1. Données du client
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .eq('id', clientId)
          .single()

        if (clientError) throw clientError
        setClient(clientData)

        // 2. Deals du client
        const { data: dealsData, error: dealsError } = await supabase
          .from('deals')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })

        if (dealsError) throw dealsError
        setClientDeals(dealsData || [])

        // 3. Dossiers immo du client
        const { data: dossiersData, error: dossiersError } = await supabase
          .from('dossiers_immo')
          .select(`
            *,
            programme:programmes(nom, ville)
          `)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })

        if (dossiersError) throw dossiersError
        setClientDossiers(dossiersData || [])

        // 4. Historique des actions
        if (dealsData?.length > 0) {
          const dealIds = dealsData.map(d => d.id)
          const { data: historyData, error: historyError } = await supabase
            .from('activities')
            .select(`
              *,
              user:profiles(full_name)
            `)
            .in('deal_id', dealIds)
            .order('created_at', { ascending: false })
            .limit(20)

          if (!historyError) {
            setHistory(historyData || [])
          }
        }

      } catch (error) {
        console.error('Erreur chargement client:', error)
        toast.error('Erreur lors du chargement')
      } finally {
        setLoading(false)
      }
    }

    loadClientData()
  }, [clientId])

  // Calcul des métriques
  const signedDeals = clientDeals.filter(d => d.status === 'Signé')
  const caTotal = signedDeals.reduce((sum, d) => sum + annualize(d.pp_m || 0) + (d.pu || 0), 0)

  // Statut global (le moins avancé)
  const statusPriority = { 'Signé': 4, 'Prévu': 3, 'En cours': 2, 'Annulé': 1 }
  const globalStatus = clientDeals.length > 0
    ? Object.keys(statusPriority).find(status =>
        statusPriority[status] === Math.min(...clientDeals.map(d => statusPriority[d.status] || 1))
      ) || 'En cours'
    : 'Aucun deal'

  // Recharger les deals du client après sauvegarde
  const reloadClientDeals = async () => {
    if (!client?.id) return
    try {
      const { data } = await supabase
        .from('deals')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
      setClientDeals(data || [])
    } catch (error) {
      console.error('Erreur rechargement deals:', error)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div>Chargement...</div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="notice notice-error">
        Client introuvable
        <button className="btn btn-secondary" onClick={onBack} style={{ marginTop: '16px' }}>
          ← Retour
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        paddingBottom: '20px',
        borderBottom: '1px solid var(--bd)'
      }}>
        <div>
          <button
            className="btn btn-secondary"
            onClick={onBack}
            style={{ marginBottom: '12px' }}
          >
            ← Retour à la liste
          </button>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '600',
            margin: '0 0 8px 0',
            color: 'var(--t1)'
          }}>
            {client.prenom} {client.nom}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: 'var(--t2)' }}>
              Conseiller: {client.advisor_code || '—'}
            </span>
            {client.co_advisor_code && (
              <span style={{ fontSize: '14px', color: 'var(--t2)' }}>
                Co-conseiller: {client.co_advisor_code}
              </span>
            )}
            <span className={STATUS_CLASS[globalStatus] || 'badge'}>
              {globalStatus}
            </span>
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setEditModalOpen(true)}
        >
          Modifier
        </button>
      </div>

      {/* Cards résumé */}
      <div className="grid grid-4" style={{ marginBottom: '32px' }}>
        <div className="card">
          <div className="card-header">
            <h3>Produits financiers</h3>
          </div>
          <div className="card-body">
            <div className="kpi-value">{clientDeals.length}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3>CA total</h3>
          </div>
          <div className="card-body">
            <div className="kpi-value">{euro(caTotal)}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3>Dossiers immobilier</h3>
          </div>
          <div className="card-body">
            <div className="kpi-value">{clientDossiers.length}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3>Patrimoine estimé</h3>
          </div>
          <div className="card-body">
            <div className="kpi-value">{euro(client.patrimoine_estime)}</div>
          </div>
        </div>
      </div>

      {/* Section Informations client */}
      <div className="grid grid-2" style={{ marginBottom: '32px' }}>
        {/* Colonne gauche - Identité */}
        <div className="card">
          <div className="card-header">
            <h3>Identité</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <strong>Nom complet:</strong> {client.prenom} {client.nom}
              </div>
              {client.email && (
                <div>
                  <strong>Email:</strong> {client.email}
                </div>
              )}
              {client.telephone && (
                <div>
                  <strong>Téléphone:</strong> {client.telephone}
                </div>
              )}
              {client.age && (
                <div>
                  <strong>Âge:</strong> {client.age} ans
                </div>
              )}
              {client.situation_familiale && (
                <div>
                  <strong>Situation:</strong> {client.situation_familiale}
                </div>
              )}
              {client.nb_enfants > 0 && (
                <div>
                  <strong>Enfants:</strong> {client.nb_enfants}
                </div>
              )}
              {client.profession && (
                <div>
                  <strong>Profession:</strong> {client.profession}
                </div>
              )}
              {(client.adresse || client.ville) && (
                <div>
                  <strong>Adresse:</strong> {[client.adresse, client.code_postal, client.ville].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Colonne droite - Patrimoine */}
        <div className="card">
          <div className="card-header">
            <h3>Patrimoine & Objectifs</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {client.revenus_annuels && (
                <div>
                  <strong>Revenus annuels:</strong> {euro(client.revenus_annuels)}
                </div>
              )}
              {client.patrimoine_estime && (
                <div>
                  <strong>Patrimoine estimé:</strong> {euro(client.patrimoine_estime)}
                </div>
              )}
              {client.objectifs?.length > 0 && (
                <div>
                  <strong>Objectifs:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {client.objectifs.map(obj => (
                      <span key={obj} className="badge" style={{
                        backgroundColor: 'var(--gold)',
                        color: 'white',
                        fontSize: '11px'
                      }}>
                        {obj}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {client.notes && (
                <div>
                  <strong>Notes:</strong>
                  <div style={{
                    marginTop: '6px',
                    padding: '8px',
                    backgroundColor: 'var(--bg)',
                    borderRadius: 'var(--rad)',
                    fontSize: '13px',
                    lineHeight: '1.4'
                  }}>
                    {client.notes}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section Produits financiers */}
      <div className="card" style={{ marginBottom: '32px' }}>
        <div className="card-header">
          <h3>Produits financiers ({clientDeals.length})</h3>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onAddDeal && onAddDeal({
              client_id: client.id,
              client: `${client.prenom || ''} ${client.nom}`.trim(),
              client_email: client.email || '',
              client_phone: client.telephone || ''
            }, reloadClientDeals)}
          >
            + Ajouter un produit
          </button>
        </div>
        <div className="card-body">
          {clientDeals.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--t2)', padding: '40px' }}>
              Aucun produit financier
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {clientDeals.map(deal => (
                <div key={deal.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px',
                  backgroundColor: 'var(--bg)',
                  borderRadius: 'var(--rad)',
                  border: '1px solid var(--bd)'
                }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                      {deal.product}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--t2)' }}>
                      PP: {euro(annualize(deal.pp_m || 0))} | PU: {euro(deal.pu || 0)}
                    </div>
                    {deal.co_advisor_code && (
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>
                        Co-conseiller: {deal.co_advisor_code}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className={STATUS_CLASS[deal.status]}>
                      {deal.status}
                    </span>
                    {deal.date_signed && (
                      <span style={{ fontSize: '12px', color: 'var(--t2)' }}>
                        {deal.date_signed}
                      </span>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onEditDeal && onEditDeal(deal, reloadClientDeals)}
                    >
                      Modifier
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section Dossiers immobilier */}
      {clientDossiers.length > 0 && (
        <div className="card" style={{ marginBottom: '32px' }}>
          <div className="card-header">
            <h3>Dossiers immobilier ({clientDossiers.length})</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {clientDossiers.map(dossier => (
                <div key={dossier.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '16px',
                  backgroundColor: 'var(--bg)',
                  borderRadius: 'var(--rad)',
                  border: '1px solid var(--bd)'
                }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
                      {dossier.programme?.nom || 'Programme non spécifié'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--t2)' }}>
                      {dossier.programme?.ville} | Prix: {euro(dossier.prix_lot)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--t3)' }}>
                      Honoraires: {euro(dossier.honoraires_prevus)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className={PIPELINE_STATUS_CLASS[dossier.statut_pipeline] || 'badge'}>
                      {dossier.statut_pipeline}
                    </span>
                    <button className="btn btn-secondary btn-sm">Voir</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section Historique */}
      {history.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Historique des actions</h3>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {history.map(activity => (
                <div key={activity.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--bd)',
                  fontSize: '13px'
                }}>
                  <div>
                    <strong>{activity.action_type}</strong> par {activity.user?.full_name || 'Système'}
                  </div>
                  <div style={{ color: 'var(--t2)', fontSize: '12px' }}>
                    {new Date(activity.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition */}
      <ClientModal
        open={editModalOpen}
        client={client}
        onClose={() => setEditModalOpen(false)}
        onSave={(updatedClient) => {
          setClient(updatedClient)
          setEditModalOpen(false)
        }}
        supabase={supabase}
        profile={profile}
      />
    </div>
  )
}