# Noraya Phase 1 — OneScore shadow engine

## Αρχή
Δεν αλλάζουμε live ranking.
Δεν βάζουμε Apify.
Δεν βάζουμε GDELT ακόμα.
Δεν αφαιρούμε UI ακόμα.
Προσθέτουμε μόνο shadow score στα API payloads.

---

## Αρχείο 1 — νέο αρχείο
Create new file:

`lib/noraya-priority-score.ts`

Paste the provided `noraya-priority-score.ts` file.

---

## Αρχείο 2 — modify
Open:

`app/api/situation-engine/route.ts`

### 1. Add import after the existing imports

```ts
import { computeNorayaPriorityScore } from "@/lib/noraya-priority-score";
```

### 2. Add this helper after `function trendPayload(...)`

```ts
function usableTrendScore(trendInfo: ReturnType<typeof trendPayload>) {
  const status = String(trendInfo.search_interest_status || "").toLowerCase();
  if (!trendInfo.search_interest_fetched_at) return null;
  if (status.includes("fallback") || status.includes("pending")) return null;
  return trendInfo.search_interest_score;
}
```

### 3. In `eventToSituationRow`, after `const strategicIndex = ...`, add:

```ts
  const norayaPriority = computeNorayaPriorityScore({
    norayaScore: rawSignal,
    googleTrendsScore: usableTrendScore(trendInfo),
    gdeltScore: null,
    clientRelevanceScore: null,
  });
```

### 4. In the object returned by `eventToSituationRow`, after `strategic_index_label`, add:

```ts
    noraya_priority_score: norayaPriority.score,
    noraya_priority_route: norayaPriority.route,
    noraya_priority_status: norayaPriority.status,
    noraya_priority_components: norayaPriority,
```

### 5. In `buildAgendaOverview`, after `const strategicIndex = ...`, add:

```ts
    const norayaPriority = computeNorayaPriorityScore({
      norayaScore: score,
      googleTrendsScore: usableTrendScore(trendInfo),
      gdeltScore: null,
      clientRelevanceScore: null,
    });
```

### 6. In the agenda overview returned object, after `strategic_index_label`, add:

```ts
      noraya_priority_score: norayaPriority.score,
      noraya_priority_route: norayaPriority.route,
      noraya_priority_status: norayaPriority.status,
      noraya_priority_components: norayaPriority,
```

---

## Έλεγχος

1. Commit.
2. Περιμένουμε Vercel Ready.
3. Ανοίγουμε:

`/api/situation-engine?token=dev&party=elas`

4. Σε κάθε situation πρέπει να υπάρχει:

```json
"noraya_priority_score": 74,
"noraya_priority_route": "media",
"noraya_priority_status": "ranked"
```

5. Το UI δεν πρέπει να έχει αλλάξει ακόμα.
6. Το live ranking δεν πρέπει να έχει αλλάξει ακόμα.

---

## Τι σημαίνει αν δεν υπάρχει Trends/GDELT

Το νέο score πρέπει να ισούται περίπου με το υπάρχον Noraya score, επειδή κάνουμε reweight μόνο στο διαθέσιμο κανάλι.
Δεν περνάει fake 50.
