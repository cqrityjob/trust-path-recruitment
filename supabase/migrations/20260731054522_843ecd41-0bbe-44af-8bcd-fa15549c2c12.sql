-- Security Career Discovery v3.1 — PR 2: instrument definition and option matrix. ADDITIVE ONLY.

INSERT INTO public.assessment_versions (assessment_id, model_version, disclaimer_version, notes)
SELECT
  'security-career-discovery-v3',
  '2026-scd-v3.1.0',
  'v1',
  'Security Career Discovery v3.1 — 16 Career Intelligence Dimensions, 20 core scored items (12 scale + 8 single choice), option-level loadings and the ten Career Patterns.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.assessment_versions
  WHERE assessment_id = 'security-career-discovery-v3'
    AND model_version = '2026-scd-v3.1.0'
);

INSERT INTO public.cd_definition_versions (
  assessment_id, assessment_version_id,
  definition_version, content_version, scoring_version, taxonomy_version,
  lifecycle_status
)
SELECT
  'security-career-discovery-v3',
  av.id,
  '2026-scd-v3.1.0',
  'v3.1-draft-1',
  'v3.1-draft-1',
  'cig-areas-v1',
  'internal_test'
FROM public.assessment_versions av
WHERE av.assessment_id = 'security-career-discovery-v3'
  AND av.model_version = '2026-scd-v3.1.0'
ON CONFLICT (assessment_id, definition_version) DO NOTHING;

INSERT INTO public.cd_definition_items
  (definition_version_id, item_id, item_version, item_kind, evidence_class,
   is_scored, section_id, display_order)
SELECT dv.id, v.item_id, 1, v.item_kind, 'orientation_self_report', true,
       v.section_id, v.display_order
FROM public.cd_definition_versions dv
CROSS JOIN (VALUES
  ('CQ01','scale','approach',1),          ('CQ02','single_choice','approach',2),
  ('CQ03','single_choice','approach',3),  ('CQ04','scale','approach',4),
  ('CQ05','scale','others',5),            ('CQ06','single_choice','others',6),
  ('CQ07','scale','others',7),            ('CQ08','scale','others',8),
  ('CQ09','single_choice','decisions',9), ('CQ10','scale','decisions',10),
  ('CQ11','scale','decisions',11),        ('CQ12','single_choice','decisions',12),
  ('CQ13','scale','responsibility',13),   ('CQ14','scale','responsibility',14),
  ('CQ15','single_choice','responsibility',15), ('CQ16','scale','responsibility',16),
  ('CQ17','single_choice','development',17),    ('CQ18','scale','development',18),
  ('CQ19','scale','development',19),      ('CQ20','single_choice','development',20)
) AS v(item_id, item_kind, section_id, display_order)
WHERE dv.assessment_id = 'security-career-discovery-v3'
  AND dv.definition_version = '2026-scd-v3.1.0'
ON CONFLICT (definition_version_id, item_id) DO NOTHING;

INSERT INTO public.cd_option_loadings
  (scoring_version, question_id, option_id, dimension_id, role, role_weight, value, rationale)
