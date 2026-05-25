# Design System Entasis — 3 directions visuelles

Pour comparer, ouvre les 3 fichiers HTML directement dans ton navigateur :

```bash
open design-previews/proposal-1-banque-privee-classique.html
open design-previews/proposal-2-premium-minimaliste.html
open design-previews/proposal-3-sophistique-contraste.html
```

Chaque page montre : sidebar + header + dashboard KPIs + tableau leads + fiche client + modale (clic sur le bouton "Voir la modale" en bas à droite).

---

## Proposition 1 — Banque privée classique digitale

**Parti pris** : référence Pictet, Edmond de Rothschild. Navy + or sur fond beige clair (signature banque privée). Titres serif Cormorant Garamond pour l'élégance éditoriale. Filets or fins comme accents typographiques. Densité moyenne, sensation de gravité et de tradition.

### Palette
| Token | Hex | Usage |
|-------|-----|-------|
| `--navy` | `#0A1628` | Sidebar, CTA primaire, textes titres |
| `--navy-soft` | `#14233D` | Hover sidebar |
| `--gold` | `#C9A961` | Filets, KPI accents, labels eyebrow |
| `--gold-soft` | `rgba(201,169,97,0.12)` | Onglet actif sidebar |
| `--bg` | `#FAF8F4` | Fond général (beige très clair) |
| `--paper` | `#FFFFFF` | Cards, surfaces principales |
| `--line` | `#E8E2D6` | Bordures (chaud) |
| `--t1` | `#0A1628` | Texte primaire |
| `--t2` | `#475569` | Texte secondaire |
| `--t3` | `#94A3B8` | Texte tertiaire (labels) |

### Typographie
- **Titres** : Cormorant Garamond (serif), 700, large échelle (24-40px)
- **Body** : Inter (sans-serif), 400-600, 13-14px
- **Eyebrow** : Inter uppercase, letter-spacing 0.22em, 10px, gold

| Niveau | Famille | Taille | Poids | Line-height |
|--------|---------|--------|-------|-------------|
| Display | Cormorant Garamond | 40px | 500 | 1.1 |
| H1 | Cormorant Garamond | 34px | 500 | 1.1 |
| H2 | Cormorant Garamond | 22px | 500 | 1.3 |
| Body | Inter | 14px | 400 | 1.5 |
| Caption | Inter | 11px | 500 | 1.4 |
| Eyebrow | Inter | 10px | 600 | 1.4 |

### Tokens composants
- **Radius** : 0 (carré) — signature classique
- **Shadows** : aucune, juste des bordures fines
- **Espacement** : base 4px, padding cards 28px, sections 40px
- **Transitions** : `150ms ease`

---

## Proposition 2 — Premium minimaliste contemporain

**Parti pris** : référence Linear, Stripe, Notion premium. Blanc pur dominant partout (sidebar et content), navy uniquement structurel (texte + CTA), or quasi absent. Beaucoup d'air. Typo Inter avec OpenType features actives. Sensation de calme, fonctionnalité maximale.

### Palette
| Token | Hex | Usage |
|-------|-----|-------|
| `--navy` | `#0A1628` | CTA, titres, hover |
| `--bg` | `#FFFFFF` | Tout (sidebar et content) |
| `--bg-2` | `#FAFAFA` | Hover row, surfaces secondaires |
| `--line` | `#F0F0F0` | Séparateurs subtils |
| `--line-2` | `#E4E4E4` | Bordures inputs |
| `--t1` | `#0A1628` | Texte primaire |
| `--t2` | `#525866` | Texte secondaire |
| `--t3` | `#A0A6AF` | Texte tertiaire |
| `--gold` | `#C9A961` | Réservé aux CTA très exceptionnels |

### Typographie
- **Famille unique** : Inter (sans-serif), avec font-feature-settings actives (cv01, cv02, cv05, cv11, ss03)
- Sensation moderne, lecture rapide

| Niveau | Famille | Taille | Poids | Line-height |
|--------|---------|--------|-------|-------------|
| Display | Inter | 40px | 600 | 1.1 |
| H1 | Inter | 28px | 600 | 1.2 |
| H2 | Inter | 18px | 600 | 1.3 |
| Body | Inter | 14px | 500 | 1.5 |
| Caption | Inter | 13px | 400 | 1.4 |
| Eyebrow | Inter | 11-12px | 600 uppercase | 1.4 |

