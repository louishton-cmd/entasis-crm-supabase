-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION : Réaligne deals.month sur date_signed pour les deals signés
-- Date    : 2026-05-26
--
-- POURQUOI
-- Pour les deals signés, la colonne `month` doit refléter le mois de
-- signature (date_signed) — c'est ce que filtre advisorMetrics() pour
-- afficher les PP/PU dans le Dashboard du conseiller.
--
-- Pour les nouveaux deals, l'alignement se fait au save (cf
-- alignedMonthForDeal dans src/lib/metrics.js). Mais pour les anciens
-- deals signés AVANT cette logique, le month est resté sur le mois de
-- création → ces deals n'apparaissent pas dans le Dashboard du mois de
-- signature → Gianni ne voit pas sa part 50% sur les deals signés où
-- il est co-conseiller.
--
-- NOTE : date_signed est stocké en TEXT (format ISO 'YYYY-MM-DD'), pas
-- en DATE/TIMESTAMP — on extrait donc le mois via substring (positions
-- 6-7) plutôt que via EXTRACT() qui exigerait un cast. Le regex
-- ~ '^\d{4}-\d{2}' garantit que le format est bien YYYY-MM-...
--
-- Idempotent (le WHERE month <> ... évite les UPDATE inutiles).
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.deals
SET month = CASE substring(date_signed FROM 6 FOR 2)
  WHEN '01' THEN 'JANVIER'
  WHEN '02' THEN 'FÉVRIER'
  WHEN '03' THEN 'MARS'
  WHEN '04' THEN 'AVRIL'
  WHEN '05' THEN 'MAI'
  WHEN '06' THEN 'JUIN'
  WHEN '07' THEN 'JUILLET'
  WHEN '08' THEN 'AOÛT'
  WHEN '09' THEN 'SEPTEMBRE'
  WHEN '10' THEN 'OCTOBRE'
  WHEN '11' THEN 'NOVEMBRE'
  WHEN '12' THEN 'DÉCEMBRE'
END
WHERE status = 'Signé'
  AND date_signed IS NOT NULL
  AND date_signed ~ '^\d{4}-\d{2}'
  AND month <> CASE substring(date_signed FROM 6 FOR 2)
    WHEN '01' THEN 'JANVIER'
    WHEN '02' THEN 'FÉVRIER'
    WHEN '03' THEN 'MARS'
    WHEN '04' THEN 'AVRIL'
    WHEN '05' THEN 'MAI'
    WHEN '06' THEN 'JUIN'
    WHEN '07' THEN 'JUILLET'
    WHEN '08' THEN 'AOÛT'
    WHEN '09' THEN 'SEPTEMBRE'
    WHEN '10' THEN 'OCTOBRE'
    WHEN '11' THEN 'NOVEMBRE'
    WHEN '12' THEN 'DÉCEMBRE'
  END;

-- Validation : répartition par mois après réalignement
SELECT month, COUNT(*) AS nb
FROM public.deals
WHERE status = 'Signé'
GROUP BY month
ORDER BY month;