VALUES
  ('v3.1-draft-1', 'CQ02', 'CQ02_A', 'CID04', 'primary', 0.700, 1.000,
   'Declared primary. The item is a trade-off between four kinds of work, and the technical option is the one that engages with a system directly.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_A', 'CID03', 'secondary', 0.300, 0.800,
   'Declared secondary. Every option involves some degree of working out what is going on, which is analysis.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_A', 'CID11', 'tertiary', 0.150, 0.350,
   'One option is explicitly about making work traceable through procedures and records, which is the structure dimension stated as a preferred task.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_A', 'CID07', 'tertiary', 0.150, 0.200,
   'One option moves the work away from its object and onto the person receiving it, which is communication chosen over subject matter.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_A', 'CID08', 'tertiary', 0.150, 0.200,
   'Choosing to help someone understand something difficult is service motivation expressed as a task preference rather than as a stated value.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_B', 'CID04', 'primary', 0.700, 0.450,
   'Declared primary. The item is a trade-off between four kinds of work, and the technical option is the one that engages with a system directly.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_B', 'CID03', 'secondary', 0.300, 1.000,
   'Declared secondary. Every option involves some degree of working out what is going on, which is analysis.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_B', 'CID11', 'tertiary', 0.150, 0.550,
   'One option is explicitly about making work traceable through procedures and records, which is the structure dimension stated as a preferred task.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_B', 'CID07', 'tertiary', 0.150, 0.250,
   'One option moves the work away from its object and onto the person receiving it, which is communication chosen over subject matter.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_B', 'CID08', 'tertiary', 0.150, 0.150,
   'Choosing to help someone understand something difficult is service motivation expressed as a task preference rather than as a stated value.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_C', 'CID04', 'primary', 0.700, 0.350,
   'Declared primary. The item is a trade-off between four kinds of work, and the technical option is the one that engages with a system directly.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_C', 'CID03', 'secondary', 0.300, 0.500,
   'Declared secondary. Every option involves some degree of working out what is going on, which is analysis.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_C', 'CID11', 'tertiary', 0.150, 1.000,
   'One option is explicitly about making work traceable through procedures and records, which is the structure dimension stated as a preferred task.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_C', 'CID07', 'tertiary', 0.150, 0.350,
   'One option moves the work away from its object and onto the person receiving it, which is communication chosen over subject matter.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_C', 'CID08', 'tertiary', 0.150, 0.400,
   'Choosing to help someone understand something difficult is service motivation expressed as a task preference rather than as a stated value.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_D', 'CID04', 'primary', 0.700, 0.150,
   'Declared primary. The item is a trade-off between four kinds of work, and the technical option is the one that engages with a system directly.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_D', 'CID03', 'secondary', 0.300, 0.350,
   'Declared secondary. Every option involves some degree of working out what is going on, which is analysis.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_D', 'CID11', 'tertiary', 0.150, 0.300,
   'One option is explicitly about making work traceable through procedures and records, which is the structure dimension stated as a preferred task.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_D', 'CID07', 'tertiary', 0.150, 1.000,
   'One option moves the work away from its object and onto the person receiving it, which is communication chosen over subject matter.'),
  ('v3.1-draft-1', 'CQ02', 'CQ02_D', 'CID08', 'tertiary', 0.150, 1.000,
   'Choosing to help someone understand something difficult is service motivation expressed as a task preference rather than as a stated value.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_A', 'CID15', 'primary', 0.700, 0.650,
   'Declared primary. All four options are responsible, so the item measures which responsible instinct fires first, not whether the candidate acts.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_A', 'CID06', 'secondary', 0.300, 0.850,
   'Declared secondary. A skipped control is a risk event, and the options differ in how directly they address the exposure it created.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_A', 'CID10', 'tertiary', 0.150, 1.000,
   'Establishing what may have been affected before deciding anything is investigative work: gather the facts, then judge.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_A', 'CID11', 'tertiary', 0.150, 0.400,
   'Reporting and documenting according to procedure is the structure dimension observed as behaviour rather than self-reported as a preference.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_A', 'CID07', 'tertiary', 0.150, 0.200,
   'Raising it directly with the person responsible requires initiating a difficult conversation, which is communication under real cost.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_A', 'CID09', 'tertiary', 0.150, 0.300,
   'Telling a colleague their step was skipped means accepting resistance rather than routing around it, which is the boundary-setting dimension.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_B', 'CID15', 'primary', 0.700, 0.800,
   'Declared primary. All four options are responsible, so the item measures which responsible instinct fires first, not whether the candidate acts.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_B', 'CID06', 'secondary', 0.300, 0.550,
   'Declared secondary. A skipped control is a risk event, and the options differ in how directly they address the exposure it created.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_B', 'CID10', 'tertiary', 0.150, 0.450,
   'Establishing what may have been affected before deciding anything is investigative work: gather the facts, then judge.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_B', 'CID11', 'tertiary', 0.150, 0.300,
   'Reporting and documenting according to procedure is the structure dimension observed as behaviour rather than self-reported as a preference.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_B', 'CID07', 'tertiary', 0.150, 1.000,
   'Raising it directly with the person responsible requires initiating a difficult conversation, which is communication under real cost.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_B', 'CID09', 'tertiary', 0.150, 1.000,
   'Telling a colleague their step was skipped means accepting resistance rather than routing around it, which is the boundary-setting dimension.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_C', 'CID15', 'primary', 0.700, 1.000,
   'Declared primary. All four options are responsible, so the item measures which responsible instinct fires first, not whether the candidate acts.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_C', 'CID06', 'secondary', 0.300, 0.700,
   'Declared secondary. A skipped control is a risk event, and the options differ in how directly they address the exposure it created.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_C', 'CID10', 'tertiary', 0.150, 0.600,
   'Establishing what may have been affected before deciding anything is investigative work: gather the facts, then judge.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_C', 'CID11', 'tertiary', 0.150, 1.000,
   'Reporting and documenting according to procedure is the structure dimension observed as behaviour rather than self-reported as a preference.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_C', 'CID07', 'tertiary', 0.150, 0.400,
   'Raising it directly with the person responsible requires initiating a difficult conversation, which is communication under real cost.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_C', 'CID09', 'tertiary', 0.150, 0.550,
   'Telling a colleague their step was skipped means accepting resistance rather than routing around it, which is the boundary-setting dimension.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_D', 'CID15', 'primary', 0.700, 0.850,
   'Declared primary. All four options are responsible, so the item measures which responsible instinct fires first, not whether the candidate acts.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_D', 'CID06', 'secondary', 0.300, 1.000,
   'Declared secondary. A skipped control is a risk event, and the options differ in how directly they address the exposure it created.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_D', 'CID10', 'tertiary', 0.150, 0.550,
   'Establishing what may have been affected before deciding anything is investigative work: gather the facts, then judge.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_D', 'CID11', 'tertiary', 0.150, 0.550,
   'Reporting and documenting according to procedure is the structure dimension observed as behaviour rather than self-reported as a preference.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_D', 'CID07', 'tertiary', 0.150, 0.300,
   'Raising it directly with the person responsible requires initiating a difficult conversation, which is communication under real cost.'),
  ('v3.1-draft-1', 'CQ03', 'CQ03_D', 'CID09', 'tertiary', 0.150, 0.700,
   'Telling a colleague their step was skipped means accepting resistance rather than routing around it, which is the boundary-setting dimension.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_A', 'CID16', 'primary', 0.700, 0.900,
   'Declared primary. The options differ in how much pressure each response absorbs before offloading the decision to someone else or to a group.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_A', 'CID10', 'secondary', 0.300, 1.000,
   'Declared secondary. Conflicting accounts are an evidence problem, and the options differ in how much they try to establish before acting.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_A', 'CID12', 'tertiary', 0.150, 0.450,
   'Deciding how to proceed and owning the outcome is independent decision-making observed at the moment it costs something.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_A', 'CID09', 'tertiary', 0.150, 0.550,
   'Two people contradicting each other is a live disagreement, and the options differ in willingness to engage with it directly.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_A', 'CID02', 'tertiary', 0.150, 0.350,
   'Taking direction of a situation, or convening the people in it, is leadership expressed as behaviour rather than as stated ambition.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_B', 'CID16', 'primary', 0.700, 1.000,
   'Declared primary. The options differ in how much pressure each response absorbs before offloading the decision to someone else or to a group.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_B', 'CID10', 'secondary', 0.300, 0.600,
   'Declared secondary. Conflicting accounts are an evidence problem, and the options differ in how much they try to establish before acting.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_B', 'CID12', 'tertiary', 0.150, 0.850,
   'Deciding how to proceed and owning the outcome is independent decision-making observed at the moment it costs something.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_B', 'CID09', 'tertiary', 0.150, 0.450,
   'Two people contradicting each other is a live disagreement, and the options differ in willingness to engage with it directly.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_B', 'CID02', 'tertiary', 0.150, 0.400,
   'Taking direction of a situation, or convening the people in it, is leadership expressed as behaviour rather than as stated ambition.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_C', 'CID16', 'primary', 0.700, 0.800,
   'Declared primary. The options differ in how much pressure each response absorbs before offloading the decision to someone else or to a group.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_C', 'CID10', 'secondary', 0.300, 0.250,
   'Declared secondary. Conflicting accounts are an evidence problem, and the options differ in how much they try to establish before acting.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_C', 'CID12', 'tertiary', 0.150, 1.000,
   'Deciding how to proceed and owning the outcome is independent decision-making observed at the moment it costs something.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_C', 'CID09', 'tertiary', 0.150, 0.850,
   'Two people contradicting each other is a live disagreement, and the options differ in willingness to engage with it directly.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_C', 'CID02', 'tertiary', 0.150, 1.000,
   'Taking direction of a situation, or convening the people in it, is leadership expressed as behaviour rather than as stated ambition.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_D', 'CID16', 'primary', 0.700, 0.600,
   'Declared primary. The options differ in how much pressure each response absorbs before offloading the decision to someone else or to a group.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_D', 'CID10', 'secondary', 0.300, 0.550,
   'Declared secondary. Conflicting accounts are an evidence problem, and the options differ in how much they try to establish before acting.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_D', 'CID12', 'tertiary', 0.150, 0.300,
   'Deciding how to proceed and owning the outcome is independent decision-making observed at the moment it costs something.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_D', 'CID09', 'tertiary', 0.150, 1.000,
   'Two people contradicting each other is a live disagreement, and the options differ in willingness to engage with it directly.'),
  ('v3.1-draft-1', 'CQ06', 'CQ06_D', 'CID02', 'tertiary', 0.150, 0.850,
   'Taking direction of a situation, or convening the people in it, is leadership expressed as behaviour rather than as stated ambition.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_A', 'CID05', 'primary', 0.700, 0.150,
   'Declared primary. The options run from solving the instance to removing the cause, which is exactly the short-to-long horizon this dimension describes.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_A', 'CID06', 'secondary', 0.300, 0.400,
   'Declared secondary. A recurring problem is an unmanaged risk, and the options differ in how much they treat it as one.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_A', 'CID02', 'tertiary', 0.150, 0.250,
   'Convening the affected people and driving to a resolution is coordination and influence, measured without asking whether the candidate wants to manage.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_A', 'CID11', 'tertiary', 0.150, 0.200,
   'Building a routine so the problem cannot recur is the structure dimension applied preventively rather than administratively.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_A', 'CID01', 'tertiary', 0.150, 1.000,
   'Solving it on the spot every time is hands-on, situation-near work: responsiveness rather than an absence of strategy.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_B', 'CID05', 'primary', 0.700, 1.000,
   'Declared primary. The options run from solving the instance to removing the cause, which is exactly the short-to-long horizon this dimension describes.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_B', 'CID06', 'secondary', 0.300, 0.850,
   'Declared secondary. A recurring problem is an unmanaged risk, and the options differ in how much they treat it as one.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_B', 'CID02', 'tertiary', 0.150, 0.350,
   'Convening the affected people and driving to a resolution is coordination and influence, measured without asking whether the candidate wants to manage.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_B', 'CID11', 'tertiary', 0.150, 0.550,
   'Building a routine so the problem cannot recur is the structure dimension applied preventively rather than administratively.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_B', 'CID01', 'tertiary', 0.150, 0.350,
   'Solving it on the spot every time is hands-on, situation-near work: responsiveness rather than an absence of strategy.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_C', 'CID05', 'primary', 0.700, 0.700,
   'Declared primary. The options run from solving the instance to removing the cause, which is exactly the short-to-long horizon this dimension describes.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_C', 'CID06', 'secondary', 0.300, 0.550,
   'Declared secondary. A recurring problem is an unmanaged risk, and the options differ in how much they treat it as one.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_C', 'CID02', 'tertiary', 0.150, 1.000,
   'Convening the affected people and driving to a resolution is coordination and influence, measured without asking whether the candidate wants to manage.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_C', 'CID11', 'tertiary', 0.150, 0.450,
   'Building a routine so the problem cannot recur is the structure dimension applied preventively rather than administratively.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_C', 'CID01', 'tertiary', 0.150, 0.500,
   'Solving it on the spot every time is hands-on, situation-near work: responsiveness rather than an absence of strategy.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_D', 'CID05', 'primary', 0.700, 0.850,
   'Declared primary. The options run from solving the instance to removing the cause, which is exactly the short-to-long horizon this dimension describes.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_D', 'CID06', 'secondary', 0.300, 1.000,
   'Declared secondary. A recurring problem is an unmanaged risk, and the options differ in how much they treat it as one.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_D', 'CID02', 'tertiary', 0.150, 0.400,
   'Convening the affected people and driving to a resolution is coordination and influence, measured without asking whether the candidate wants to manage.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_D', 'CID11', 'tertiary', 0.150, 1.000,
   'Building a routine so the problem cannot recur is the structure dimension applied preventively rather than administratively.'),
  ('v3.1-draft-1', 'CQ09', 'CQ09_D', 'CID01', 'tertiary', 0.150, 0.300,
   'Solving it on the spot every time is hands-on, situation-near work: responsiveness rather than an absence of strategy.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_A', 'CID15', 'primary', 0.700, 0.850,
   'Declared primary. All four responses to being wrong are creditable, so the item distinguishes style — verify, revise openly, consult, or understand the original reasoning.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_A', 'CID14', 'secondary', 0.300, 0.650,
   'Declared secondary. Being corrected is a learning event, and the options differ in how much they treat it as one.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_A', 'CID12', 'tertiary', 0.150, 1.000,
   'Working through the new information alone before changing anything is independent judgement; asking someone to look at it together is deliberately not.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_A', 'CID13', 'tertiary', 0.150, 0.250,
   'Bringing in a second perspective on your own possible error is collaboration chosen at the point where it is least comfortable.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_B', 'CID15', 'primary', 0.700, 1.000,
   'Declared primary. All four responses to being wrong are creditable, so the item distinguishes style — verify, revise openly, consult, or understand the original reasoning.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_B', 'CID14', 'secondary', 0.300, 0.850,
   'Declared secondary. Being corrected is a learning event, and the options differ in how much they treat it as one.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_B', 'CID12', 'tertiary', 0.150, 0.850,
   'Working through the new information alone before changing anything is independent judgement; asking someone to look at it together is deliberately not.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_B', 'CID13', 'tertiary', 0.150, 0.550,
   'Bringing in a second perspective on your own possible error is collaboration chosen at the point where it is least comfortable.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_C', 'CID15', 'primary', 0.700, 0.800,
   'Declared primary. All four responses to being wrong are creditable, so the item distinguishes style — verify, revise openly, consult, or understand the original reasoning.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_C', 'CID14', 'secondary', 0.300, 0.900,
   'Declared secondary. Being corrected is a learning event, and the options differ in how much they treat it as one.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_C', 'CID12', 'tertiary', 0.150, 0.200,
   'Working through the new information alone before changing anything is independent judgement; asking someone to look at it together is deliberately not.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_C', 'CID13', 'tertiary', 0.150, 1.000,
   'Bringing in a second perspective on your own possible error is collaboration chosen at the point where it is least comfortable.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_D', 'CID15', 'primary', 0.700, 0.750,
   'Declared primary. All four responses to being wrong are creditable, so the item distinguishes style — verify, revise openly, consult, or understand the original reasoning.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_D', 'CID14', 'secondary', 0.300, 1.000,
   'Declared secondary. Being corrected is a learning event, and the options differ in how much they treat it as one.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_D', 'CID12', 'tertiary', 0.150, 0.600,
   'Working through the new information alone before changing anything is independent judgement; asking someone to look at it together is deliberately not.'),
  ('v3.1-draft-1', 'CQ12', 'CQ12_D', 'CID13', 'tertiary', 0.150, 0.350,
   'Bringing in a second perspective on your own possible error is collaboration chosen at the point where it is least comfortable.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_A', 'CID01', 'primary', 0.700, 1.000,
   'Declared primary. The options differ in distance from the daily operation, which is what this dimension measures.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_A', 'CID13', 'secondary', 0.300, 0.550,
   'Declared secondary. Environment and company are inseparable: choosing a team is choosing shared responsibility.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_A', 'CID12', 'tertiary', 0.150, 0.400,
   'Preferring own responsibility and uninterrupted time is autonomy stated as a working condition rather than as a decision-making claim.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_A', 'CID04', 'tertiary', 0.150, 0.300,
   'Choosing to be close to systems you are responsible for is technical orientation expressed as where you want to sit, not as what you enjoy.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_A', 'CID08', 'tertiary', 0.150, 0.700,
   'Environments close to daily operations and to a team are where being useful to people is most immediate. Supporting evidence only; no environment is the strongest possible statement of service motivation.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_A', 'CID02', 'tertiary', 0.150, 0.350,
   'Preferring a shared-goal environment with close contact is consistent with leadership orientation without being decisive for it. Supporting evidence only.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_B', 'CID01', 'primary', 0.700, 0.550,
   'Declared primary. The options differ in distance from the daily operation, which is what this dimension measures.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_B', 'CID13', 'secondary', 0.300, 1.000,
   'Declared secondary. Environment and company are inseparable: choosing a team is choosing shared responsibility.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_B', 'CID12', 'tertiary', 0.150, 0.300,
   'Preferring own responsibility and uninterrupted time is autonomy stated as a working condition rather than as a decision-making claim.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_B', 'CID04', 'tertiary', 0.150, 0.300,
   'Choosing to be close to systems you are responsible for is technical orientation expressed as where you want to sit, not as what you enjoy.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_B', 'CID08', 'tertiary', 0.150, 0.650,
   'Environments close to daily operations and to a team are where being useful to people is most immediate. Supporting evidence only; no environment is the strongest possible statement of service motivation.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_B', 'CID02', 'tertiary', 0.150, 0.700,
   'Preferring a shared-goal environment with close contact is consistent with leadership orientation without being decisive for it. Supporting evidence only.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_C', 'CID01', 'primary', 0.700, 0.300,
   'Declared primary. The options differ in distance from the daily operation, which is what this dimension measures.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_C', 'CID13', 'secondary', 0.300, 0.200,
   'Declared secondary. Environment and company are inseparable: choosing a team is choosing shared responsibility.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_C', 'CID12', 'tertiary', 0.150, 1.000,
   'Preferring own responsibility and uninterrupted time is autonomy stated as a working condition rather than as a decision-making claim.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_C', 'CID04', 'tertiary', 0.150, 0.600,
   'Choosing to be close to systems you are responsible for is technical orientation expressed as where you want to sit, not as what you enjoy.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_C', 'CID08', 'tertiary', 0.150, 0.250,
   'Environments close to daily operations and to a team are where being useful to people is most immediate. Supporting evidence only; no environment is the strongest possible statement of service motivation.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_C', 'CID02', 'tertiary', 0.150, 0.200,
   'Preferring a shared-goal environment with close contact is consistent with leadership orientation without being decisive for it. Supporting evidence only.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_D', 'CID01', 'primary', 0.700, 0.450,
   'Declared primary. The options differ in distance from the daily operation, which is what this dimension measures.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_D', 'CID13', 'secondary', 0.300, 0.350,
   'Declared secondary. Environment and company are inseparable: choosing a team is choosing shared responsibility.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_D', 'CID12', 'tertiary', 0.150, 0.650,
   'Preferring own responsibility and uninterrupted time is autonomy stated as a working condition rather than as a decision-making claim.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_D', 'CID04', 'tertiary', 0.150, 1.000,
   'Choosing to be close to systems you are responsible for is technical orientation expressed as where you want to sit, not as what you enjoy.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_D', 'CID08', 'tertiary', 0.150, 0.300,
   'Environments close to daily operations and to a team are where being useful to people is most immediate. Supporting evidence only; no environment is the strongest possible statement of service motivation.'),
  ('v3.1-draft-1', 'CQ15', 'CQ15_D', 'CID02', 'tertiary', 0.150, 0.300,
   'Preferring a shared-goal environment with close contact is consistent with leadership orientation without being decisive for it. Supporting evidence only.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_A', 'CID10', 'primary', 0.700, 1.000,
   'Declared primary. The options differ in how much each prioritises establishing what actually happened over other legitimate follow-ups.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_A', 'CID03', 'secondary', 0.300, 0.850,
   'Declared secondary. Both establishing the cause and judging recurrence require reasoning from incomplete information.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_A', 'CID14', 'tertiary', 0.150, 0.600,
   'Turning an incident into something the organisation learns from is the learning dimension applied outward rather than to oneself.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_A', 'CID11', 'tertiary', 0.150, 0.450,
   'Securing the record before memory degrades is a genuinely expert instinct and is the structure dimension under time pressure.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_A', 'CID06', 'tertiary', 0.150, 0.700,
   'Asking whether it can happen again and what that would mean is risk awareness applied to a concrete event rather than in the abstract.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_B', 'CID10', 'primary', 0.700, 0.700,
   'Declared primary. The options differ in how much each prioritises establishing what actually happened over other legitimate follow-ups.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_B', 'CID03', 'secondary', 0.300, 0.450,
   'Declared secondary. Both establishing the cause and judging recurrence require reasoning from incomplete information.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_B', 'CID14', 'tertiary', 0.150, 0.400,
   'Turning an incident into something the organisation learns from is the learning dimension applied outward rather than to oneself.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_B', 'CID11', 'tertiary', 0.150, 1.000,
   'Securing the record before memory degrades is a genuinely expert instinct and is the structure dimension under time pressure.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_B', 'CID06', 'tertiary', 0.150, 0.600,
   'Asking whether it can happen again and what that would mean is risk awareness applied to a concrete event rather than in the abstract.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_C', 'CID10', 'primary', 0.700, 0.550,
   'Declared primary. The options differ in how much each prioritises establishing what actually happened over other legitimate follow-ups.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_C', 'CID03', 'secondary', 0.300, 0.900,
   'Declared secondary. Both establishing the cause and judging recurrence require reasoning from incomplete information.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_C', 'CID14', 'tertiary', 0.150, 0.500,
   'Turning an incident into something the organisation learns from is the learning dimension applied outward rather than to oneself.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_C', 'CID11', 'tertiary', 0.150, 0.500,
   'Securing the record before memory degrades is a genuinely expert instinct and is the structure dimension under time pressure.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_C', 'CID06', 'tertiary', 0.150, 1.000,
   'Asking whether it can happen again and what that would mean is risk awareness applied to a concrete event rather than in the abstract.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_D', 'CID10', 'primary', 0.700, 0.450,
   'Declared primary. The options differ in how much each prioritises establishing what actually happened over other legitimate follow-ups.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_D', 'CID03', 'secondary', 0.300, 0.600,
   'Declared secondary. Both establishing the cause and judging recurrence require reasoning from incomplete information.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_D', 'CID14', 'tertiary', 0.150, 1.000,
   'Turning an incident into something the organisation learns from is the learning dimension applied outward rather than to oneself.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_D', 'CID11', 'tertiary', 0.150, 0.550,
   'Securing the record before memory degrades is a genuinely expert instinct and is the structure dimension under time pressure.'),
  ('v3.1-draft-1', 'CQ17', 'CQ17_D', 'CID06', 'tertiary', 0.150, 0.750,
   'Asking whether it can happen again and what that would mean is risk awareness applied to a concrete event rather than in the abstract.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_A', 'CID08', 'primary', 0.700, 1.000,
   'Declared primary. The options differ in how much the satisfaction comes from someone else being better off.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_A', 'CID05', 'secondary', 0.300, 0.250,
   'Declared secondary. Finding meaning in something working better tomorrow than yesterday is a long-horizon orientation.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_A', 'CID02', 'tertiary', 0.150, 0.300,
   'Satisfaction from having supported someone who then moved forward is the ''developing others'' clause of this dimension, observed as motivation rather than ambition.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_A', 'CID14', 'tertiary', 0.150, 0.350,
   'Finding a day meaningful because you learned something you could not do before is the learning dimension stated without apology.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_A', 'CID13', 'tertiary', 0.150, 0.550,
   'Locating meaning in what the team delivered rather than in personal output is collaboration expressed as what counts as a good day.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_B', 'CID08', 'primary', 0.700, 0.550,
   'Declared primary. The options differ in how much the satisfaction comes from someone else being better off.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_B', 'CID05', 'secondary', 0.300, 1.000,
   'Declared secondary. Finding meaning in something working better tomorrow than yesterday is a long-horizon orientation.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_B', 'CID02', 'tertiary', 0.150, 0.500,
   'Satisfaction from having supported someone who then moved forward is the ''developing others'' clause of this dimension, observed as motivation rather than ambition.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_B', 'CID14', 'tertiary', 0.150, 0.650,
   'Finding a day meaningful because you learned something you could not do before is the learning dimension stated without apology.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_B', 'CID13', 'tertiary', 0.150, 0.450,
   'Locating meaning in what the team delivered rather than in personal output is collaboration expressed as what counts as a good day.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_C', 'CID08', 'primary', 0.700, 0.750,
   'Declared primary. The options differ in how much the satisfaction comes from someone else being better off.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_C', 'CID05', 'secondary', 0.300, 0.600,
   'Declared secondary. Finding meaning in something working better tomorrow than yesterday is a long-horizon orientation.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_C', 'CID02', 'tertiary', 0.150, 1.000,
   'Satisfaction from having supported someone who then moved forward is the ''developing others'' clause of this dimension, observed as motivation rather than ambition.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_C', 'CID14', 'tertiary', 0.150, 0.700,
   'Finding a day meaningful because you learned something you could not do before is the learning dimension stated without apology.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_C', 'CID13', 'tertiary', 0.150, 1.000,
   'Locating meaning in what the team delivered rather than in personal output is collaboration expressed as what counts as a good day.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_D', 'CID08', 'primary', 0.700, 0.300,
   'Declared primary. The options differ in how much the satisfaction comes from someone else being better off.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_D', 'CID05', 'secondary', 0.300, 0.450,
   'Declared secondary. Finding meaning in something working better tomorrow than yesterday is a long-horizon orientation.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_D', 'CID02', 'tertiary', 0.150, 0.250,
   'Satisfaction from having supported someone who then moved forward is the ''developing others'' clause of this dimension, observed as motivation rather than ambition.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_D', 'CID14', 'tertiary', 0.150, 1.000,
   'Finding a day meaningful because you learned something you could not do before is the learning dimension stated without apology.'),
  ('v3.1-draft-1', 'CQ20', 'CQ20_D', 'CID13', 'tertiary', 0.150, 0.250,
   'Locating meaning in what the team delivered rather than in personal output is collaboration expressed as what counts as a good day.')
