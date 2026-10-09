#!/usr/bin/env python3
"""Real two-SQL-connection races, synthetic Auth stub only; no API/GoTrue claim."""
import os
import select
import subprocess
import sys
import time
from pathlib import Path

DB = os.environ['WORKSPACE_RACE_DB']
PSQL = os.environ.get('WORKSPACE_PSQL', 'psql')
scenario = sys.argv[1]
if (scenario not in ('cas', 'down') or not DB.endswith('_ws_' + scenario + '_ci_test')
        or os.environ.get('PGHOST') not in ('127.0.0.1', 'localhost')):
    raise SystemExit('refuse nonlocal workspace race target')
JOB = 'ee100000-2222-4000-8000-000000000001'
OWNER = 'ee100000-0000-4000-8000-000000000001'
BOB = 'ee100000-0000-4000-8000-000000000002'


def run(sql):
    p = subprocess.run([PSQL, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-c', sql],
                       capture_output=True, text=True, timeout=20)
    if p.returncode:
        raise RuntimeError('workspace fixture SQL failed: ' + p.stderr[-1200:])
    return p.stdout.strip()


def check(value, label):
    if not value:
        raise AssertionError(label)
    print('ok WORKSPACE_RACE ' + label, flush=True)


def session(label):
    return subprocess.Popen([PSQL, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', DB],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True,
                            env=dict(os.environ, PGAPPNAME='ri_workspace_' + label))


def send(p, sql):
    p.stdin.write(sql + '\n')
    p.stdin.flush()


def wait_ready(p):
    deadline = time.monotonic() + 10
    output = ''
    while time.monotonic() < deadline:
        ready, _, _ = select.select([p.stdout], [], [], .1)
        if ready:
            output += os.read(p.stdout.fileno(), 4096).decode('utf8')
            if 'WS_READY\n' in output:
                return
        if p.poll() is not None:
            raise RuntimeError('workspace first transaction ended early')
    raise RuntimeError('workspace first transaction readiness timeout')


def wait_blocked(label, relation):
    query = ("SELECT EXISTS(SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid "
             "WHERE a.datname=current_database() AND a.application_name='ri_workspace_" + label +
             "' AND a.wait_event_type='Lock' AND NOT l.granted AND l.locktype='relation' "
             "AND l.relation='" + relation + "'::regclass)")
    for _ in range(60):
        if run(query) == 't':
            return True
        time.sleep(.05)
    return False


def confirm(uid, op):
    return ("SELECT set_config('request.jwt.claim.sub','" + uid + "',false); SET ROLE authenticated; "
            "SELECT public.rec_ri_confirm_reviewed_profile('" + JOB + "',1,'" + op +
            "','2026-12-01',(SELECT rules FROM public.rec_requirement_profiles WHERE job_id='" +
            JOB + "' AND version=1),'Synthetic explicit profile change')->>'version';")


fixture = Path('supabase/tests/fixtures/recruiter_workspace_100.sql').read_text()
run("BEGIN; CREATE FUNCTION pg_temp.ok(cond boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ "
    "BEGIN IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'fixture failed'; END IF; END $$; "
    "GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean,text) TO PUBLIC; " + fixture + ' RESET ROLE; COMMIT;')
a, b = session(scenario + '_a'), session(scenario + '_b')
try:
    send(a, 'BEGIN; ' + confirm(OWNER, 'ee100000-7777-4000-8000-000000000011') + " SELECT 'WS_READY';")
    wait_ready(a)
    if scenario == 'cas':
        # It waits on the actual competing tuple transaction; relation row
        # locks can appear as transactionid waits, so inspect the blocker PID.
        send(b, confirm(BOB, 'ee100000-7777-4000-8000-000000000012'))
        blocked = False
        for _ in range(60):
            blocked = run("SELECT EXISTS(SELECT 1 FROM pg_stat_activity w JOIN pg_stat_activity h "
                          "ON h.pid=ANY(pg_blocking_pids(w.pid)) WHERE w.datname=current_database() "
                          "AND w.application_name='ri_workspace_cas_b' AND h.application_name='ri_workspace_cas_a')") == 't'
            if blocked:
                break
            time.sleep(.05)
        check(blocked, 'second genuine profile confirmation waits for first job-row writer')
    else:
        send(b, '\\i supabase/rollback/20270310100000_recruiter_profile_change_review_rollback.sql')
        check(wait_blocked('down_b', 'recruiter_intelligence.profile_change_reviews'),
              'empty DOWN waits on in-flight first audit writer before deciding emptiness')
    send(a, 'COMMIT;')
    a.stdin.close()
    a.wait(timeout=10)
    check(a.returncode == 0, 'first explicit human profile change commits')
    b.stdin.close()
    b.wait(timeout=10)
    error = b.stderr.read()
    expected = 'RI_STALE_VERSION' if scenario == 'cas' else 'RI_ROLLBACK_REQUIRES_PRESERVED_DATA'
    check(b.returncode != 0 and expected in error, 'loser fails with authoritative ' + expected)
    if scenario == 'cas':
        check('PT409' in error, 'domain CAS remains PT409 rather than engine retry SQLSTATE')
    check(run("SELECT count(*) FROM public.rec_requirement_profiles WHERE job_id='" + JOB + "'") == '2',
          'exactly original and one new profile survive')
    check(run('SELECT count(*) FROM recruiter_intelligence.profile_change_reviews') == '1',
          'exactly one immutable human change audit survives')
    if scenario == 'cas':
        check(run(confirm(OWNER, 'ee100000-7777-4000-8000-000000000011')) == OWNER + '\n2',
              'winner retry returns same version despite stale original expected version')
        check(run('SELECT count(*) FROM recruiter_intelligence.profile_change_reviews') == '1',
              'idempotent retry creates no extra audit')
    else:
        check(run("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN "
                  "('rec_ri_profile_change_impact','rec_ri_confirm_reviewed_profile','rec_ri_profile_change_history',"
                  "'rec_ri_compare_applications','rec_ri_next_unreviewed','rec_ri_page_evidence')") == '6',
              'refused concurrent DOWN leaves all six RPCs')
finally:
    for p in (a, b):
        if p.poll() is None:
            p.kill()
            p.wait(timeout=3)
