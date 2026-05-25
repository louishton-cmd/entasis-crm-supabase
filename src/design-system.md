# Design System Entasis — Cupertino

Direction retenue par Louis le 2026-05-25 : **Proposition 7 · Cupertino · Apple light premium**.
Référence : macOS Sonoma, iOS 17, Apple wealth management UI.

---

## Principes

1. **Inter Tight** comme unique famille typographique (font de l'Apple system, lisible H24)
2. **Multi-shadow soft** sur les cards (jamais d'ombre dure, jamais de border seul)
3. **Border-radius généreux** (10-20px) — signature iOS
4. **Hover translateY(-1px)** + shadow grow → sensation de matière
5. **Backdrop blur** sur les éléments translucides (sidebar, header, modale)
6. **Gradient subtle** sur les boutons primaires (depth)
7. **Couleurs système Apple** pour les status (vert/rouge/bleu)
8. **Or champagne discret** comme accent (jamais dominant)

---

## Palette

```css
/* Surface */
--bg:            #F5F5F7;        /* gris iOS background */
--bg-subtle:     #FAFAFA;
--paper:         #FFFFFF;
--paper-grad:    linear-gradient(180deg, #FFFFFF 0%, #FCFCFC 100%);

/* Lines (Apple separators) */
--line:          rgba(60,60,67,0.08);
--line-strong:   rgba(60,60,67,0.14);
--line-soft:     rgba(60,60,67,0.04);

/* Text */
--t1:            #1D1D1F;        /* black Apple */
--t2:            #515154;        /* secondary */
--t3:            #86868B;        /* tertiary (labels) */
--t-inv:         #FFFFFF;

/* Navy structurel (CTA primaire, focus) */
--navy:          #0A1628;
--navy-soft:     rgba(10,22,40,0.06);

/* Apple system colors */
--apple-blue:    #0071E3;
--apple-blue-bg: rgba(0,113,227,0.10);
--apple-green:   #34C759;
--apple-orange:  #FF9500;
--apple-red:     #FF3B30;

/* Or champagne — accent discret */
--gold:          #C9A961;
--gold-dk:       #A6843F;
--gold-soft:     rgba(201,169,97,0.12);
--gold-line:     rgba(201,169,97,0.30);

/* Status (utilise les couleurs système Apple) */
--signed:        #34C759;
--signed-bg:     rgba(52,199,89,0.10);
--progress:      #FF9500;
--progress-bg:   rgba(255,149,0,0.10);
--forecast:      #0071E3;
--forecast-bg:   rgba(0,113,227,0.10);
--cancelled:     #FF3B30;
--cancelled-bg:  rgba(255,59,48,0.10);
```

---

## Typographie

**Famille unique** : `Inter Tight` (variable font, weights 400-800).
**Fallback** : `-apple-system, BlinkMacSystemFont, sans-serif`.
**Features OpenType** : `cv11`, `ss03` (chiffres modernes).
**Letter-spacing** : `-0.005em` global, `-0.02em` sur display.

### Échelle

| Token | Taille | Weight | Line-height | Usage |
|-------|--------|--------|-------------|-------|
| `--text-display` | 36px | 700 | 1.1 | Page title hero (Dashboard) |
| `--text-h1` | 28-32px | 700 | 1.1 | Headers de pages |
| `--text-h2` | 22px | 700 | 1.2 | Sections |
| `--text-h3` | 18px | 600 | 1.3 | Sous-sections |
| `--text-large` | 16px | 500 | 1.4 | Body emphase |
| `--text-body` | 14px | 400-500 | 1.5 | Body défaut |
| `--text-small` | 13px | 400-500 | 1.4 | Captions |
| `--text-xs` | 11-12px | 600 uppercase | 1.4 | Eyebrow / labels |
| `--text-mono` | 14px | tabular-nums | 1.4 | Chiffres (montants, %, dates) |

### Eyebrow / Labels

Toujours uppercase + tracking 0.18em + font-weight 600 + color `--t3` (ou `--gold` pour signature).

---

## Espacement (base 4px)

| Token | Valeur | Usage |
|-------|--------|-------|
| `--space-1` | 4px | Gap inline |
| `--space-2` | 8px | Gap form fields |
| `--space-3` | 12px | Padding interne small |
| `--space-4` | 16px | Padding cards small |
| `--space-5` | 20px | Padding cards medium |
| `--space-6` | 24px | Padding inputs |
| `--space-7` | 28px | Padding cards large |
| `--space-8` | 32px | Section gap |
| `--space-10` | 40px | Page section gap |
| `--space-12` | 48px | Page padding horizontal |

---

## Radius

| Token | Valeur | Usage |
|-------|--------|-------|
| `--rad-sm` | 8px | Inputs small, badges |
| `--rad` | 10px | Inputs, boutons standards |
| `--rad-md` | 12px | Boutons primaires, sidebar items |
| `--rad-lg` | 16px | Cards, modales small |
| `--rad-xl` | 18px | Cards principales |
| `--rad-2xl` | 20px | Cards hero, modales |
| `--rad-3xl` | 24px | Modales premium |

---

## Shadows (multi-layer iOS)

```css
/* Pas d'ombre, juste subtile élévation interne */
--sh-flat:   0 0.5px 0 rgba(255,255,255,0.8) inset;

/* Hover faible */
--sh-xs:     0 0.5px 0 rgba(255,255,255,0.8) inset,
             0 1px 2px rgba(0,0,0,0.03);

/* Card standard */
--sh-sm:     0 0.5px 0 rgba(255,255,255,0.8) inset,
             0 4px 12px rgba(0,0,0,0.04),
             0 12px 32px -8px rgba(0,0,0,0.05);

/* Card élevée */
--sh:        0 0.5px 0 rgba(255,255,255,0.9) inset,
             0 8px 24px rgba(0,0,0,0.06),
             0 24px 56px -16px rgba(0,0,0,0.10);

/* Modale */
--sh-lg:     0 0.5px 0 rgba(255,255,255,0.95) inset,
             0 4px 8px rgba(0,0,0,0.06),
             0 24px 48px rgba(0,0,0,0.10),
             0 48px 96px -24px rgba(0,0,0,0.14);

/* Bouton primaire */
--sh-btn:    0 0.5px 0 rgba(255,255,255,0.20) inset,
             0 4px 12px rgba(10,22,40,0.15);

--sh-btn-h:  0 0.5px 0 rgba(255,255,255,0.20) inset,
             0 8px 20px rgba(10,22,40,0.20);
```

---

## Transitions

```css
--transition-fast:  120ms cubic-bezier(0.16, 1, 0.3, 1);
--transition:       240ms cubic-bezier(0.16, 1, 0.3, 1);
--transition-slow:  400ms cubic-bezier(0.16, 1, 0.3, 1);
```

Hover button : `transform translateY(-1px)` + shadow grow en 120ms.
Hover card : `transform translateY(-2px)` + shadow grow en 240ms.

---

## Composants tokens

### Boutons

```css
.btn-primary {
  background: linear-gradient(180deg, #1D1D1F 0%, #0A1628 100%);
  color: #fff;
  border-radius: var(--rad-md);
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: var(--sh-btn);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.btn-primary:hover { transform: translateY(-1px); box-shadow: var(--sh-btn-h); }

.btn-secondary {
  background: linear-gradient(180deg, #FFFFFF 0%, #FAFAFA 100%);
  color: var(--t1);
  border: 0.5px solid var(--line);
  border-radius: var(--rad-md);
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 0.5px 0 rgba(255,255,255,0.95) inset, 0 1px 3px rgba(0,0,0,0.04);
}

.btn-ghost {
  background: rgba(0,0,0,0.04);
  color: var(--t1);
  border: none;
  border-radius: var(--rad-md);
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 500;
}
```

### Sidebar

```css
.sidebar {
  background: rgba(245,245,247,0.72);
  backdrop-filter: blur(28px) saturate(160%);
  border-right: 0.5px solid var(--line);
  width: 240px;
}
.nav-item.active {
  background: rgba(0,0,0,0.06);
  font-weight: 600;
  color: var(--t1);
}
```

### Cards

```css
.card {
  background: linear-gradient(180deg, #FFFFFF 0%, #FCFCFC 100%);
  border: 0.5px solid var(--line);
  border-radius: var(--rad-lg);
  box-shadow: var(--sh-sm);
}
.card-hero {
  background: radial-gradient(circle at top right, var(--gold-soft) 0%, transparent 60%),
              var(--paper);
  border: 0.5px solid var(--line);
  border-radius: var(--rad-lg);
  box-shadow: var(--sh);
}
```

### Inputs

```css
input, select, textarea {
  background: rgba(0,0,0,0.04);
  border: 0.5px solid var(--line);
  border-radius: var(--rad);
  padding: 10px 14px;
  font-size: 14px;
  color: var(--t1);
}
input:focus {
  outline: none;
  background: var(--paper);
  border-color: var(--apple-blue);
  box-shadow: 0 0 0 4px var(--apple-blue-bg);
}
```

### Modales

```css
.modal-backdrop {
  background: rgba(0,0,0,0.35);
  backdrop-filter: blur(20px);
}
.modal {
  background: var(--paper);
  border-radius: var(--rad-3xl);
  box-shadow: var(--sh-lg);
}
```

### Pills / Badges

```css
.pill {
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  background: var(--apple-blue-bg);
  color: var(--apple-blue);
}
.pill-vip {
  background: linear-gradient(135deg, rgba(201,169,97,0.16), rgba(201,169,97,0.08));
  color: var(--gold-dk);
  border: 0.5px solid var(--gold-line);
}
```

---

## Règles d'usage

1. **Jamais de border seul sans shadow** sur une card → ajouter toujours `inset 0 0.5px 0 rgba(255,255,255,0.8)` pour la signature Apple.
2. **Jamais de couleur en dehors de la palette**.
3. **Jamais de gradient à plus de 2 stops** (Apple = subtle).
4. **Pas d'emoji dans l'UI** (sauf ⚠ pour alertes critiques).
5. **Pas de border-bottom dur** sur les sections → utiliser `border-color: var(--line)` toujours.
6. **Pas de hover background fort** → toujours `rgba(0,0,0,0.04)` ou `rgba(255,255,255,0.04)`.

---

## Cohérence avec le Lead Room

Le Lead Room (entasis-leadroom) reste un projet Next.js séparé avec son propre design. À terme, on appliquera aussi Cupertino mais en V2. Pour l'instant l'iframe Lead Room dans le CRM affichera son style propre — c'est OK car visuellement séparé par les bordures de l'iframe.
