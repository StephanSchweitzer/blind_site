---
paths:
  - "components/ui/admin/*OrderForm*.tsx"
  - "components/ui/admin/RecordingAdviceNotice.tsx"
  - "hooks/useRecordingAdvice.ts"
  - "lib/orders/recordingAdvice.ts"
---

## Les mises en garde « enregistrement » ne s'affichent que sur une décision en cours

Une demande existante ouverte pour modification **ne doit afficher aucun avertissement
d'enregistrement** — ni « un enregistrement audio existe déjà », ni « il existe déjà une
demande d'enregistrement active », ni le `confirm` à l'enregistrement du formulaire. Neuf
fois sur dix le formulaire ouvert EST la demande d'enregistrement d'origine : elle serait
mise en garde contre elle-même. L'exception, et la seule : sa décision d'enregistrement
change dans la session (case « Enregistrement » / « Duplication » basculée, ou livre changé).

La règle est **dérivée**, pas mémorisée — `recordingDecisionIsOpen()` dans
`lib/orders/recordingAdvice.ts` compare l'état saisi à l'état enregistré. Elle a déjà existé
sous forme de drapeau `recordingTouched` posé dans le JSX, et elle a disparu au premier
nettoyage. D'où le montage actuel :

- `useRecordingAdvice` est le **seul** accès à `/api/orders/recording-check`, et il ne rend
  jamais la réponse brute : `adviceFor()` renvoie `null` et `conflicts()` une liste vide dès
  que la porte est fermée.
- `RecordingAdviceNotice` ne rend rien sur `advice === null`, et porte le texte des trois
  messages.

Donc : pas de condition à écrire dans le formulaire, donc pas de condition à supprimer par
mégarde. **Si vous ajoutez un avertissement d'enregistrement, faites-le passer par
`RecordingAdvice`** — n'allez pas rechercher la donnée brute à côté.

Hors de cette porte, volontairement : `blockingRecordingFor()` (« un enregistrement est en
cours chez un lecteur »), qui parle d'une attribution TIERCE sous la case « Duplication » et
reste vrai sur une demande déjà enregistrée.
