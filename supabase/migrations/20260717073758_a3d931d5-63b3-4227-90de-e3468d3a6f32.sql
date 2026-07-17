-- Sprint 09C Phase C: Career Intelligence Graph content seed
-- Additive only. Idempotent via slug/canonical_key/stable_key ON CONFLICT.
-- Graph version: cig-2026.07-09C.1

DO $$ BEGIN PERFORM 1; END $$;

-- =====================================================================
-- 1. PROFESSION FAMILIES (13)
-- =====================================================================
INSERT INTO public.cig_profession_families (slug, title_sv, title_en, description_sv, description_en, content_status, graph_version, last_verified) VALUES
 ('operational-security','Operativ säkerhet','Operational security','Bevakning, larmövervakning och operativa säkerhetsinsatser.','Guarding, alarm monitoring and operational security work.','published','cig-2026.07-09C.1',now()),
 ('physical-protective-security','Fysisk skyddssäkerhet','Physical protective security','Skydd av skyddsobjekt och samhällsviktig verksamhet.','Protection of designated protective objects and critical assets.','published','cig-2026.07-09C.1',now()),
 ('public-order','Ordning och trygghet','Public order & safety','Upprätthållande av allmän ordning i offentlig och privat miljö.','Maintaining public order in public and private settings.','published','cig-2026.07-09C.1',now()),
 ('security-technology','Säkerhetsteknik','Security technology','Installation, konfiguration och underhåll av säkerhetssystem.','Installation, configuration and maintenance of security systems.','published','cig-2026.07-09C.1',now()),
 ('cyber-information-security','Cyber- och informationssäkerhet','Cyber & information security','Skydd av information och digitala tillgångar.','Protection of information and digital assets.','published','cig-2026.07-09C.1',now()),
 ('risk-crisis-management','Risk- och krishantering','Risk & crisis management','Riskbedömning, kontinuitet och krishantering.','Risk assessment, continuity and crisis response.','published','cig-2026.07-09C.1',now()),
 ('corporate-security-leadership','Företagssäkerhet och ledarskap','Corporate security & leadership','Ledning och styrning av företags säkerhetsfunktion.','Leadership and governance of corporate security.','published','cig-2026.07-09C.1',now()),
 ('investigation-intelligence','Utredning och underrättelse','Investigation & intelligence','Utredning, analys och underrättelsearbete.','Investigation, analysis and intelligence work.','published','cig-2026.07-09C.1',now()),
 ('emergency-rescue','Räddning och akutinsats','Emergency & rescue','Räddningstjänst, ambulans och akutinsatser.','Rescue services, EMS and emergency response.','published','cig-2026.07-09C.1',now()),
 ('defence','Försvar','Defence','Militär tjänstgöring inom Försvarsmakten.','Military service within the Swedish Armed Forces.','published','cig-2026.07-09C.1',now()),
 ('law-enforcement','Rättsvårdande','Law enforcement','Polisiär verksamhet och rättsvårdande myndighetsarbete.','Police work and law-enforcement authority activity.','published','cig-2026.07-09C.1',now()),
 ('private-protection-close-security','Personskydd','Private protection & close security','Kvalificerat personskydd i civil sektor.','Qualified close protection in the civilian sector.','published','cig-2026.07-09C.1',now()),
 ('customs-border','Tull och gräns','Customs & border','Tull- och gränskontrollverksamhet.','Customs and border-control work.','published','cig-2026.07-09C.1',now())
ON CONFLICT (slug) DO UPDATE SET
  title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en,
  description_sv=EXCLUDED.description_sv, description_en=EXCLUDED.description_en,
  content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version,
  last_verified=EXCLUDED.last_verified, updated_at=now();

-- =====================================================================
-- 2. SECTORS
-- =====================================================================
INSERT INTO public.cig_sectors (slug, title_sv, title_en, content_status, graph_version) VALUES
 ('retail','Handel','Retail','published','cig-2026.07-09C.1'),
 ('transport-logistics','Transport och logistik','Transport & logistics','published','cig-2026.07-09C.1'),
 ('healthcare','Hälso- och sjukvård','Healthcare','published','cig-2026.07-09C.1'),
 ('public-administration','Offentlig förvaltning','Public administration','published','cig-2026.07-09C.1'),
 ('financial-services','Finansiella tjänster','Financial services','published','cig-2026.07-09C.1'),
 ('critical-infrastructure','Samhällsviktig infrastruktur','Critical infrastructure','published','cig-2026.07-09C.1'),
 ('events-hospitality','Evenemang och besöksnäring','Events & hospitality','published','cig-2026.07-09C.1'),
 ('aviation','Luftfart','Aviation','published','cig-2026.07-09C.1'),
 ('maritime','Sjöfart','Maritime','published','cig-2026.07-09C.1'),
 ('defence-industry','Försvarsindustri','Defence industry','published','cig-2026.07-09C.1'),
 ('technology','Teknik och IT','Technology & IT','published','cig-2026.07-09C.1')
ON CONFLICT (slug) DO UPDATE SET title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 3. EMPLOYER TYPES
-- =====================================================================
INSERT INTO public.cig_employer_types (slug, title_sv, title_en, content_status, graph_version) VALUES
 ('authorised-security-company','Auktoriserat bevakningsföretag','Authorised security company','published','cig-2026.07-09C.1'),
 ('government-authority','Statlig myndighet','Government authority','published','cig-2026.07-09C.1'),
 ('municipality','Kommun','Municipality','published','cig-2026.07-09C.1'),
 ('private-employer','Privat arbetsgivare','Private employer','published','cig-2026.07-09C.1'),
 ('regulator','Tillsynsmyndighet','Regulator','published','cig-2026.07-09C.1'),
 ('emergency-service','Räddningstjänst','Emergency service','published','cig-2026.07-09C.1'),
 ('armed-forces','Försvarsmakten','Swedish Armed Forces','published','cig-2026.07-09C.1'),
 ('police-authority','Polismyndigheten','Swedish Police Authority','published','cig-2026.07-09C.1'),
 ('customs-authority','Tullverket','Swedish Customs','published','cig-2026.07-09C.1')
ON CONFLICT (slug) DO UPDATE SET title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 4. WORK ENVIRONMENTS
-- =====================================================================
INSERT INTO public.cig_work_environments (slug, title_sv, title_en, content_status, graph_version) VALUES
 ('indoor-static-post','Inomhus, stationär post','Indoor, static post','published','cig-2026.07-09C.1'),
 ('outdoor-patrol','Utomhus, rondering','Outdoor patrol','published','cig-2026.07-09C.1'),
 ('control-room','Kontrollrum / larmcentral','Control room / alarm centre','published','cig-2026.07-09C.1'),
 ('field-technical','Fält, tekniskt arbete','Field, technical work','published','cig-2026.07-09C.1'),
 ('office','Kontor','Office','published','cig-2026.07-09C.1'),
 ('mixed-shift','Skiftgång, blandad miljö','Shift-based, mixed environment','published','cig-2026.07-09C.1'),
 ('high-risk-environment','Högriskmiljö','High-risk environment','published','cig-2026.07-09C.1')
ON CONFLICT (slug) DO UPDATE SET title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 5. WORK PREFERENCES
-- =====================================================================
INSERT INTO public.cig_work_preferences (slug, title_sv, title_en, content_status, graph_version) VALUES
 ('structured-routine','Struktur och rutin','Structure and routine','published','cig-2026.07-09C.1'),
 ('variable-tasks','Varierande arbetsuppgifter','Variable tasks','published','cig-2026.07-09C.1'),
 ('team-work','Lagarbete','Team work','published','cig-2026.07-09C.1'),
 ('autonomous-work','Självständigt arbete','Autonomous work','published','cig-2026.07-09C.1'),
 ('public-interaction','Kundmöten och allmänhet','Public and customer interaction','published','cig-2026.07-09C.1'),
 ('analytical-focus','Analytiskt fokus','Analytical focus','published','cig-2026.07-09C.1'),
 ('physical-activity','Fysiskt aktivt arbete','Physically active work','published','cig-2026.07-09C.1'),
 ('shift-work','Skiftarbete','Shift work','published','cig-2026.07-09C.1')
