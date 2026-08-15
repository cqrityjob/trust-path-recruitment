-- Execution Mandate §38: profession-copy overclaiming audit.
--
-- Two of the 14 first-wave inclusion_rationale entries (SP006
-- Säkerhetssamordnare, SP010 Säkerhetsutredare) used "precis det som krävs" /
-- "exactly what's needed" -- language that reads as a suitability/eligibility
-- claim ("you meet the requirements") rather than an affinity observation
-- ("this direction shares traits with how you say you want to work"). The
-- other 12 first-wave entries already use softer verbs ("matchar", "passar
-- väl med", "liknar", "pekar mot" / "matches", "fits well with", "resembles",
-- "points toward") and were left untouched -- this migration only replaces
-- the two overclaiming phrases, keeping everything else about the sentences
-- unchanged.
--
-- UPDATE, not a new row: these are the same profession rows from
-- 20260814180000_cd_layer4_first_wave_professions.sql, still review_state =
-- 'ai_researched' / approved_for_ranking = false. No ranking behaviour
-- changes; this is copy only.

update public.cd_professions
set inclusion_rationale_sv = 'Du visar en kombination av ledarskapsintresse, tydlig kommunikation och strukturerat arbetssätt -- drag som ofta förekommer hos den som samordnar säkerhetsarbete mellan flera team och funktioner.',
    inclusion_rationale_en = 'You show a combination of leadership interest, clear communication and structured working -- traits that often show up in people who coordinate security work across teams and functions.'
where profession_id = 'SP006';

update public.cd_professions
set inclusion_rationale_sv = 'Ditt starka utredande drag, analytiska förmåga och strukturerade arbetssätt ligger nära det som ofta krävs för att granska, verifiera och fastställa vad som faktiskt hänt.',
    inclusion_rationale_en = 'Your strong investigative streak, analytical ability and structured way of working are close to what''s often needed to examine, verify and establish what actually happened.'
where profession_id = 'SP010';
