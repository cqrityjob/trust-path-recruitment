# Reproducera lokalt

Kräver Docker, psql, Node och Bun. Endast syntetiska data; använd en ny lokal
PostgreSQL-instans och loopback. Använd aldrig produktions-URL/nycklar.
Lösenorden nedan hör enbart till engångscontainrarna.

```bash
docker run -d --name cqrity-security-audit-pg17 \
  -e POSTGRES_PASSWORD=local-security-audit-only \
  -p 127.0.0.1:57633:5432 postgres:17
export PGHOST=127.0.0.1 PGPORT=57633 PGUSER=postgres
export PGPASSWORD=local-security-audit-only
export PGOPTIONS='-c jit=off'
# Vänta tills pg_isready bekräftar att den lokala instansen är redo.
TEST_DB=cqrity_security_audit17 bash scripts/db-test.sh

# Fullsviten rensar sin pristine-mall. Bygg en separat ren auditmall.
psql -X -v ON_ERROR_STOP=1 -d postgres -c 'CREATE DATABASE cqrity_security_overlay_pristine'
psql -X -v ON_ERROR_STOP=1 -d cqrity_security_overlay_pristine -f supabase/tests/00_bootstrap.sql
for migration in supabase/migrations/*.sql; do
  psql -X -v ON_ERROR_STOP=1 -d cqrity_security_overlay_pristine -f "$migration" || exit 1
done
SECURITY_AUDIT_TEMPLATE=cqrity_security_overlay_pristine node scripts/security-access-audit.mjs
```

Audit-scriptet kräver uttrycklig lokal port och mallnamn. Det ersätter sin egen
`cqrity_security_access`-databas, lägger tillbaka observerade produktionsgrants
(inga produktionsrader), reproducerar bristen i transaktioner som rullas tillbaka,
applicerar migrationen och kör positiva/negativa tester. Kör det utan ett samtidigt
anslutet PostgREST-API. Snapshoten är medvetet låst till granskningstillfället;
framtida ändrade policyer/funktioner kräver en ny granskad snapshot.

HTTP-beviset använder riktiga PostgREST/JWT/RLS, men lokalt signerade test-JWT:er
i stället för GoTrue. Det verifierar inte lösenordsinloggning eller HIBP.

```bash
psql -X -v ON_ERROR_STOP=1 -d cqrity_security_access -f supabase/tests/fixtures/security_access_http.sql
docker network create cqrity-security-audit
docker network connect cqrity-security-audit cqrity-security-audit-pg17
docker run -d --name cqrity-security-audit-rest --network cqrity-security-audit \
  -p 127.0.0.1:57634:3000 \
  -e PGRST_DB_URI=postgresql://authenticator:synthetic-security-audit-only@cqrity-security-audit-pg17:5432/cqrity_security_access \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET=synthetic-security-audit-jwt-secret-at-least-32-chars \
  public.ecr.aws/supabase/postgrest:v16.2
# Vänta tills containerns logg säger Schema cache loaded.
node scripts/security-access-http-test.mjs
docker stop cqrity-security-audit-rest cqrity-security-audit-pg17
```

HTTP-fixturen/testet är avsiktligt för en ny auditdatabas. För upprepning: stoppa
API:t, kör audit-scriptet igen, lägg in fixturen och starta API:t. Ändra inte
testförväntningarna för att få en redan muterad fixture att passera.