ON CONFLICT (slug) DO UPDATE SET title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 6. COMPETENCIES
-- =====================================================================
INSERT INTO public.cig_competencies (slug, title_sv, title_en, description_sv, description_en, content_status, graph_version) VALUES
 ('situational-awareness','Situationsmedvetenhet','Situational awareness',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('de-escalation','Konflikthantering','De-escalation',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('report-writing','Rapportskrivning','Report writing',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('access-control','Passagekontroll','Access control',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('emergency-response','Nödåtgärd och första hjälpen','Emergency response and first aid',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('risk-assessment','Riskbedömning','Risk assessment',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('regulatory-compliance','Regelefterlevnad','Regulatory compliance',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('incident-investigation','Incidentutredning','Incident investigation',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('threat-analysis','Hotanalys','Threat analysis',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('leadership','Ledarskap','Leadership',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('technical-installation','Teknisk installation','Technical installation',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('systems-troubleshooting','Systemfelsökning','Systems troubleshooting',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('information-security','Informationssäkerhet (praktisk)','Information security (applied)',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('crisis-communication','Kriskommunikation','Crisis communication',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('close-protection','Personskyddsarbete','Close protection',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('physical-fitness','Fysisk arbetsförmåga','Physical fitness',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('surveillance-operations','Övervakningsoperationer','Surveillance operations',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('interviewing-technique','Intervjuteknik','Interviewing technique',NULL,NULL,'published','cig-2026.07-09C.1')
ON CONFLICT (slug) DO UPDATE SET title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 7. SKILLS
-- =====================================================================
INSERT INTO public.cig_skills (slug, title_sv, title_en, description_sv, description_en, content_status, graph_version) VALUES
 ('cctv-operation','CCTV-hantering','CCTV operation',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('alarm-system-operation','Larmhantering','Alarm system operation',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('access-control-systems','Passersystem','Access control systems',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('siem-monitoring','SIEM-övervakning','SIEM monitoring',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('vulnerability-assessment','Sårbarhetsbedömning','Vulnerability assessment',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('report-drafting-legal','Rapportskrivning (rättsligt)','Report drafting (legal)',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('first-aid-hlr','Första hjälpen och HLR','First aid & CPR',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('defensive-tactics','Självskyddsteknik','Defensive tactics',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('radio-communication','Radiokommunikation','Radio communication',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('driving-professional','Professionell körning','Professional driving',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('data-analysis','Dataanalys','Data analysis',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('digital-forensics-basics','Digital forensik (grund)','Digital forensics (basic)',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('policy-writing','Policyutformning','Policy drafting',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('audit-execution','Revisionsutförande','Audit execution',NULL,NULL,'published','cig-2026.07-09C.1')
ON CONFLICT (slug) DO UPDATE SET title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 8. KNOWLEDGE AREAS
-- =====================================================================
INSERT INTO public.cig_knowledge_areas (slug, title_sv, title_en, description_sv, description_en, content_status, graph_version) VALUES
 ('swedish-security-law','Svensk säkerhetsrätt','Swedish security law',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('protective-security-act','Säkerhetsskyddslagen (2018:585)','Protective Security Act (2018:585)',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('gdpr-dataskydd','GDPR och dataskydd','GDPR & data protection',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('criminal-law-basics','Straffrätt (grund)','Criminal law (basic)',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('emergency-procedures','Nödrutiner','Emergency procedures',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('iso-27001','ISO/IEC 27001','ISO/IEC 27001',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('nis2-directive','NIS2-direktivet','NIS2 directive',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('civil-preparedness','Civilt försvar och krisberedskap','Civil defence and crisis preparedness',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('aml-cft-regulation','AML/CTF-regelverk','AML/CTF regulation',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('aviation-security-regs','Luftfartsskyddsregler (EU)','Aviation security regulations (EU)',NULL,NULL,'published','cig-2026.07-09C.1')
ON CONFLICT (slug) DO UPDATE SET title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 9. EXPERIENCE TYPES
-- =====================================================================
INSERT INTO public.cig_experience_types (slug, title_sv, title_en, description_sv, description_en, content_status, graph_version) VALUES
 ('guarding-experience','Bevakningserfarenhet','Guarding experience',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('technical-installation-experience','Erfarenhet av teknisk installation','Technical installation experience',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('leadership-experience','Ledarerfarenhet','Leadership experience',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('investigation-experience','Utredningserfarenhet','Investigation experience',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('it-operations-experience','IT-drift och SOC-erfarenhet','IT operations & SOC experience',NULL,NULL,'published','cig-2026.07-09C.1'),
 ('emergency-response-experience','Erfarenhet av akutinsats','Emergency response experience',NULL,NULL,'published','cig-2026.07-09C.1')
ON CONFLICT (slug) DO UPDATE SET title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 10. EDUCATION PATHWAYS
-- =====================================================================
INSERT INTO public.cig_education_pathways (slug, title_sv, title_en, description_sv, description_en, typical_duration_months, content_status, graph_version) VALUES
 ('gymnasium-general','Gymnasieexamen','Upper secondary diploma',NULL,NULL,36,'published','cig-2026.07-09C.1'),
 ('vaktar-utbildning','Väktarutbildning (VU1/VU2/VU3)','Security officer training (VU1/VU2/VU3)',NULL,NULL,3,'published','cig-2026.07-09C.1'),
 ('ordningsvakt-utbildning','Ordningsvaktsutbildning (Polismyndigheten)','Public order guard training (Police Authority)',NULL,NULL,2,'published','cig-2026.07-09C.1'),
 ('skyddsvakt-utbildning','Skyddsvaktsutbildning','Protective security guard training',NULL,NULL,1,'published','cig-2026.07-09C.1'),
 ('polisutbildning','Polisprogrammet','Police training programme',NULL,NULL,30,'published','cig-2026.07-09C.1'),
 ('grundutbildning-varnplikt','Grundutbildning med värnplikt (GU)','Basic military training (Swedish conscription)',NULL,NULL,11,'published','cig-2026.07-09C.1'),
 ('officersprogrammet','Officersprogrammet','Officer programme',NULL,NULL,36,'published','cig-2026.07-09C.1'),
 ('yh-sakerhet','YH-utbildning inom säkerhet','Higher vocational training in security',NULL,NULL,24,'published','cig-2026.07-09C.1'),
 ('cybersecurity-bachelor','Kandidatprogram cybersäkerhet','Bachelor programme in cybersecurity',NULL,NULL,36,'published','cig-2026.07-09C.1'),
 ('brandman-msb','MSB:s brandmansutbildning','MSB firefighter training',NULL,NULL,24,'published','cig-2026.07-09C.1'),
 ('tull-grundutbildning','Tullverkets grundutbildning','Swedish Customs basic training',NULL,NULL,10,'published','cig-2026.07-09C.1')
ON CONFLICT (slug) DO UPDATE SET title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, typical_duration_months=EXCLUDED.typical_duration_months, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 11. CERTIFICATIONS
-- =====================================================================
INSERT INTO public.cig_certifications (slug, title_sv, title_en, description_sv, description_en, issuer_sv, issuer_en, content_status, graph_version) VALUES
 ('cissp','CISSP','CISSP',NULL,NULL,'ISC2','ISC2','published','cig-2026.07-09C.1'),
 ('cism','CISM','CISM',NULL,NULL,'ISACA','ISACA','published','cig-2026.07-09C.1'),
 ('ceh','CEH','Certified Ethical Hacker',NULL,NULL,'EC-Council','EC-Council','published','cig-2026.07-09C.1'),
 ('comptia-security-plus','CompTIA Security+','CompTIA Security+',NULL,NULL,'CompTIA','CompTIA','published','cig-2026.07-09C.1'),
 ('iso27001-lead-auditor','ISO/IEC 27001 Lead Auditor','ISO/IEC 27001 Lead Auditor',NULL,NULL,'Ackrediterat certifieringsorgan','Accredited certification body','published','cig-2026.07-09C.1'),
 ('cams','CAMS','Certified Anti-Money Laundering Specialist',NULL,NULL,'ACAMS','ACAMS','published','cig-2026.07-09C.1'),
 ('gcih','GCIH','GIAC Certified Incident Handler',NULL,NULL,'GIAC','GIAC','published','cig-2026.07-09C.1'),
 ('oscp','OSCP','Offensive Security Certified Professional',NULL,NULL,'Offensive Security','Offensive Security','published','cig-2026.07-09C.1')
ON CONFLICT (slug) DO UPDATE SET title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, issuer_sv=EXCLUDED.issuer_sv, issuer_en=EXCLUDED.issuer_en, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 12. FORMAL REQUIREMENTS
-- =====================================================================
INSERT INTO public.cig_formal_requirements (slug, title_sv, title_en, description_sv, description_en, country, jurisdiction, authority_sv, authority_en, legal_basis, content_status, graph_version) VALUES
 ('vaktar-godkannande','Godkännande som väktare','Approval as security officer (väktare)','Personligt godkännande efter genomförd väktarutbildning och lämplighetsprövning.','Personal approval issued after completing security officer training and a suitability review.','SE','SE','Länsstyrelsen','County Administrative Board (Länsstyrelsen)','Lag (1974:191) om bevakningsföretag','published','cig-2026.07-09C.1'),
 ('ordningsvakt-forordnande','Förordnande som ordningsvakt','Appointment as public order guard','Förordnande som utfärdas av Polismyndigheten efter genomförd utbildning.','Appointment issued by the Swedish Police Authority after completed training.','SE','SE','Polismyndigheten','Swedish Police Authority','Lag (1980:578) om ordningsvakter','published','cig-2026.07-09C.1'),
 ('skyddsvakt-godkannande','Godkännande som skyddsvakt','Approval as protective security guard','Godkännande utfärdas av Länsstyrelsen eller Försvarsmakten beroende på skyddsobjekt.','Approval is issued by the County Administrative Board or the Swedish Armed Forces depending on the protective object.','SE','SE','Länsstyrelsen / Försvarsmakten','County Administrative Board / Swedish Armed Forces','Skyddslagen (2010:305)','published','cig-2026.07-09C.1'),
 ('bevakningsforetag-auktorisation','Auktorisation av bevakningsföretag','Authorisation of security company','Auktorisation krävs för att bedriva bevakningsverksamhet.','Authorisation is required to operate a security business.','SE','SE','Länsstyrelsen','County Administrative Board','Lag (1974:191) om bevakningsföretag','published','cig-2026.07-09C.1'),
 ('sakerhetsprovning-sf','Säkerhetsprövning','Security screening (Säkerhetsprövning)','Prövning enligt säkerhetsskyddslagen inför säkerhetskänslig verksamhet.','Screening under the Protective Security Act prior to security-sensitive work.','SE','SE','Verksamhetsutövaren / Säkerhetspolisen','Operator / Swedish Security Service','Säkerhetsskyddslagen (2018:585)','published','cig-2026.07-09C.1'),
 ('livvakt-godkannande','Godkännande för livvaktsverksamhet','Approval for bodyguard duties','Särskilt godkännande för livvaktsuppdrag.','Special approval for bodyguard assignments.','SE','SE','Länsstyrelsen','County Administrative Board','Lag (1974:191) om bevakningsföretag','published','cig-2026.07-09C.1'),
 ('dpo-designation','Utnämning av dataskyddsombud','Designation of Data Protection Officer','Utnämning enligt GDPR artikel 37.','Designation under GDPR Article 37.','SE','EU','Verksamhetsutövaren; tillsyn av IMY','Controller; supervised by IMY','GDPR art. 37; Dataskyddslagen (2018:218)','published','cig-2026.07-09C.1'),
 ('aviation-security-cert','Certifiering säkerhetskontrollant flygplats','Aviation security officer certification','Certifiering enligt EU-förordning 2015/1998.','Certification under EU Regulation 2015/1998.','SE','EU','Transportstyrelsen','Swedish Transport Agency','Kommissionens genomförandeförordning (EU) 2015/1998','published','cig-2026.07-09C.1')
ON CONFLICT (slug) DO UPDATE SET title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, description_sv=EXCLUDED.description_sv, description_en=EXCLUDED.description_en, country=EXCLUDED.country, jurisdiction=EXCLUDED.jurisdiction, authority_sv=EXCLUDED.authority_sv, authority_en=EXCLUDED.authority_en, legal_basis=EXCLUDED.legal_basis, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 13. SOURCE REFERENCES
-- =====================================================================
INSERT INTO public.cig_source_references (stable_key, organisation, title, url, jurisdiction, language, source_type, link_status, content_status, graph_version) VALUES
 ('src.lansstyrelsen.vaktare','Länsstyrelsen','Väktare – godkännande','https://www.lansstyrelsen.se/','SE','sv','official','needs_check','published','cig-2026.07-09C.1'),
 ('src.polisen.ordningsvakt','Polismyndigheten','Ordningsvakt – förordnande','https://polisen.se/','SE','sv','official','needs_check','published','cig-2026.07-09C.1'),
 ('src.lansstyrelsen.skyddsvakt','Länsstyrelsen','Skyddsvakt – godkännande','https://www.lansstyrelsen.se/','SE','sv','official','needs_check','published','cig-2026.07-09C.1'),
 ('src.forsvarsmakten.skyddsvakt','Försvarsmakten','Skyddsvakter inom Försvarsmakten','https://www.forsvarsmakten.se/','SE','sv','official','needs_check','published','cig-2026.07-09C.1'),
 ('src.riksdagen.bevakningslag','Sveriges Riksdag','Lag (1974:191) om bevakningsföretag','https://www.riksdagen.se/sv/dokument-lagar/dokument/svensk-forfattningssamling/lag-1974191-om-bevakningsforetag_sfs-1974-191','SE','sv','primary','needs_check','published','cig-2026.07-09C.1'),
 ('src.riksdagen.ordningsvakt','Sveriges Riksdag','Lag (1980:578) om ordningsvakter','https://www.riksdagen.se/','SE','sv','primary','needs_check','published','cig-2026.07-09C.1'),
 ('src.riksdagen.skyddslag','Sveriges Riksdag','Skyddslagen (2010:305)','https://www.riksdagen.se/','SE','sv','primary','needs_check','published','cig-2026.07-09C.1'),
 ('src.riksdagen.sakerhetsskydd','Sveriges Riksdag','Säkerhetsskyddslagen (2018:585)','https://www.riksdagen.se/','SE','sv','primary','needs_check','published','cig-2026.07-09C.1'),
 ('src.imy.gdpr','IMY','GDPR och dataskydd','https://www.imy.se/','SE','sv','official','needs_check','published','cig-2026.07-09C.1'),
 ('src.msb.brandman','MSB','Utbildning till brandman','https://www.msb.se/','SE','sv','official','needs_check','published','cig-2026.07-09C.1'),
 ('src.polisen.polisutbildning','Polismyndigheten','Bli polis','https://polisen.se/blipolis/','SE','sv','official','needs_check','published','cig-2026.07-09C.1'),
 ('src.forsvarsmakten.jobb','Försvarsmakten','Jobb och utbildning','https://www.forsvarsmakten.se/sv/jobb-och-utbildning/','SE','sv','official','needs_check','published','cig-2026.07-09C.1'),
 ('src.tullverket.jobb','Tullverket','Jobba hos oss','https://www.tullverket.se/','SE','sv','official','needs_check','published','cig-2026.07-09C.1'),
 ('src.transportstyrelsen.aviation','Transportstyrelsen','Luftfartsskydd','https://www.transportstyrelsen.se/','SE','sv','official','needs_check','published','cig-2026.07-09C.1'),
 ('src.eur-lex.2015-1998','EUR-Lex','Kommissionens genomförandeförordning (EU) 2015/1998','https://eur-lex.europa.eu/eli/reg_impl/2015/1998/oj','EU','en','primary','needs_check','published','cig-2026.07-09C.1'),
 ('src.esco.portal','European Commission','ESCO – European classification of Skills/Competences','https://esco.ec.europa.eu/','EU','en','official','needs_check','published','cig-2026.07-09C.1'),
 ('src.scb.ssyk','SCB','SSYK 2012','https://www.scb.se/dokumentation/klassifikationer-och-standarder/standard-for-svensk-yrkesklassificering-ssyk/','SE','sv','official','needs_check','published','cig-2026.07-09C.1')
ON CONFLICT (stable_key) DO UPDATE SET organisation=EXCLUDED.organisation, title=EXCLUDED.title, url=EXCLUDED.url, jurisdiction=EXCLUDED.jurisdiction, source_type=EXCLUDED.source_type, content_status=EXCLUDED.content_status, graph_version=EXCLUDED.graph_version, updated_at=now();

-- =====================================================================
-- 14. PROFESSIONS — Level A (20)
-- =====================================================================
INSERT INTO public.cig_professions
 (slug, canonical_key, primary_family_id, quality_level, content_status, is_regulated, country, jurisdiction,
  title_sv, title_en, summary_sv, summary_en, disclaimer_sv, disclaimer_en, graph_version, last_verified)
SELECT v.slug, v.canonical_key,
       (SELECT id FROM public.cig_profession_families WHERE slug = v.family_slug),
       v.quality_level::cig_quality_level, v.content_status::cig_content_status,
       v.is_regulated, v.country, v.jurisdiction,
       v.title_sv, v.title_en, v.summary_sv, v.summary_en, v.disclaimer_sv, v.disclaimer_en,
       'cig-2026.07-09C.1', now()
FROM (VALUES
 ('vaktare','se.security.vaktare','operational-security','A','published',true,'SE','SE','Väktare','Security Officer (Väktare)','Reglerad bevakningsyrkesroll som kräver väktarutbildning och godkännande av Länsstyrelsen.','Regulated guarding role requiring formal training and approval from the County Administrative Board.',NULL,NULL),
 ('ordningsvakt','se.security.ordningsvakt','public-order','A','published',true,'SE','SE','Ordningsvakt','Public Order Guard','Reglerad roll för att upprätthålla allmän ordning; kräver förordnande av Polismyndigheten.','Regulated role for maintaining public order; requires appointment by the Swedish Police Authority.',NULL,NULL),
 ('skyddsvakt','se.security.skyddsvakt','physical-protective-security','A','published',true,'SE','SE','Skyddsvakt','Protective Security Guard','Reglerad roll för bevakning av skyddsobjekt enligt skyddslagen.','Regulated role for guarding designated protective objects under the Protective Objects Act.',NULL,NULL),
 ('sakerhetstekniker','se.security.sakerhetstekniker','security-technology','A','published',false,'SE','SE','Säkerhetstekniker','Security Technician','Arbetar med installation, driftsättning och underhåll av säkerhetssystem.','Installs, commissions and maintains security systems.',NULL,NULL),
 ('sakerhetssamordnare','se.security.sakerhetssamordnare','corporate-security-leadership','A','published',false,'SE','SE','Säkerhetssamordnare','Security Coordinator','Samordnar organisationens säkerhetsarbete utan operativ myndighetsutövning.','Coordinates an organisation''s security activities without exercising public authority.',NULL,NULL),
 ('sakerhetschef','se.security.sakerhetschef','corporate-security-leadership','A','published',false,'SE','SE','Säkerhetschef','Head of Security','Leder företagets säkerhetsfunktion och rapporterar till ledningen.','Leads the corporate security function and reports to executive management.',NULL,NULL),
 ('risk-manager','se.security.riskmanager','risk-crisis-management','A','published',false,'SE','SE','Riskchef','Risk Manager','Identifierar, bedömer och styr organisationens risker.','Identifies, assesses and steers organisational risk.',NULL,NULL),
 ('krisberedskapssamordnare','se.security.krisberedskapssamordnare','risk-crisis-management','A','published',false,'SE','SE','Krisberedskapssamordnare','Crisis Preparedness Coordinator','Samordnar planering och övning för kris och kontinuitet.','Coordinates planning and exercises for crisis and continuity.',NULL,NULL),
 ('informationssakerhetsspecialist','se.security.informationssakerhetsspecialist','cyber-information-security','A','published',false,'SE','SE','Informationssäkerhetsspecialist','Information Security Specialist','Arbetar med styrning och skydd av informationstillgångar.','Governs and protects information assets across an organisation.',NULL,NULL),
 ('cybersakerhetsanalytiker','se.security.cybersakerhetsanalytiker','cyber-information-security','A','published',false,'SE','SE','Cybersäkerhetsanalytiker','Cybersecurity Analyst','Analyserar hot och sårbarheter i digitala system.','Analyses threats and vulnerabilities in digital systems.',NULL,NULL),
 ('sakerhetsutredare','se.security.sakerhetsutredare','investigation-intelligence','A','published',false,'SE','SE','Säkerhetsutredare','Security Investigator','Utreder säkerhetshändelser i företag och organisationer.','Investigates security incidents inside companies and organisations.',NULL,NULL),
 ('larmoperator','se.security.larmoperator','operational-security','A','published',false,'SE','SE','Larmoperatör','Alarm Centre Operator','Arbetar i larmcentral med prioritering och åtgärd av inkomna larm.','Works in an alarm centre triaging and dispatching incoming alarms.',NULL,NULL),
 ('personskyddsvakt','se.security.personskydd','private-protection-close-security','A','published',true,'SE','SE','Personskyddsvakt','Close Protection Officer','Kvalificerat personskyddsarbete inom auktoriserat bevakningsföretag.','Qualified close-protection work within an authorised security company.',NULL,NULL),
 ('flygplatssakerhet','se.security.flygplatssakerhet','operational-security','A','published',true,'SE','EU','Säkerhetskontrollant flygplats','Airport Security Officer','Genomför säkerhetskontroll enligt EU-luftfartsskyddsregler.','Performs security screening under EU aviation-security rules.',NULL,NULL),
 ('polis','se.police.polis','law-enforcement','A','published',true,'SE','SE','Polis','Police Officer','Polisyrket kräver antagning till polisprogrammet via Polismyndigheten.','Becoming a police officer requires admission to the police programme via the Swedish Police Authority.','Formell behörighet, antagning och urval beslutas av ansvarig myndighet (Polismyndigheten). CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the responsible authority (Swedish Police Authority). CQrityjob provides career guidance, not admission decisions.'),
 ('civil-utredare','se.police.civil-utredare','investigation-intelligence','A','published',true,'SE','SE','Civil utredare (polis)','Civilian Investigator (Police)','Civil roll som utreder ärenden inom Polismyndigheten.','Civilian role investigating cases within the Swedish Police Authority.','Formell behörighet, antagning och urval beslutas av Polismyndigheten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Police Authority. CQrityjob provides career guidance, not admission decisions.'),
 ('soldat','se.armed-forces.soldat','defence','A','published',true,'SE','SE','Soldat','Soldier','Grundläggande militär tjänstgöring inom Försvarsmakten.','Basic military service within the Swedish Armed Forces.','Formell behörighet, antagning och urval beslutas av Försvarsmakten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Armed Forces. CQrityjob provides career guidance, not admission decisions.'),
 ('officer','se.armed-forces.officer','defence','A','published',true,'SE','SE','Officer','Officer','Officersyrke inom Försvarsmakten efter Officersprogrammet.','Officer career within the Swedish Armed Forces after the Officer Programme.','Formell behörighet, antagning och urval beslutas av Försvarsmakten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Armed Forces. CQrityjob provides career guidance, not admission decisions.'),
 ('tulltjansteman','se.customs.tulltjansteman','customs-border','A','published',true,'SE','SE','Tulltjänsteman','Customs Officer','Genomför tullkontroll och gränsverksamhet inom Tullverket.','Performs customs control and border work within Swedish Customs.','Formell behörighet, antagning och urval beslutas av Tullverket. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by Swedish Customs. CQrityjob provides career guidance, not admission decisions.'),
 ('brandman','se.rescue.brandman','emergency-rescue','A','published',true,'SE','SE','Brandman','Firefighter','Arbetar operativt inom räddningstjänsten efter MSB:s utbildning.','Works operationally in the rescue services after MSB training.',NULL,NULL)
) AS v(slug,canonical_key,family_slug,quality_level,content_status,is_regulated,country,jurisdiction,title_sv,title_en,summary_sv,summary_en,disclaimer_sv,disclaimer_en)
ON CONFLICT (canonical_key) DO UPDATE SET
  slug=EXCLUDED.slug, primary_family_id=EXCLUDED.primary_family_id, quality_level=EXCLUDED.quality_level,
  content_status=EXCLUDED.content_status, is_regulated=EXCLUDED.is_regulated,
  country=EXCLUDED.country, jurisdiction=EXCLUDED.jurisdiction,
  title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, summary_sv=EXCLUDED.summary_sv, summary_en=EXCLUDED.summary_en,
  disclaimer_sv=EXCLUDED.disclaimer_sv, disclaimer_en=EXCLUDED.disclaimer_en,
  graph_version=EXCLUDED.graph_version, last_verified=EXCLUDED.last_verified, updated_at=now();

-- =====================================================================
-- 14b. PROFESSIONS — Level B (published + draft)
-- =====================================================================
INSERT INTO public.cig_professions
 (slug, canonical_key, primary_family_id, quality_level, content_status, is_regulated, country, jurisdiction,
  title_sv, title_en, summary_sv, summary_en, disclaimer_sv, disclaimer_en, graph_version, last_verified)
SELECT v.slug, v.canonical_key,
       (SELECT id FROM public.cig_profession_families WHERE slug = v.family_slug),
       v.quality_level::cig_quality_level, v.content_status::cig_content_status,
       v.is_regulated, v.country, v.jurisdiction,
       v.title_sv, v.title_en, v.summary_sv, v.summary_en, v.disclaimer_sv, v.disclaimer_en,
       'cig-2026.07-09C.1', now()
FROM (VALUES
 ('evenemangsvakt','se.security.evenemangsvakt','public-order','B','published',true,'SE','SE','Evenemangsvakt','Event Security Officer','Arbetar med säkerhet vid publika evenemang, ofta som ordningsvakt med tillfälligt förordnande.','Provides safety services at public events, often as a public-order guard with a temporary appointment.',NULL,NULL),
 ('hundforare','se.security.hundforare','operational-security','B','published',true,'SE','SE','Hundförare (bevakning)','Security Dog Handler','Bevakning i tjänst med hund inom auktoriserat bevakningsföretag.','Guarding duties performed together with a service dog inside an authorised security company.',NULL,NULL),
 ('vardetransportor','se.security.vardetransport','operational-security','B','published',true,'SE','SE','Värdetransportör','Cash-in-Transit Officer','Väktare specialiserad på värdetransporter.','Security officer specialised in cash-in-transit operations.',NULL,NULL),
 ('parkeringsvakt','se.security.parkeringsvakt','public-order','B','published',true,'SE','SE','Parkeringsvakt','Parking Enforcement Officer','Kommunalt reglerad roll för övervakning av parkeringsregler.','Municipally regulated role monitoring parking regulations.',NULL,NULL),
 ('livvakt','se.security.livvakt','private-protection-close-security','B','published',true,'SE','SE','Livvakt','Bodyguard','Kvalificerat personskyddsarbete med särskilt godkännande.','Qualified close-protection work with a specific approval.',NULL,NULL),
 ('dataskyddsombud','se.security.gdpr-samordnare','cyber-information-security','B','published',true,'SE','EU','Dataskyddsombud','Data Protection Officer','Formell roll enligt GDPR artikel 37 med tillsyn av IMY.','Formal GDPR Article 37 role, supervised by IMY.',NULL,NULL),
 ('raddningsledare','se.rescue.raddningsledare','emergency-rescue','B','published',true,'SE','SE','Räddningsledare','Rescue Operations Commander','Leder operativ räddningsinsats enligt LSO.','Commands operational rescue response under the Civil Protection Act (LSO).',NULL,NULL),
 ('sakerhetsreceptionist','se.security.receptionist-med-sakerhet','operational-security','B','published',false,'SE','SE','Säkerhetsreceptionist','Security Receptionist','Reception och passagekontroll med säkerhetsansvar.','Reception with combined access-control and safety responsibilities.',NULL,NULL),
 ('butikskontrollant','se.security.butiksvakt','operational-security','B','published',false,'SE','SE','Butikskontrollant','Loss Prevention Officer','Förebyggande arbete mot svinn och stöld i butik.','Prevention of shrinkage and theft in retail settings.',NULL,NULL),
 ('installator-larm','se.security.installatorlarm','security-technology','B','published',false,'SE','SE','Larminstallatör','Alarm Installer','Installation och driftsättning av inbrotts- och brandlarm.','Installation and commissioning of intrusion and fire alarm systems.',NULL,NULL),
 ('cctv-tekniker','se.security.cctv-tekniker','security-technology','B','published',false,'SE','SE','CCTV-tekniker','CCTV Technician','Installerar och underhåller övervakningskameror.','Installs and maintains video surveillance systems.',NULL,NULL),
 ('accesscontrol-tekniker','se.security.accesscontrol-tekniker','security-technology','B','published',false,'SE','SE','Accesskontrolltekniker','Access Control Technician','Arbetar med passersystem och behörighetsstyrning.','Works with access-control systems and authorisation management.',NULL,NULL),
 ('soc-analytiker','se.security.soc-analytiker','cyber-information-security','B','published',false,'SE','SE','SOC-analytiker','SOC Analyst','Bevakar och analyserar säkerhetshändelser i SOC.','Monitors and analyses security events in a Security Operations Centre.',NULL,NULL),
 ('incident-responder','se.security.incident-responder','cyber-information-security','B','published',false,'SE','SE','Incident Responder','Incident Responder','Hanterar och utreder cyberincidenter.','Handles and investigates cyber incidents.',NULL,NULL),
 ('penetrationstestare','se.security.penetrationstestare','cyber-information-security','B','published',false,'SE','SE','Penetrationstestare','Penetration Tester','Simulerar attacker för att identifiera sårbarheter.','Simulates attacks to identify vulnerabilities.',NULL,NULL),
 ('compliance-officer','se.security.compliance-officer','corporate-security-leadership','B','published',false,'SE','SE','Compliance Officer','Compliance Officer','Säkerställer regelefterlevnad i organisationen.','Ensures regulatory compliance across the organisation.',NULL,NULL),
 ('aml-specialist','se.security.aml-specialist','corporate-security-leadership','B','published',false,'SE','SE','AML-specialist','AML Specialist','Arbetar med förebyggande av penningtvätt och finansiering av terrorism.','Works to prevent money laundering and terrorist financing.',NULL,NULL),
 ('polisutredare','se.police.polisutredare','investigation-intelligence','B','published',true,'SE','SE','Polisutredare','Police Investigator','Utreder brott inom Polismyndigheten.','Investigates crime within the Swedish Police Authority.','Formell behörighet, antagning och urval beslutas av Polismyndigheten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Police Authority. CQrityjob provides career guidance, not admission decisions.'),
 ('specialistofficer','se.armed-forces.specialistofficer','defence','B','published',true,'SE','SE','Specialistofficer','Specialist Officer','Specialistofficer inom Försvarsmakten.','Specialist officer within the Swedish Armed Forces.','Formell behörighet, antagning och urval beslutas av Försvarsmakten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Armed Forces. CQrityjob provides career guidance, not admission decisions.'),
 ('reservofficer','se.armed-forces.reservofficer','defence','B','published',true,'SE','SE','Reservofficer','Reserve Officer','Reservofficer inom Försvarsmakten.','Reserve officer within the Swedish Armed Forces.','Formell behörighet, antagning och urval beslutas av Försvarsmakten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Armed Forces. CQrityjob provides career guidance, not admission decisions.'),
 ('militarpolis','se.armed-forces.militarpolis','defence','B','published',true,'SE','SE','Militärpolis','Military Police','Militärpolisiär tjänst inom Försvarsmakten.','Military police service within the Swedish Armed Forces.','Formell behörighet, antagning och urval beslutas av Försvarsmakten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Armed Forces. CQrityjob provides career guidance, not admission decisions.'),
 ('trygghetsvard','se.security.trygghetsvard','public-order','B','draft',false,'SE','SE','Trygghetsvärd','Community Safety Host','Trygghetsskapande roll i offentlig miljö.','Community safety role in public settings.',NULL,NULL),
 ('ordningsvaktsledare','se.security.ordningsvaktsledare','public-order','B','draft',true,'SE','SE','Ordningsvaktsledare','Public Order Guard Team Lead','Arbetsledande roll för ordningsvakter.','Team-lead role for public-order guards.',NULL,NULL),
 ('arbetsmiljosamordnare','se.security.arbetsmiljosamordnare','risk-crisis-management','B','draft',false,'SE','SE','Arbetsmiljösamordnare','HSE Coordinator','Samordnar arbetsmiljöfrågor i verksamhet.','Coordinates occupational health and safety.',NULL,NULL),
 ('bcm-specialist','se.security.bcm-specialist','risk-crisis-management','B','draft',false,'SE','SE','Kontinuitetsspecialist','Business Continuity Specialist','Arbetar med kontinuitetsplanering.','Works on business continuity planning.',NULL,NULL),
 ('forensic-analyst','se.security.forensic-analyst','investigation-intelligence','B','draft',false,'SE','SE','Digital forensiker','Digital Forensics Analyst','Utreder digitala spår efter incidenter.','Investigates digital traces after incidents.',NULL,NULL),
 ('osint-analytiker','se.security.oppen-kalla-analytiker','investigation-intelligence','B','draft',false,'SE','SE','OSINT-analytiker','OSINT Analyst','Öppen-källa-underrättelse.','Open-source intelligence analysis.',NULL,NULL),
 ('forsakringsutredare','se.security.forsakringsutredare','investigation-intelligence','B','draft',false,'SE','SE','Försäkringsutredare','Insurance Investigator','Utreder försäkringsärenden.','Investigates insurance claims.',NULL,NULL),
 ('privatdetektiv','se.security.privatdetektiv','investigation-intelligence','B','draft',false,'SE','SE','Privatdetektiv','Private Investigator','Utredningsuppdrag på uppdrag av privat kund.','Private-client investigative work.',NULL,NULL),
 ('maritim-sakerhet','se.security.maritim-sakerhet','operational-security','B','draft',true,'SE','SE','Sjöfartsskyddsansvarig','Maritime Security Officer','Sjöfartsskydd (ISPS).','Maritime security under ISPS.',NULL,NULL),
 ('hamnsakerhetssamordnare','se.security.hamnsakerhet','operational-security','B','draft',true,'SE','SE','Hamnskyddssamordnare','Port Facility Security Officer','Port Facility Security Officer enligt ISPS.','Port Facility Security Officer under ISPS.',NULL,NULL),
 ('fastighetsskotare-sakerhet','se.security.fastighetsskotare-sakerhet','security-technology','B','draft',false,'SE','SE','Fastighetstekniker (säkerhet)','Facility Security Technician','Tekniskt underhåll med säkerhetsansvar.','Technical facility maintenance with security responsibilities.',NULL,NULL),
 ('fraud-analyst','se.security.fraud-analyst','investigation-intelligence','B','draft',false,'SE','SE','Bedrägerianalytiker','Fraud Analyst','Analyserar bedrägerimönster.','Analyses fraud patterns.',NULL,NULL),
 ('ambulanssjukvardare','se.rescue.ambulanssjukvardare','emergency-rescue','B','draft',true,'SE','SE','Ambulanssjukvårdare','Emergency Medical Technician','Prehospital sjukvård.','Prehospital emergency medical care.',NULL,NULL),
 ('krisstod','se.security.krisstod','risk-crisis-management','B','draft',false,'SE','SE','Krisstödsspecialist','Crisis Support Specialist','Krisstöd till individer och organisationer.','Crisis support for individuals and organisations.',NULL,NULL),
 ('utbildare-sakerhet','se.security.utbildare-sakerhet','corporate-security-leadership','B','draft',false,'SE','SE','Säkerhetsutbildare','Security Trainer','Utbildar säkerhetspersonal.','Trains security personnel.',NULL,NULL),
 ('auditor-sakerhet','se.security.auditor-sakerhet','corporate-security-leadership','B','draft',false,'SE','SE','Säkerhetsrevisor','Security Auditor','Reviderar säkerhetsarbete.','Audits security operations.',NULL,NULL),
 ('iam-specialist','se.security.iam-specialist','cyber-information-security','B','draft',false,'SE','SE','IAM-specialist','Identity & Access Management Specialist','Behörighets- och identitetsstyrning.','Identity and access management.',NULL,NULL),
 ('threat-intel-analytiker','se.security.threat-intelligence','investigation-intelligence','B','draft',false,'SE','SE','Hotunderrättelseanalytiker','Threat Intelligence Analyst','Analys av digitala hotaktörer.','Analysis of digital threat actors.',NULL,NULL),
 ('forensiker','se.police.forensiker','investigation-intelligence','B','draft',true,'SE','SE','Kriminaltekniker','Forensic Technician','Kriminaltekniskt arbete inom Polismyndigheten.','Forensic technical work within the Swedish Police Authority.','Formell behörighet, antagning och urval beslutas av Polismyndigheten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Police Authority. CQrityjob provides career guidance, not admission decisions.'),
 ('polis-intel-analytiker','se.police.intel-analyst','investigation-intelligence','B','draft',true,'SE','SE','Underrättelseanalytiker (polis)','Police Intelligence Analyst','Underrättelseanalys inom Polismyndigheten.','Intelligence analysis within the Swedish Police Authority.','Formell behörighet, antagning och urval beslutas av Polismyndigheten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Police Authority. CQrityjob provides career guidance, not admission decisions.'),
 ('sjoman','se.armed-forces.sjoman','defence','B','draft',true,'SE','SE','Sjöman (marin)','Sailor (Navy)','Marin tjänst inom Försvarsmakten.','Naval service within the Swedish Armed Forces.','Formell behörighet, antagning och urval beslutas av Försvarsmakten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Armed Forces. CQrityjob provides career guidance, not admission decisions.'),
 ('underrattelsesoldat','se.armed-forces.underrattelsesoldat','defence','B','draft',true,'SE','SE','Underrättelsesoldat','Intelligence Soldier','Underrättelsetjänst inom Försvarsmakten.','Intelligence duties within the Swedish Armed Forces.','Formell behörighet, antagning och urval beslutas av Försvarsmakten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Armed Forces. CQrityjob provides career guidance, not admission decisions.'),
 ('sakerhetssoldat','se.armed-forces.sakerhetssoldat','defence','B','draft',true,'SE','SE','Säkerhetssoldat','Security Soldier','Säkerhetstjänst inom Försvarsmakten.','Security service within the Swedish Armed Forces.','Formell behörighet, antagning och urval beslutas av Försvarsmakten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Armed Forces. CQrityjob provides career guidance, not admission decisions.'),
 ('cybersoldat','se.armed-forces.cybersoldat','defence','B','draft',true,'SE','SE','Cybersoldat','Cyber Soldier','Cyberförmåga inom Försvarsmakten.','Cyber capability within the Swedish Armed Forces.','Formell behörighet, antagning och urval beslutas av Försvarsmakten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Armed Forces. CQrityjob provides career guidance, not admission decisions.'),
 ('fm-civil-sakerhetsspecialist','se.armed-forces.civil-sakerhet','defence','B','draft',true,'SE','SE','Civil säkerhetsspecialist (FM)','Civilian Security Specialist (Armed Forces)','Civilanställd säkerhetsspecialist inom Försvarsmakten.','Civilian security specialist employed by the Swedish Armed Forces.','Formell behörighet, antagning och urval beslutas av Försvarsmakten. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by the Swedish Armed Forces. CQrityjob provides career guidance, not admission decisions.'),
 ('tull-granskontrollant','se.customs.granspolis-civil','customs-border','B','draft',true,'SE','SE','Gränskontrollant (tull)','Border Control Officer','Gränskontroll inom Tullverket.','Border-control work within Swedish Customs.','Formell behörighet, antagning och urval beslutas av Tullverket. CQrityjob ger karriärvägledning, inte antagningsbesked.','Formal eligibility, admission and selection are determined by Swedish Customs. CQrityjob provides career guidance, not admission decisions.')
) AS v(slug,canonical_key,family_slug,quality_level,content_status,is_regulated,country,jurisdiction,title_sv,title_en,summary_sv,summary_en,disclaimer_sv,disclaimer_en)
ON CONFLICT (canonical_key) DO UPDATE SET
  slug=EXCLUDED.slug, primary_family_id=EXCLUDED.primary_family_id, quality_level=EXCLUDED.quality_level,
  content_status=EXCLUDED.content_status, is_regulated=EXCLUDED.is_regulated,
  country=EXCLUDED.country, jurisdiction=EXCLUDED.jurisdiction,
  title_sv=EXCLUDED.title_sv, title_en=EXCLUDED.title_en, summary_sv=EXCLUDED.summary_sv, summary_en=EXCLUDED.summary_en,
  disclaimer_sv=EXCLUDED.disclaimer_sv, disclaimer_en=EXCLUDED.disclaimer_en,
  graph_version=EXCLUDED.graph_version, last_verified=EXCLUDED.last_verified, updated_at=now();

-- =====================================================================
-- 15. PROFESSION → FAMILY (primary)
-- =====================================================================
INSERT INTO public.cig_profession_family_rel (profession_id, family_id, importance, content_status, graph_version)
SELECT p.id, p.primary_family_id, 1, 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM public.cig_professions p
WHERE p.graph_version = 'cig-2026.07-09C.1' AND p.primary_family_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 16. PROFESSION → FORMAL REQUIREMENTS
-- =====================================================================
INSERT INTO public.cig_profession_formal_requirements (profession_id, formal_requirement_id, criticality, legal_blocker, country, jurisdiction, source_id, content_status, graph_version)
SELECT (SELECT id FROM public.cig_professions WHERE slug='vaktare'),
       (SELECT id FROM public.cig_formal_requirements WHERE slug='vaktar-godkannande'),
       'mandatory'::cig_relationship_criticality, true, 'SE','SE',
       (SELECT id FROM public.cig_source_references WHERE stable_key='src.lansstyrelsen.vaktare'),
       'published'::cig_content_status, 'cig-2026.07-09C.1'
WHERE NOT EXISTS (SELECT 1 FROM public.cig_profession_formal_requirements pfr
  WHERE pfr.profession_id=(SELECT id FROM public.cig_professions WHERE slug='vaktare')
    AND pfr.formal_requirement_id=(SELECT id FROM public.cig_formal_requirements WHERE slug='vaktar-godkannande'));

INSERT INTO public.cig_profession_formal_requirements (profession_id, formal_requirement_id, criticality, legal_blocker, country, jurisdiction, source_id, content_status, graph_version)
SELECT (SELECT id FROM public.cig_professions WHERE slug='ordningsvakt'),
       (SELECT id FROM public.cig_formal_requirements WHERE slug='ordningsvakt-forordnande'),
       'mandatory', true, 'SE','SE',
       (SELECT id FROM public.cig_source_references WHERE stable_key='src.polisen.ordningsvakt'),
       'published', 'cig-2026.07-09C.1'
WHERE NOT EXISTS (SELECT 1 FROM public.cig_profession_formal_requirements pfr
  WHERE pfr.profession_id=(SELECT id FROM public.cig_professions WHERE slug='ordningsvakt')
    AND pfr.formal_requirement_id=(SELECT id FROM public.cig_formal_requirements WHERE slug='ordningsvakt-forordnande'));

INSERT INTO public.cig_profession_formal_requirements (profession_id, formal_requirement_id, criticality, legal_blocker, country, jurisdiction, source_id, content_status, graph_version)
SELECT (SELECT id FROM public.cig_professions WHERE slug='skyddsvakt'),
       (SELECT id FROM public.cig_formal_requirements WHERE slug='skyddsvakt-godkannande'),
       'mandatory', true, 'SE','SE',
       (SELECT id FROM public.cig_source_references WHERE stable_key='src.lansstyrelsen.skyddsvakt'),
       'published', 'cig-2026.07-09C.1'
WHERE NOT EXISTS (SELECT 1 FROM public.cig_profession_formal_requirements pfr
  WHERE pfr.profession_id=(SELECT id FROM public.cig_professions WHERE slug='skyddsvakt')
    AND pfr.formal_requirement_id=(SELECT id FROM public.cig_formal_requirements WHERE slug='skyddsvakt-godkannande'));

INSERT INTO public.cig_profession_formal_requirements (profession_id, formal_requirement_id, criticality, legal_blocker, country, jurisdiction, source_id, content_status, graph_version)
SELECT p.id,
       (SELECT id FROM public.cig_formal_requirements WHERE slug='livvakt-godkannande'),
       'mandatory', true, 'SE','SE',
       (SELECT id FROM public.cig_source_references WHERE stable_key='src.riksdagen.bevakningslag'),
       'published', 'cig-2026.07-09C.1'
FROM public.cig_professions p WHERE p.slug IN ('personskyddsvakt','livvakt')
  AND NOT EXISTS (SELECT 1 FROM public.cig_profession_formal_requirements x
    WHERE x.profession_id=p.id AND x.formal_requirement_id=(SELECT id FROM public.cig_formal_requirements WHERE slug='livvakt-godkannande'));

INSERT INTO public.cig_profession_formal_requirements (profession_id, formal_requirement_id, criticality, legal_blocker, country, jurisdiction, source_id, content_status, graph_version)
SELECT (SELECT id FROM public.cig_professions WHERE slug='dataskyddsombud'),
       (SELECT id FROM public.cig_formal_requirements WHERE slug='dpo-designation'),
       'mandatory', true, 'SE','EU',
       (SELECT id FROM public.cig_source_references WHERE stable_key='src.imy.gdpr'),
       'published', 'cig-2026.07-09C.1'
WHERE NOT EXISTS (SELECT 1 FROM public.cig_profession_formal_requirements pfr
  WHERE pfr.profession_id=(SELECT id FROM public.cig_professions WHERE slug='dataskyddsombud')
    AND pfr.formal_requirement_id=(SELECT id FROM public.cig_formal_requirements WHERE slug='dpo-designation'));

INSERT INTO public.cig_profession_formal_requirements (profession_id, formal_requirement_id, criticality, legal_blocker, country, jurisdiction, source_id, content_status, graph_version)
SELECT (SELECT id FROM public.cig_professions WHERE slug='flygplatssakerhet'),
       (SELECT id FROM public.cig_formal_requirements WHERE slug='aviation-security-cert'),
       'mandatory', true, 'SE','EU',
       (SELECT id FROM public.cig_source_references WHERE stable_key='src.eur-lex.2015-1998'),
       'published', 'cig-2026.07-09C.1'
WHERE NOT EXISTS (SELECT 1 FROM public.cig_profession_formal_requirements pfr
  WHERE pfr.profession_id=(SELECT id FROM public.cig_professions WHERE slug='flygplatssakerhet')
    AND pfr.formal_requirement_id=(SELECT id FROM public.cig_formal_requirements WHERE slug='aviation-security-cert'));

INSERT INTO public.cig_profession_formal_requirements (profession_id, formal_requirement_id, criticality, legal_blocker, country, jurisdiction, source_id, content_status, graph_version)
SELECT p.id,
       (SELECT id FROM public.cig_formal_requirements WHERE slug='sakerhetsprovning-sf'),
       'mandatory', true, 'SE','SE',
       (SELECT id FROM public.cig_source_references WHERE stable_key='src.riksdagen.sakerhetsskydd'),
       'published', 'cig-2026.07-09C.1'
FROM public.cig_professions p WHERE p.slug IN ('skyddsvakt','soldat','officer','polis','civil-utredare')
  AND NOT EXISTS (SELECT 1 FROM public.cig_profession_formal_requirements x
    WHERE x.profession_id=p.id AND x.formal_requirement_id=(SELECT id FROM public.cig_formal_requirements WHERE slug='sakerhetsprovning-sf'));

-- =====================================================================
-- 17. PROFESSION → SOURCE REFERENCES
-- =====================================================================
INSERT INTO public.cig_profession_source_references (profession_id, source_id, purpose, content_status, graph_version)
SELECT p.id, s.id, 'primary-authority', 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM public.cig_professions p JOIN public.cig_source_references s ON s.stable_key = CASE
  WHEN p.slug='vaktare' THEN 'src.lansstyrelsen.vaktare'
  WHEN p.slug='ordningsvakt' THEN 'src.polisen.ordningsvakt'
  WHEN p.slug='skyddsvakt' THEN 'src.lansstyrelsen.skyddsvakt'
  WHEN p.slug IN ('soldat','officer','specialistofficer','reservofficer','militarpolis','sjoman','underrattelsesoldat','sakerhetssoldat','cybersoldat','fm-civil-sakerhetsspecialist') THEN 'src.forsvarsmakten.jobb'
  WHEN p.slug IN ('polis','civil-utredare','polisutredare','forensiker','polis-intel-analytiker') THEN 'src.polisen.polisutbildning'
  WHEN p.slug IN ('tulltjansteman','tull-granskontrollant') THEN 'src.tullverket.jobb'
  WHEN p.slug='brandman' THEN 'src.msb.brandman'
  WHEN p.slug='flygplatssakerhet' THEN 'src.transportstyrelsen.aviation'
  WHEN p.slug='dataskyddsombud' THEN 'src.imy.gdpr'
END
WHERE p.graph_version='cig-2026.07-09C.1'
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 18. ALIASES
-- =====================================================================
INSERT INTO public.cig_profession_aliases (profession_id, alias_sv, alias_en, alias_kind, content_status, graph_version)
SELECT p.id, v.alias_sv, v.alias_en, v.kind::cig_alias_kind, 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM (VALUES
 ('vaktare','bevakare','security guard','alias'),
 ('vaktare','stationär vakt','static guard','context'),
 ('vaktare','sjukhusvakt','hospital security','context'),
 ('vaktare','ronderande väktare','patrolling security officer','context'),
 ('ordningsvakt','ordvakt','ORDV','alias'),
 ('skyddsvakt','objektsvakt','protective object guard','alias'),
 ('sakerhetstekniker','larmtekniker','alarm technician','alias'),
 ('sakerhetschef','chief security officer','CSO','alias'),
 ('informationssakerhetsspecialist','CISO (operativ)','CISO (operational)','seniority'),
 ('soc-analytiker','säkerhetsanalytiker (SOC)','security analyst (SOC)','alias'),
 ('personskyddsvakt','livvakt (auktoriserad)','close protection officer (authorised)','alias'),
 ('livvakt','bodyguard','bodyguard','alias'),
 ('brandman','räddningsman','rescue worker','alias'),
 ('polis','polisman','police constable','alias')
) AS v(prof_slug, alias_sv, alias_en, kind)
JOIN public.cig_professions p ON p.slug = v.prof_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.cig_profession_aliases a
  WHERE a.profession_id = p.id AND a.alias_sv = v.alias_sv AND a.alias_kind = v.kind::cig_alias_kind
);

-- =====================================================================
-- 19. SPECIALISATIONS
-- =====================================================================
INSERT INTO public.cig_profession_specialisations (profession_id, slug, title_sv, title_en, description_sv, description_en, content_status, graph_version)
SELECT p.id, v.spec_slug, v.title_sv, v.title_en, NULL, NULL, 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM (VALUES
 ('polis','polis-narkotikautredare','Narkotikautredare','Narcotics investigator'),
 ('polis','polis-piket','Insatspolis (Piket)','Special response unit officer'),
 ('polis','polis-hundforare','Polishundförare','Police dog handler'),
 ('polis','polis-forhandlare','Förhandlare','Police negotiator'),
 ('polis','polis-nsat','Nationella insatsstyrkan','National Task Force'),
 ('polis','polis-livvakt','Livvakt (polis)','Police close protection officer'),
 ('soldat','fm-jagarsoldat','Jägarsoldat','Ranger soldier'),
 ('soldat','fm-fallskarmsjagare','Fallskärmsjägare','Paratrooper ranger'),
 ('soldat','fm-amfibiesoldat','Amfibiesoldat','Amphibious soldier'),
 ('officer','fm-flygofficer','Flygofficer','Air force officer'),
 ('officer','fm-marinofficer','Marinofficer','Naval officer'),
 ('cybersoldat','fm-cyber-signalskyddsspecialist','Signalskyddsspecialist','Signals security specialist')
) AS v(prof_slug, spec_slug, title_sv, title_en)
JOIN public.cig_professions p ON p.slug = v.prof_slug
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 20. CAREER TRANSITIONS
-- =====================================================================
INSERT INTO public.cig_career_transitions (from_profession_id, to_profession_id, transition_kind, rationale_sv, rationale_en, content_status, graph_version)
SELECT fp.id, tp.id, v.kind, v.r_sv, v.r_en, 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM (VALUES
 ('vaktare','ordningsvakt','specialisation','Väktare kan söka utbildning och förordnande till ordningsvakt.','A väktare can pursue training and appointment as a public-order guard.'),
 ('vaktare','skyddsvakt','specialisation','Väktare kan gå vidare till skyddsvaktsuppdrag.','A väktare can move on to protective-object assignments.'),
 ('vaktare','personskyddsvakt','promotion','Personskydd är ett kvalificerat steg inom bevakning.','Close protection is a qualified step within guarding.'),
 ('vaktare','larmoperator','pivot','Erfarenhet av bevakning är relevant för larmcentral.','Guarding experience translates well to an alarm centre role.'),
 ('vaktare','butikskontrollant','lateral','Rollerna delar operativ säkerhetsförmåga.','The roles share operational security capabilities.'),
 ('sakerhetstekniker','sakerhetssamordnare','pivot','Teknisk säkerhetsbakgrund ger grund för samordning.','A technical security background supports coordination roles.'),
 ('sakerhetssamordnare','sakerhetschef','promotion','Naturlig karriärväg mot ledande säkerhetsroll.','A natural path to a lead security role.'),
 ('sakerhetschef','risk-manager','pivot','Överlappande kompetens i risk och styrning.','Overlapping competence in risk and governance.'),
 ('informationssakerhetsspecialist','soc-analytiker','specialisation','Djupare specialisering mot operativ övervakning.','A deeper specialisation towards operational monitoring.'),
 ('soc-analytiker','incident-responder','promotion','Utvecklas mot hantering av allvarliga incidenter.','Progression into handling of serious incidents.'),
 ('soc-analytiker','threat-intel-analytiker','pivot','Analysprofil för hotunderrättelse.','An analytical pivot into threat intelligence.'),
 ('cybersakerhetsanalytiker','penetrationstestare','specialisation','Ren offensiv specialisering.','A purely offensive specialisation.'),
 ('polis','polisutredare','specialisation','Specialisering mot utredningsverksamhet.','A specialisation into investigative work.'),
 ('polis','civil-utredare','pivot','Övergång till civil utredarroll inom Polismyndigheten.','Move to a civilian investigator role within the Police Authority.'),
 ('soldat','specialistofficer','promotion','Karriärutveckling inom Försvarsmakten.','Career progression within the Armed Forces.'),
 ('soldat','sakerhetssoldat','specialisation','Specialisering inom säkerhetstjänst.','A specialisation into security service.'),
 ('officer','sakerhetschef','pivot','Militär ledarerfarenhet överförd till civil säkerhet.','Military leadership experience transferable to civilian security.'),
 ('brandman','raddningsledare','promotion','Karriärväg inom räddningstjänsten.','Career path within the rescue services.'),
 ('ambulanssjukvardare','krisstod','pivot','Kunskap om akutinsats stödjer krisstöd.','Emergency response knowledge supports crisis support work.'),
 ('sakerhetsutredare','forensic-analyst','specialisation','Utveckling mot digital forensik.','Development into digital forensics.'),
 ('installator-larm','sakerhetstekniker','lateral','Näraliggande roller inom säkerhetsteknik.','Adjacent roles within security technology.'),
 ('cctv-tekniker','sakerhetstekniker','lateral','Näraliggande roller inom säkerhetsteknik.','Adjacent roles within security technology.'),
 ('compliance-officer','aml-specialist','specialisation','Specialisering inom AML/CTF.','Specialisation into AML/CTF.')
) AS v(from_slug, to_slug, kind, r_sv, r_en)
JOIN public.cig_professions fp ON fp.slug = v.from_slug
JOIN public.cig_professions tp ON tp.slug = v.to_slug
WHERE fp.id <> tp.id
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 21. PROFESSION → COMPETENCIES
-- =====================================================================
INSERT INTO public.cig_profession_competency_req (profession_id, competency_id, importance, criticality, content_status, graph_version)
SELECT p.id, c.id, v.importance, v.crit::cig_relationship_criticality, 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM (VALUES
 ('vaktare','situational-awareness',3,'mandatory'),('vaktare','de-escalation',3,'mandatory'),('vaktare','report-writing',2,'mandatory'),('vaktare','access-control',2,'preferred'),('vaktare','emergency-response',2,'preferred'),
 ('ordningsvakt','de-escalation',3,'mandatory'),('ordningsvakt','situational-awareness',3,'mandatory'),('ordningsvakt','report-writing',2,'mandatory'),('ordningsvakt','regulatory-compliance',2,'mandatory'),
 ('skyddsvakt','situational-awareness',3,'mandatory'),('skyddsvakt','access-control',3,'mandatory'),('skyddsvakt','regulatory-compliance',3,'mandatory'),
 ('sakerhetstekniker','technical-installation',3,'mandatory'),('sakerhetstekniker','systems-troubleshooting',3,'mandatory'),
 ('sakerhetssamordnare','risk-assessment',3,'mandatory'),('sakerhetssamordnare','regulatory-compliance',2,'preferred'),
 ('sakerhetschef','leadership',3,'mandatory'),('sakerhetschef','risk-assessment',3,'mandatory'),('sakerhetschef','crisis-communication',2,'preferred'),
 ('risk-manager','risk-assessment',3,'mandatory'),('risk-manager','regulatory-compliance',2,'preferred'),
 ('krisberedskapssamordnare','risk-assessment',3,'mandatory'),('krisberedskapssamordnare','crisis-communication',3,'mandatory'),
 ('informationssakerhetsspecialist','information-security',3,'mandatory'),('informationssakerhetsspecialist','regulatory-compliance',2,'preferred'),
 ('cybersakerhetsanalytiker','threat-analysis',3,'mandatory'),('cybersakerhetsanalytiker','information-security',3,'mandatory'),
 ('sakerhetsutredare','incident-investigation',3,'mandatory'),('sakerhetsutredare','interviewing-technique',2,'preferred'),
 ('larmoperator','situational-awareness',3,'mandatory'),('larmoperator','crisis-communication',2,'preferred'),
 ('personskyddsvakt','close-protection',3,'mandatory'),('personskyddsvakt','situational-awareness',3,'mandatory'),('personskyddsvakt','physical-fitness',2,'mandatory'),
 ('flygplatssakerhet','regulatory-compliance',3,'mandatory'),('flygplatssakerhet','situational-awareness',3,'mandatory'),
 ('polis','de-escalation',3,'mandatory'),('polis','situational-awareness',3,'mandatory'),('polis','report-writing',3,'mandatory'),
 ('civil-utredare','incident-investigation',3,'mandatory'),('civil-utredare','interviewing-technique',2,'mandatory'),
 ('soldat','physical-fitness',3,'mandatory'),('soldat','situational-awareness',3,'mandatory'),
 ('officer','leadership',3,'mandatory'),('officer','risk-assessment',2,'preferred'),
 ('tulltjansteman','regulatory-compliance',3,'mandatory'),('tulltjansteman','interviewing-technique',2,'preferred'),
 ('brandman','emergency-response',3,'mandatory'),('brandman','physical-fitness',3,'mandatory')
) AS v(prof_slug, comp_slug, importance, crit)
JOIN public.cig_professions p ON p.slug = v.prof_slug
JOIN public.cig_competencies c ON c.slug = v.comp_slug
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 22. PROFESSION → EDUCATION PATHWAYS
-- =====================================================================
INSERT INTO public.cig_profession_education_pathways (profession_id, education_pathway_id, importance, content_status, graph_version)
SELECT p.id, e.id, v.importance, 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM (VALUES
 ('vaktare','vaktar-utbildning',3),('ordningsvakt','ordningsvakt-utbildning',3),
 ('skyddsvakt','skyddsvakt-utbildning',3),('polis','polisutbildning',3),
 ('civil-utredare','gymnasium-general',2),('soldat','grundutbildning-varnplikt',3),
 ('officer','officersprogrammet',3),('specialistofficer','officersprogrammet',3),
 ('brandman','brandman-msb',3),('tulltjansteman','tull-grundutbildning',3),
 ('cybersakerhetsanalytiker','cybersecurity-bachelor',2),
 ('informationssakerhetsspecialist','cybersecurity-bachelor',2),
 ('sakerhetstekniker','yh-sakerhet',2),
 ('sakerhetssamordnare','yh-sakerhet',2)
) AS v(prof_slug, edu_slug, importance)
JOIN public.cig_professions p ON p.slug=v.prof_slug
JOIN public.cig_education_pathways e ON e.slug=v.edu_slug
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 23. PROFESSION → CERTIFICATIONS
-- =====================================================================
INSERT INTO public.cig_profession_certification_rel (profession_id, certification_id, criticality, content_status, graph_version)
SELECT p.id, c.id, 'informative'::cig_relationship_criticality, 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM (VALUES
 ('informationssakerhetsspecialist','cissp'),('informationssakerhetsspecialist','cism'),('informationssakerhetsspecialist','iso27001-lead-auditor'),
 ('cybersakerhetsanalytiker','comptia-security-plus'),('cybersakerhetsanalytiker','gcih'),
 ('penetrationstestare','oscp'),('penetrationstestare','ceh'),
 ('incident-responder','gcih'),
 ('aml-specialist','cams')
) AS v(prof_slug, cert_slug)
JOIN public.cig_professions p ON p.slug=v.prof_slug
JOIN public.cig_certifications c ON c.slug=v.cert_slug
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 24. PROFESSION → EMPLOYER TYPES
-- =====================================================================
INSERT INTO public.cig_profession_employer_type_rel (profession_id, employer_type_id, importance, content_status, graph_version)
SELECT p.id, e.id, 3, 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM (VALUES
 ('vaktare','authorised-security-company'),('ordningsvakt','authorised-security-company'),
 ('skyddsvakt','authorised-security-company'),('skyddsvakt','armed-forces'),
 ('sakerhetstekniker','private-employer'),('sakerhetssamordnare','private-employer'),
 ('sakerhetschef','private-employer'),('risk-manager','private-employer'),
 ('polis','police-authority'),('civil-utredare','police-authority'),('polisutredare','police-authority'),
 ('soldat','armed-forces'),('officer','armed-forces'),('specialistofficer','armed-forces'),('reservofficer','armed-forces'),('militarpolis','armed-forces'),
 ('tulltjansteman','customs-authority'),('brandman','emergency-service'),
 ('flygplatssakerhet','authorised-security-company'),
 ('larmoperator','authorised-security-company'),('personskyddsvakt','authorised-security-company'),
 ('livvakt','authorised-security-company'),
 ('dataskyddsombud','private-employer'),('dataskyddsombud','government-authority')
) AS v(prof_slug, emp_slug)
JOIN public.cig_professions p ON p.slug=v.prof_slug
JOIN public.cig_employer_types e ON e.slug=v.emp_slug
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 25. PROFESSION → WORK ENVIRONMENTS
-- =====================================================================
INSERT INTO public.cig_profession_work_environment_rel (profession_id, work_environment_id, importance, content_status, graph_version)
SELECT p.id, w.id, 2, 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM (VALUES
 ('vaktare','indoor-static-post'),('vaktare','outdoor-patrol'),('vaktare','mixed-shift'),
 ('ordningsvakt','outdoor-patrol'),('ordningsvakt','mixed-shift'),
 ('skyddsvakt','indoor-static-post'),('skyddsvakt','outdoor-patrol'),
 ('sakerhetstekniker','field-technical'),
 ('sakerhetssamordnare','office'),('sakerhetschef','office'),('risk-manager','office'),
 ('informationssakerhetsspecialist','office'),('cybersakerhetsanalytiker','control-room'),
 ('larmoperator','control-room'),
 ('personskyddsvakt','high-risk-environment'),('livvakt','high-risk-environment'),
 ('polis','outdoor-patrol'),('polis','mixed-shift'),
 ('soldat','high-risk-environment'),('officer','high-risk-environment'),
 ('brandman','high-risk-environment'),
 ('tulltjansteman','mixed-shift')
) AS v(prof_slug, env_slug)
JOIN public.cig_professions p ON p.slug=v.prof_slug
JOIN public.cig_work_environments w ON w.slug=v.env_slug
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 26. PROFESSION → SECTORS
-- =====================================================================
INSERT INTO public.cig_profession_sector_rel (profession_id, sector_id, importance, content_status, graph_version)
SELECT p.id, s.id, 2, 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM (VALUES
 ('vaktare','retail'),('vaktare','transport-logistics'),('vaktare','healthcare'),
 ('ordningsvakt','events-hospitality'),('ordningsvakt','public-administration'),
 ('skyddsvakt','critical-infrastructure'),('skyddsvakt','defence-industry'),
 ('sakerhetstekniker','critical-infrastructure'),('sakerhetstekniker','technology'),
 ('flygplatssakerhet','aviation'),
 ('polis','public-administration'),('soldat','public-administration'),('officer','public-administration'),
 ('tulltjansteman','public-administration'),('brandman','public-administration'),
 ('cybersakerhetsanalytiker','technology'),('cybersakerhetsanalytiker','financial-services'),
 ('informationssakerhetsspecialist','technology'),('informationssakerhetsspecialist','financial-services'),
 ('aml-specialist','financial-services')
) AS v(prof_slug, sec_slug)
JOIN public.cig_professions p ON p.slug=v.prof_slug
JOIN public.cig_sectors s ON s.slug=v.sec_slug
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 27. PROFESSION → KNOWLEDGE AREAS
-- =====================================================================
INSERT INTO public.cig_profession_knowledge_req (profession_id, knowledge_area_id, importance, criticality, content_status, graph_version)
SELECT p.id, k.id, v.importance, v.crit::cig_relationship_criticality, 'published'::cig_content_status, 'cig-2026.07-09C.1'
FROM (VALUES
 ('vaktare','swedish-security-law',3,'mandatory'),('vaktare','criminal-law-basics',2,'preferred'),
 ('ordningsvakt','swedish-security-law',3,'mandatory'),('ordningsvakt','criminal-law-basics',3,'mandatory'),
 ('skyddsvakt','protective-security-act',3,'mandatory'),
 ('informationssakerhetsspecialist','iso-27001',3,'mandatory'),('informationssakerhetsspecialist','gdpr-dataskydd',3,'mandatory'),('informationssakerhetsspecialist','nis2-directive',2,'preferred'),
 ('cybersakerhetsanalytiker','iso-27001',2,'preferred'),
 ('dataskyddsombud','gdpr-dataskydd',3,'mandatory'),
 ('krisberedskapssamordnare','civil-preparedness',3,'mandatory'),
 ('aml-specialist','aml-cft-regulation',3,'mandatory'),
 ('flygplatssakerhet','aviation-security-regs',3,'mandatory')
) AS v(prof_slug, k_slug, importance, crit)
JOIN public.cig_professions p ON p.slug=v.prof_slug
JOIN public.cig_knowledge_areas k ON k.slug=v.k_slug
ON CONFLICT DO NOTHING;