### Tokens composants
- **Radius** : 8-16px (lg sur cards et boutons, 2xl sur sections)
- **Shadows** : `0 1px 2px rgba(0,0,0,0.04)` max, souvent aucune
- **Espacement** : base 8px, padding cards 32px, sections 56px
- **Transitions** : `200ms cubic-bezier(0.4, 0, 0.2, 1)`

---

## Proposition 3 — Sophistiqué avec contraste

**Parti pris** : référence Bridgewater, Stitch Fix premium. Contraste fort entre zones navy profond (sidebar, header, KPI hero, fiche client en vue) et zones blanches (content, tableau). Or comme fil rouge persistant : border-left actif, border-bottom 3px sous header, badges VIP, eyebrow labels. IBM Plex pour un mix moderne + editorial.

### Palette
| Token | Hex | Usage |
|-------|-----|-------|
| `--navy` | `#0A1628` | Sidebar, header, KPI hero, fiche en vue, table thead |
| `--navy-deep` | `#050B16` | Hover navy, scrollbar |
| `--gold` | `#C9A961` | Border accents, badges, eyebrow, fil rouge |
| `--gold-soft` | `rgba(201,169,97,0.12)` | Onglet actif, badges VIP |
| `--bg` | `#FFFFFF` | Content principal |
| `--bg-2` | `#F7F7F8` | Hover row |
| `--line` | `#E8E8EC` | Bordures cards |
| `--t1` | `#0A1628` | Texte sur fond clair |
| `--t2` | `#4A4F5C` | Secondaire |
| `--t3` | `#7C8392` | Tertiaire |

### Typographie
- **Titres** : IBM Plex Serif (editorial mais moderne)
- **Body** : IBM Plex Sans
- Le mix serif/sans donne sophistication sans tomber dans le classique

| Niveau | Famille | Taille | Poids | Line-height |
|--------|---------|--------|-------|-------------|
| Display | IBM Plex Serif | 36px | 500 | 1.1 |
| H1 | IBM Plex Serif | 34px | 500 | 1.1 |
| H2 | IBM Plex Serif | 22-24px | 500 | 1.3 |
| Body | IBM Plex Sans | 14px | 400 | 1.5 |
| Caption | IBM Plex Sans | 12px | 500 | 1.4 |
| Eyebrow | IBM Plex Sans | 10px | 600 uppercase, letter-spacing 0.22em | gold |

### Tokens composants
- **Radius** : 6-8px (médian, équilibré)
- **Shadows** : `0 4px 16px rgba(10,22,40,0.06)` sur modales
- **Espacement** : base 4px, padding cards 28px, sections 40px
- **Transitions** : `180ms ease`
- **Accent signature** : border-top 3px gold sur cards "vue", border-bottom 3px gold sous header navy

---

## Comparatif rapide

| Critère | Prop. 1 (Classique) | Prop. 2 (Minimaliste) | Prop. 3 (Contraste) |
|---------|---------------------|------------------------|----------------------|
| **Référence** | Pictet, Lombard Odier | Linear, Stripe, Notion | Bridgewater, Stitch Fix |
| **Fond général** | Beige `#FAF8F4` | Blanc pur `#FFFFFF` | Blanc + zones navy |
| **Sidebar** | Navy avec or accents | Blanc avec border | Navy profond |
| **Header** | Blanc avec filet or | Blanc, beaucoup d'air | Navy + border-bottom gold |
| **Typo titres** | Cormorant Garamond (serif) | Inter (sans-serif unique) | IBM Plex Serif (editorial) |
| **Or** | Présent mais discret | Quasi absent | Fil rouge omniprésent |
| **Densité** | Moyenne | Aérée | Moyenne |
| **Sensation** | Tradition, gravité | Modernité, calme | Sophistication, audace |

---

## Prochaine étape

Choisis la direction qui te parle le plus (ou un mix), et on appliquera le design system retenu à l'ensemble du CRM existant écran par écran :

1. Refonte des variables CSS dans `src/styles.css`
2. Refonte de la sidebar (App.jsx)
3. Refonte des composants (cards, modales, tables, formulaires)
4. Migration des pages principales (Dashboard, Pipeline, Clients, UCS, Structureurs, etc.)
5. Tests visuels écran par écran

Estimation effort selon le choix :
- **Prop. 1** : ~2-3 jours (changement typo + tokens + sidebar)
- **Prop. 2** : ~1-2 jours (le plus proche du code actuel sur le fond)
- **Prop. 3** : ~3-4 jours (refonte navy/blanc structurelle, le plus marqué visuellement)