ON CONFLICT (scoring_version, question_id, option_id, dimension_id) DO NOTHING;

DO $$
DECLARE
  _defver uuid;
  _items integer;
  _loadings integer;
  _options integer;
  _violations integer;
BEGIN
  SELECT id INTO _defver FROM public.cd_definition_versions
   WHERE assessment_id = 'security-career-discovery-v3'
     AND definition_version = '2026-scd-v3.1.0';

  IF _defver IS NULL THEN
    RAISE EXCEPTION 'v3.1 definition version was not registered';
  END IF;

  SELECT count(*) INTO _items FROM public.cd_definition_items
   WHERE definition_version_id = _defver;
  IF _items <> 20 THEN
    RAISE EXCEPTION 'expected 20 v3.1 registry items, found %', _items;
  END IF;

  IF (SELECT count(*) FROM public.cd_definition_items
       WHERE definition_version_id = _defver AND item_kind = 'scale') <> 12 THEN
    RAISE EXCEPTION 'expected 12 scale items';
  END IF;

  IF (SELECT count(*) FROM public.cd_definition_items
       WHERE definition_version_id = _defver AND item_kind = 'single_choice') <> 8 THEN
    RAISE EXCEPTION 'expected 8 single-choice items';
  END IF;

  SELECT count(*) INTO _loadings FROM public.cd_option_loadings
   WHERE scoring_version = 'v3.1-draft-1';
  IF _loadings <> 164 THEN
    RAISE EXCEPTION 'expected 164 option loadings, found %', _loadings;
  END IF;

  SELECT count(DISTINCT option_id) INTO _options FROM public.cd_option_loadings
   WHERE scoring_version = 'v3.1-draft-1';
  IF _options <> 32 THEN
    RAISE EXCEPTION 'expected 32 distinct options, found %', _options;
  END IF;

  SELECT count(*) INTO _violations
    FROM public.cd_validate_option_matrix('v3.1-draft-1');
  IF _violations <> 0 THEN
    RAISE EXCEPTION 'the seeded option matrix violates % set-level invariant(s)', _violations;
  END IF;

  IF (SELECT count(*) FROM public.cd_definition_items di
        JOIN public.cd_definition_versions dv ON dv.id = di.definition_version_id
       WHERE dv.definition_version = '2026-scd-v3.0.0') <> 42 THEN
    RAISE EXCEPTION 'v3.0 registry was disturbed by the v3.1 seed';
  END IF;

  RAISE NOTICE 'Career Discovery v3.1 instrument seeded and verified: 20 items, 164 loadings.';
END $$;