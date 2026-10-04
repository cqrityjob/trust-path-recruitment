"""Direct PostgREST proof on a CLONE of the established local backend.
Reuses employer_report_access_fixture.sql. Real PostgreSQL/RLS and PostgREST;
signed synthetic local JWTs, not Google/GoTrue login evidence. No remote hosts.
The supplied DB must be disposable and already have the final migration.
Creates a temporary loopback-only REST sidecar using the existing REST image,
network and signing key. Never logs keys/tokens. Does not modify the shared DB.
"""
import base64
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

DOCKER = os.environ.get('DOCKER_BIN', '/opt/homebrew/bin/docker')
DB = os.environ.get('TEST_DB', 'cqrityjob_report_boundary_http')
DB_CONTAINER = 'codex-interview-access-db'
REST_CONTAINER = 'codex-interview-access-rest'
SIDECAR = 'codex-participant-report-api-proof'
BASE = 'http://127.0.0.1:59134'
assert DB.startswith('cqrityjob_report_boundary_') and DB.replace('_', '').isalnum()
ROOT = Path(__file__).resolve().parent.parent
MIG = ROOT / 'supabase/migrations/20270216090000_participant_report_api_boundary.sql'
RB = ROOT / 'supabase/rollback/20270216090000_participant_report_api_boundary_rollback.sql'

def docker(*args, **kw):
    return subprocess.check_output([DOCKER, *args], **kw)

def sql(statement):
    return docker('exec', '-i', DB_CONTAINER, 'psql', '-X', '-U', 'postgres', '-d', DB,
                  '-v', 'ON_ERROR_STOP=1', '-Atq', input=statement.encode(), stderr=subprocess.PIPE).decode()

def file(path):
    return sql(path.read_text())

def jwt(user=None):
    def enc(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    claims = {'role': 'authenticated' if user else 'anon', 'exp': int(time.time()) + 1800}
    if user:
        claims['sub'] = user
    message = enc({'alg': 'HS256', 'typ': 'JWT'}) + '.' + enc(claims)
    sig = base64.urlsafe_b64encode(hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()).decode().rstrip('=')
    return message + '.' + sig

def api(path, user=None, payload=None):
    headers = {'Authorization': 'Bearer ' + jwt(user), 'Content-Type': 'application/json'}
    request = urllib.request.Request(BASE + '/' + path, headers=headers,
                                    data=None if payload is None else json.dumps(payload).encode())
    try:
        with urllib.request.urlopen(request) as response:
            body = response.read()
            return response.status, json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())

def rpc(name, user, **args):
    return api('rpc/' + name, user, args)

def check(ok, label):
    if not ok:
        raise AssertionError(label)
    print('ok HTTP ' + label, flush=True)

def history_digest():
    return sql("SELECT md5(coalesce(string_agg(v, '' ORDER BY v), '')) FROM ("
               "SELECT row_to_json(t)::text v FROM public.scp_report_snapshots t UNION ALL "
               "SELECT row_to_json(t)::text FROM public.scp_competency_evidence t UNION ALL "
               "SELECT row_to_json(t)::text FROM public.cd_v31_funnel_events t UNION ALL "
               "SELECT row_to_json(t)::text FROM public.cd_test_feedback t) data")

def projections():
    return [rpc('scp_employer_report', ids['owner'], _attempt_id=ids['workforce']),
            rpc('scp_subject_progress', ids['owner'], _subject_id=ids['worker_subject']),
            rpc('scp_development_recommendations', ids['owner'], _subject_id=ids['worker_subject']),
            rpc('scp_participant_report_for_issuer', ids['owner'], _attempt_id=ids['workforce'])]

rest = json.loads(docker('inspect', REST_CONTAINER))[0]
env = dict(item.split('=', 1) for item in rest['Config']['Env'])
secret = env['PGRST_JWT_SECRET']
uri = urllib.parse.urlsplit(env['PGRST_DB_URI'])
assert uri.hostname == DB_CONTAINER
# Dedicated database and dedicated REST process; original services stay untouched.
env['PGRST_DB_URI'] = urllib.parse.urlunsplit(uri._replace(path='/' + DB))
# Reuse the existing harness's standard PostgREST JWT claim readers. The SQL
# replay DB uses single-claim GUCs; real PostgREST sends request.jwt.claims.
harness = (ROOT / 'scripts/local-stack/harness.sql').read_text()
start = harness.index('CREATE OR REPLACE FUNCTION auth.uid()')
end = harness.index('$$;', harness.index('CREATE OR REPLACE FUNCTION auth.jwt()', start)) + 3
sql(harness[start:end])
fixture = (ROOT / 'supabase/tests/employer_report_access_fixture.sql').read_text()
result = sql('BEGIN;\n' + fixture + '''
REVOKE SELECT ON public.scp_report_snapshots FROM authenticated;
SELECT json_build_object('owner', rm.ow, 'worker', rm.p, 'candidate', rm.c1, 'other', rm.c2,
  'workforce', rma.r1, 'workforce2', rma.r2, 'candidate_attempt', rma.v1,
  'worker_subject', rms.s1, 'candidate_subject', rms.sv1) FROM rm, rma, rms;
COMMIT;
''')
ids = json.loads(next(line for line in result.splitlines() if line.startswith('{')))
args = ['run', '-d', '--rm', '--name', SIDECAR, '--network', 'codex-interview-access', '-p', '127.0.0.1:59134:3000']
process_env = os.environ.copy()
for key, value in env.items():
    args.extend(['-e', key])
    process_env[key] = value
