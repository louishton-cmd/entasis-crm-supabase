import { useState, useEffect, useMemo } from 'react'
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

export default function ClientsView({ supabase, onSelectClient, profile }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('Tous') // Tous | Mes clients | Par statut
  const [newClientModalOpen, setNewClientModalOpen] = useState(false)

  const isManager = profile?.role === 'manager'

  // Charger tous les clients avec leurs deals
  useEffect(() => {
    async function loadClients() {
      setLoading(true)
      try {
        // Requête 1 : clients uniquement
        const { data: clientsData, error: clientsError } = await supabase
          .from('clients')
          .select('*')
          .order('created_at', { ascending: false })

        if (clientsError) throw clientsError

        // Requête 2 : deals liés
        const { data: dealsData, error: dealsError } = await supabase
          .from('deals')
          .select('id, client_id, product, status, pp_m, pu, co_advisor_code')
          .not('client_id', 'is', null)

        if (dealsError) throw dealsError

        // Requête 3 : dossiers immo liés
        const { data: dossiersData, error: dossiersError } = await supabase
          .from('dossiers_immo')
          .select('id, client_id, statut_pipeline')
          .not('client_id', 'is', null)

        if (dossiersError) throw dossiersError

        // Assembler manuellement
        const clients = (clientsData || []).map(c => ({
          ...c,
          deals: (dealsData || []).filter(d => d.client_id === c.id),
          dossiers_immo: (dossiersData || []).filter(d => d.client_id === c.id)
        }))

        setClients(clients)
      } catch (error) {
        console.error('Erreur chargement clients:', error)
        toast.error('Erreur lors du chargement des clients')
      } finally {
        setLoading(false)
      }
    }

    loadClients()
  }, [supabase])

  // Fonction pour calculer le statut global d'un client
  function getGlobalStatus(deals) {
    if (!deals || deals.length === 0) return 'Aucun deal'

    const statusPriority = { 'Signé': 4, 'Prévu': 3, 'En cours': 2, 'Annulé': 1 }
    const minPriority = Math.min(...deals.map(d => statusPriority[d.status] || 1))
    return Object.keys(statusPriority).find(status => statusPriority[status] === minPriority) || 'En cours'
  }

  // Fonction pour calculer le CA total d'un client
  function getClientCA(deals) {
    if (!deals) return 0
    return deals
      .filter(d => d.status === 'Signé')
      .reduce((sum, d) => sum + annualize(d.pp_m || 0) + (d.pu || 0), 0)
  }

  // Filtrage et recherche
  const filteredClients = useMemo(() => {
    let filtered = clients

    // Filtre par ownership
    if (!isManager && filterType === 'Mes clients') {
      filtered = filtered.filter(c =>
        c.advisor_code === profile?.advisor_code ||
        c.co_advisor_code === profile?.advisor_code
      )
    }

    // Recherche textuelle
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(c =>
        (c.nom || '').toLowerCase().includes(searchLower) ||
        (c.prenom || '').toLowerCase().includes(searchLower) ||
        (c.email || '').toLowerCase().includes(searchLower) ||
        (c.telephone || '').toLowerCase().includes(searchLower) ||
        (c.advisor_code || '').toLowerCase().includes(searchLower)
      )
    }

    return filtered
  }, [clients, search, filterType, isManager, profile])

  // Enrichir les clients avec métriques calculées
  const enrichedClients = useMemo(() => {
    return filteredClients.map(client => ({
      ...client,
      globalStatus: getGlobalStatus(client.deals),
      caTotal: getClientCA(client.deals),
      hasImmo: (client.dossiers_immo || []).length > 0
    }))
  }, [filteredClients])

  const handleClientCreated = (newClient) => {
    setClients(prev => [newClient, ...prev])
    setNewClientModalOpen(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <div>Chargement des clients...</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0, color: 'var(--t1)' }}>
            Clients ({enrichedClients.length})
          </h1>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setNewClientModalOpen(true)}
        >
          + Nouveau client
        </button>
      </div>

      {/* Filtres et recherche */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '24px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: '300px' }}>
          <input
            className="form-input"
            placeholder="Rechercher un client (nom, email, téléphone...)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-input"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          style={{ width: 'auto', minWidth: '150px' }}
        >
          <option value="Tous">Tous les clients</option>
          {!isManager && <option value="Mes clients">Mes clients</option>}
        </select>
      </div>

      {/* Tableau des clients */}
      {enrichedClients.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ fontSize: '18px', color: 'var(--t2)', marginBottom: '16px' }}>
              {search ? 'Aucun client trouvé' : 'Aucun client'}
            </div>
            <div style={{ color: 'var(--t3)', marginBottom: '24px' }}>
              {search
                ? 'Essayez de modifier votre recherche'
                : 'Commencez par créer votre premier client'
              }
            </div>
            {!search && (
              <button
                className="btn btn-primary"
                onClick={() => setNewClientModalOpen(true)}
              >
                + Nouveau client
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="table" style={{ width: '100%' }}>
              <thead>
                <tr style={{ backgroundColor: '#F5F2EC' }}>
                  <th style={{ fontWeight: '600', width: '35%' }}>Client</th>
                  <th style={{ fontWeight: '600', width: '15%' }}>Conseiller</th>
                  <th style={{ fontWeight: '600', width: '10%' }}>Produits</th>
                  <th style={{ fontWeight: '600', width: '15%' }}>Statut global</th>
                  <th style={{ fontWeight: '600', width: '15%' }}>CA total</th>
                  <th style={{ fontWeight: '600', width: '10%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrichedClients.map(client => (
                  <tr
                    key={client.id}
                    onClick={() => onSelectClient(client.id)}
                    style={{
                      cursor: 'pointer',
                      padding: '16px 20px',
                      borderBottom: '1px solid #E8E4DC'
                    }}
                    onMouseEnter={e => e.target.closest('tr').style.backgroundColor = 'rgba(192, 155, 90, 0.05)'}
                    onMouseLeave={e => e.target.closest('tr').style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>
                            {client.prenom} {client.nom}
                          </div>
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>
                            {client.email || client.telephone || '—'}
                          </div>
                        </div>
                        {client.hasImmo && (
                          <span
                            title="Client avec dossiers immobilier"
                            style={{
                              backgroundColor: 'var(--gold)',
                              color: 'white',
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '3px'
                            }}
                          >
                            🏠
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{client.advisor_code || '—'}</div>
                      {client.co_advisor_code && (
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                          Co: {client.co_advisor_code}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>
                        {(client.deals || []).length} produit{(client.deals || []).length > 1 ? 's' : ''}
                      </div>
                      <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                        {client.dossiers_immo?.length > 0 && `${client.dossiers_immo.length} immo`}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <span className={`badge ${getStatusBadgeClass(client.globalStatus)}`}>
                        {client.globalStatus}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>
                        {euro(client.caTotal)}
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={e => {
                          e.stopPropagation()
                          onSelectClient(client.id)
                        }}
                      >
                        Voir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal nouveau client */}
      <ClientModal
        open={newClientModalOpen}
        client={null}
        onClose={() => setNewClientModalOpen(false)}
        onSave={handleClientCreated}
        supabase={supabase}
        profile={profile}
      />
    </div>
  )
}

// Helper pour les classes de statut
function getStatusBadgeClass(status) {
  switch (status) {
    case 'Signé': return 'badge-signed'
    case 'Prévu': return 'badge-forecast'
    case 'En cours': return 'badge-progress'
    case 'Annulé': return 'badge-cancelled'
    default: return ''
  }
}