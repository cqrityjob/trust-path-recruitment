#!/usr/bin/env python3
"""Two real SQL connections. Native policy harness, not real Auth/HTTP.
Uses only a disposable database cloned by the shell runner, no external calls.
"""
import os
import subprocess
import time

DB = os.environ['LIFECYCLE_RACE_DB']
if not DB.endswith('_lc_ci_test') or not os.environ.get('PGHOST', '').startswith(('127.0.0.1', 'localhost', '/')):
    raise SystemExit('refuse non-local disposable lifecycle database')
PSQL = os.environ.get('PSQL', 'psql')
OWNER = 'b7101000-0000-4000-8000-000000000001'
PUBLISHER = 'b7101000-0000-4000-8000-000000000004'
EMP = 'b7101000-1111-4000-8000-000000000001'
PACK = 'b7101000-2222-4000-8000-000000000001'
VERSION = 'b7101000-3333-4000-8000-000000000001'
GRANT = 'b7101000-4444-4000-8000-000000000001'


def run(sql):
    p = subprocess.run([PSQL, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-c', sql],
                       capture_output=True, text=True, timeout=15)
    if p.returncode:
        raise RuntimeError('lifecycle SQL command failed: ' + p.stderr[-1600:])
    return p.stdout.strip()


def check(value, label):
    if not value:
        raise AssertionError(label)
    print('ok  ' + label, flush=True)


def session(label):
    env = dict(os.environ, PGAPPNAME='ri_lifecycle_' + label)
    return subprocess.Popen([PSQL, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-d', DB],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, env=env)


def send(p, sql):
    p.stdin.write(sql + '\n')
    p.stdin.flush()


def wait_ready(p):
    # Read only a deterministic sentinel; arbitrary candidate data is never read.
    if p.stdout.readline().strip() != 'LC_READY':
        raise RuntimeError('lifecycle holder failed to reach ready sentinel')


def blocked_on_content(label):
    for _ in range(60):
        if run("SELECT EXISTS(SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid "
               "WHERE a.datname=current_database() AND a.application_name='ri_lifecycle_" + label +
               "' AND a.wait_event_type='Lock' AND l.locktype='advisory' AND NOT l.granted "
               "AND l.classid=20370307 AND l.objid=1)") == 't':
            return True
        time.sleep(.05)
    return False


def actor(uid):
    return "SELECT set_config('request.jwt.claim.sub','" + uid + "',false); SET ROLE authenticated;"


def create(label):
    return ("SELECT public.scp_iv_create_case('" + EMP + "','Lifecycle race','" + VERSION +
            "','Synthetic only',NULL,'" + label + "');")


def revoke():
    return ("UPDATE public.scp_interview_pack_pilot_grants SET revoked_at=clock_timestamp()," +
            "revoked_by='" + PUBLISHER + "',revocation_reason='Synthetic race stop' WHERE id='" + GRANT + "';")


def overlap(first_sql, second_sql, expected_denial, label):
    a, b = session(label + '_a'), session(label + '_b')
    try:
        send(a, 'BEGIN; ' + first_sql + " SELECT 'LC_READY';")
        # Ignore function scalar output before the readiness marker.
        for _ in range(8):
            if a.stdout.readline().strip() == 'LC_READY':
                break
        else:
            raise RuntimeError('first transaction not ready')
        send(b, second_sql)
        check(blocked_on_content(label + '_b'), label + ' second request waits on shared content lock')
        send(a, 'COMMIT;')
        a.stdin.close()
        a.wait(timeout=10)
        if a.returncode:
            raise RuntimeError('first transaction failed')
        b.stdin.close()
        b.wait(timeout=10)
        error = b.stderr.read()
        if expected_denial:
            check(b.returncode != 0 and 'SCP_IV_PACK_NOT_USABLE' in error,
                  label + ' loser receives authoritative new-start denial')
        else:
            check(b.returncode == 0, label + ' both transactions finish without deadlock')
    finally:
        for p in (a, b):
            if p.poll() is None:
                p.kill()
                p.wait(timeout=3)


run("""
INSERT INTO auth.users(id,email) VALUES
 ('b7101000-0000-4000-8000-000000000001','lifecycle-race-owner@synthetic.invalid'),
 ('b7101000-0000-4000-8000-000000000004','lifecycle-race-publisher@synthetic.invalid');
INSERT INTO public.employers(id,name,slug,status) VALUES
 ('b7101000-1111-4000-8000-000000000001','Lifecycle race synthetic','lifecycle-race-synthetic','active');
INSERT INTO public.employer_memberships(user_id,employer_id,role,status) VALUES
 ('b7101000-0000-4000-8000-000000000001','b7101000-1111-4000-8000-000000000001','owner','active');
INSERT INTO public.scp_content_roles(user_id,role) VALUES
 ('b7101000-0000-4000-8000-000000000004','publisher');
INSERT INTO public.scp_interview_packs(id,slug,role_id,name_sv,purpose_sv)
 SELECT 'b7101000-2222-4000-8000-000000000001','lifecycle-race-only',role_id,'Synthetic','Race setup'
 FROM public.scp_interview_packs WHERE slug='vaktare-se';
INSERT INTO public.scp_interview_pack_versions
 (id,pack_id,version_number,locale,role_version_id,source_reference,source_document_version,pilot_availability)
 SELECT 'b7101000-3333-4000-8000-000000000001','b7101000-2222-4000-8000-000000000001',1,locale,role_version_id,
 'Synthetic lifecycle fixture','Synthetic','restricted'
 FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id=v.pack_id
 WHERE p.slug='vaktare-se' AND v.version_number=1;
INSERT INTO public.scp_interview_pack_pilot_grants
 (id,employer_id,pack_version_id,rationale,usage_mode,environment,expires_on)
 VALUES('b7101000-4444-4000-8000-000000000001','b7101000-1111-4000-8000-000000000001',
 'b7101000-3333-4000-8000-000000000001','Synthetic race','internal_qa','development',current_date+30);
""")
# Grant revocation wins: start really waits before observing the committed revoke.
overlap(revoke(), actor(OWNER) + create('LC-GRANT-FIRST'), True, 'LC-R1 revoke before new start')
check(run("SELECT count(*) FROM public.scp_interview_cases WHERE candidate_external_ref='LC-GRANT-FIRST'") == '0',
      'LC-R1 denied start persisted no case')
# Draft allows a controlled regrant in this disposable fixture; no production API.
run("UPDATE public.scp_interview_pack_pilot_grants SET revoked_at=NULL,revoked_by=NULL,revocation_reason=NULL WHERE id='" + GRANT + "'")
overlap(actor(OWNER) + create('LC-START-FIRST'), revoke(), False, 'LC-R2 start before revoke')
check(run("SELECT count(*) FROM scp_private.interview_content_snapshots s JOIN public.scp_interview_cases c "
          "ON c.id=s.case_id WHERE c.candidate_external_ref='LC-START-FIRST' AND s.provenance='case_created'") == '1',
      'LC-R2 prior start keeps atomic snapshot')
# Withdrawal-vs-start order uses the real publisher RPCs. Private ladder fixture
# never inserts reviews or changes the stored hash.
run("SELECT set_config('scp_interview.governed_transition','on',false); " +
    ''.join("UPDATE public.scp_interview_pack_versions SET content_status='" + state + "' WHERE id='" + VERSION + "';"
            for state in ['expert_review', 'legal_review', 'cognitive_review', 'published']) +
    " SELECT set_config('scp_interview.governed_transition','off',false);")
suspend = "SELECT public.scp_interview_suspend_version('" + VERSION + "','Synthetic stop');"
retire = "SELECT public.scp_interview_retire_version('" + VERSION + "','Synthetic retire');"
overlap(actor(PUBLISHER) + suspend, actor(OWNER) + create('LC-WITHDRAW-FIRST'), True,
        'LC-R3 suspension before new start')
check(run("SELECT count(*) FROM public.scp_interview_cases WHERE candidate_external_ref='LC-WITHDRAW-FIRST'") == '0',
      'LC-R3 suspended denied start persisted no case')
# Republishing here is a PRIVATE disposable state fixture, not approval.
run("SELECT set_config('scp_interview.governed_transition','on',false); UPDATE public.scp_interview_pack_versions "
    "SET content_status='published' WHERE id='" + VERSION + "'; SELECT set_config('scp_interview.governed_transition','off',false);")
# A published pack normally requires an approved production method. Reuse the
# frozen draft method explicitly on the direct service/table-owner INSERT path;
# this order tests only eligibility+atomic capture, not approved composition.
direct = ("INSERT INTO public.scp_interview_cases(employer_id,pack_version_id,role_version_id,title," +
          "candidate_display_name,candidate_external_ref,trust_method_id,created_by) SELECT '" + EMP +
          "',v.id,v.role_version_id,'Synthetic race','Synthetic','LC-RETIRE-AFTER'," +
          "(SELECT trust_method_id FROM public.scp_interview_cases WHERE candidate_external_ref='LC-START-FIRST'),'" + OWNER +
          "' FROM public.scp_interview_pack_versions v WHERE v.id='" + VERSION + "';")
overlap(direct, actor(PUBLISHER) + retire, False, 'LC-R4 start before retirement')
check(run("SELECT count(*) FROM scp_private.interview_content_snapshots s JOIN public.scp_interview_cases c "
          "ON c.id=s.case_id WHERE c.candidate_external_ref='LC-RETIRE-AFTER'") == '1',
      'LC-R4 already started case retains frozen snapshot after retirement')
check(run("SELECT public.scp_iv_case_start_basis('" + EMP + "','" + VERSION + "','" + OWNER + "') IS NULL") == 't',
      'LC-R4 retirement blocks subsequent new start')