args.append(rest['Config']['Image'])
docker(*args, env=process_env, stderr=subprocess.PIPE)
try:
    for _ in range(30):
        try:
            if api('rpc/cd_access_state', payload={})[0] == 200:
                break
        except (urllib.error.URLError, http.client.RemoteDisconnected):
            pass
        time.sleep(.2)
    baseline = projections()
    check(all(status == 200 and rows for status, rows in baseline), 'employer and issuer retain nonempty access')
    for name, param, value in [('scp_participant_report', '_attempt_id', ids['workforce']),
                              ('scp_subject_progress', '_subject_id', ids['worker_subject']),
                              ('scp_development_recommendations', '_subject_id', ids['worker_subject'])]:
        check(rpc(name, ids['worker'], **{param: value}) == (200, []), name + ' blocks workforce')
    for name, param, value in [('scp_participant_report', '_attempt_id', ids['candidate_attempt']),
                              ('scp_subject_progress', '_subject_id', ids['candidate_subject']),
                              ('scp_development_recommendations', '_subject_id', ids['candidate_subject'])]:
        status, data = rpc(name, ids['candidate'], **{param: value})
        check(status == 200 and bool(data), name + ' preserves candidate')
        check(rpc(name, ids['other'], **{param: value}) == (200, []), name + ' denies other candidate')
        check(rpc(name, None, **{param: value})[0] == 401, name + ' denies anon')
    check(api('scp_report_snapshots?select=id', ids['worker'])[0] == 403, 'direct snapshot table denied')
    for user in [None, ids['candidate']]:
        check(rpc('cd_record_funnel_event', user, _event_name='result_viewed')[0] in [401, 403], 'direct funnel RPC denied')
        check(rpc('cd_submit_test_feedback', user, _locale='sv')[0] == 204, 'test feedback preserved')
    sql('GRANT SELECT ON public.scp_report_snapshots TO authenticated;')
    check(api('scp_report_snapshots?select=id', ids['worker']) == (200, []), 'direct RLS with SELECT still denies workforce')
    check(len(api('scp_report_snapshots?select=id', ids['candidate'])[1]) == 1, 'direct RLS preserves candidate')
    sql('REVOKE SELECT ON public.scp_report_snapshots FROM authenticated;')
    # Real rollback is the HTTP negative control, using exactly the same calls.
    before_rollback = history_digest()
    file(RB)
    check(history_digest() == before_rollback, 'rollback preserves all report/evidence/funnel/feedback rows')
    for name, param, value in [('scp_participant_report', '_attempt_id', ids['workforce']),
                              ('scp_subject_progress', '_subject_id', ids['worker_subject']),
                              ('scp_development_recommendations', '_subject_id', ids['worker_subject'])]:
        status, data = rpc(name, ids['worker'], **{param: value})
        check(status == 200 and bool(data), 'OLD ACCESS REPRODUCED ' + name)
    check(rpc('cd_record_funnel_event', ids['worker'], _event_name='result_viewed')[0] == 204, 'OLD ACCESS REPRODUCED client funnel write')
    before_reapply = history_digest()
    file(MIG)
    check(history_digest() == before_reapply, 'migration preserves all report/evidence/funnel/feedback rows')
    check(projections() == baseline, 'migration/rollback preserves employer and issuer payloads')
    check(rpc('scp_participant_report', ids['worker'], _attempt_id=ids['workforce']) == (200, []), 'reapply closes workforce report')
    # Empty mixed history is invisible to a progress-only gate but must stop recommendations.
    sql("BEGIN; ALTER TABLE public.scp_report_snapshots DISABLE TRIGGER USER; "
        "UPDATE public.scp_report_snapshots SET subject_id='" + ids['candidate_subject'] + "', payload='[]', context='{}' "
        "WHERE audience='participant' AND attempt_id='" + ids['workforce2'] + "'; "
        "ALTER TABLE public.scp_report_snapshots ENABLE TRIGGER USER; COMMIT;")
    check(rpc('scp_development_recommendations', ids['candidate'], _subject_id=ids['candidate_subject']) == (200, []), 'empty unknown history withholds recommendations')
    check(bool(rpc('scp_participant_report', ids['candidate'], _attempt_id=ids['candidate_attempt'])[1]), 'mixed history preserves candidate report')
finally:
    # Leave the disposable DB secured even if an assertion fails during rollback.
    file(MIG)
    docker('stop', SIDECAR, stderr=subprocess.PIPE)
