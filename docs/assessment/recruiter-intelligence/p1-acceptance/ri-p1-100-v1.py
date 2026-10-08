#!/usr/bin/env python3
"""RI-P1-100-v1: proposed acceptance oracle, not product verification.

Uses only Python's standard library. No product imports, DB, network, AI,
messages, production writes or schema changes. The model enumerates synthetic
facts and exercises the proposed rules, version bindings and CAS contract.
It does NOT prove that P1 APIs, Storage, SQL, UI or permissions implement them.
The commercial criteria and this oracle are not yet approved.
"""

import copy
import datetime
import json


class StaleRevision(Exception):
    pass


class UnsupportedClaim(Exception):
    pass


RIDS = ["10000000-0000-4000-8000-{:012}".format(i) for i in range(1, 5)]
PROFILE_V1 = {"version": "V1", "confirmed": True, "must": RIDS[:],
              "start_date": "2026-11-01"}
PROFILE_V2 = dict(PROFILE_V1, version="V2", start_date="2026-12-01")
PRIORITY = {"green": 0, "yellow": 1, "gray": 2, "not_established": 3}


def source(kind, answer=True):
    return {"version": 1, "kind": kind, "available": True,
            "accepted": True, "readable": True, "checked": True,
            "control_current": True, "answer": answer,
            "valid_until": "2027-01-01", "contradiction": False}


def requirement_state(row, rid, profile):
    # AI drafts are intentionally not inputs to the authoritative model.
    s = row["sources"][rid]
    if not all(s[k] for k in ["available", "accepted", "readable", "control_current"]):
        return "clarify"
    if rid == RIDS[1]:
        if s["kind"] != "document" or not s["checked"] or s["valid_until"] is None:
            return "clarify"
        return "met" if s["valid_until"] >= profile["start_date"] else "not_met"
    if s["kind"] != "self_declaration" or s["answer"] is None or s["contradiction"]:
        return "clarify"
    return "met" if s["answer"] is True else "not_met"


def classify(row, profile):
    if not profile["confirmed"] or not profile["must"]:
        return "not_established"
    states = [requirement_state(row, rid, profile) for rid in profile["must"]]
    if "not_met" in states:
        return "yellow"
    if "clarify" in states:
        return "gray"
    return "green" if states and all(s == "met" for s in states) else "gray"


def binding(row, profile):
    # Explicitly pins source facts/revisions and the profile's rule/date.
    # This is an oracle token, not a proposed DB schema or hash algorithm.
    return json.dumps({"profile": profile, "sources": row["sources"]},
                      sort_keys=True, separators=(",", ":"))


def is_reviewed(row, profile):
    return row["review_binding"] == binding(row, profile)


def confirm_review(row, profile, expected_revision, reviewed_requirement_ids,
                   open_questions_handled):
    if expected_revision != row["revision"]:
        raise StaleRevision("STALE_REVISION")
    if set(reviewed_requirement_ids) != set(profile["must"]) or not open_questions_handled:
        raise UnsupportedClaim("REVIEW_INCOMPLETE")
    row["review_binding"] = binding(row, profile)
    row["revision"] += 1
    return row["revision"]


def assert_claim_supported(row, rid, profile, claimed_state):
    if requirement_state(row, rid, profile) != claimed_state:
        raise UnsupportedClaim("CLAIM_HAS_NO_ACCEPTED_CURRENT_BASIS")


def base_rows():
    rows = []
    for i in range(1, 101):
        sources = {rid: source("document" if rid == RIDS[1] else "self_declaration")
                   for rid in RIDS}
        row = {"id": "A{:03}".format(i),
               "application_uuid": "00000000-0000-4000-8000-{:012}".format(i),
               "number": i,
               "applied_at": (datetime.datetime(2026, 10, 1, 8, 0) +
                              datetime.timedelta(minutes=i)).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "owner": "Alice" if i % 2 else "Bob",
               "stage": "submitted" if i <= 50 else "reviewing" if i <= 80 else "interview",
               "archived": False, "sources": sources,
               "merits": {"M1": "met", "M2": "clarify"},
               "ai_drafts": [], "revision": 7, "review_binding": None,
               "first_viewed": i <= 20}
        if 31 <= i <= 40:
            sources[RIDS[1]]["valid_until"] = "2026-11-15"
        if 41 <= i <= 60:
            sources[RIDS[0]]["answer"] = False
        if 56 <= i <= 60 or 66 <= i <= 75:
            sources[RIDS[1]]["available"] = False
        if 61 <= i <= 65:
            sources[RIDS[1]]["valid_until"] = "2026-10-15"
        if 76 <= i <= 80:
            sources[RIDS[1]]["readable"] = False
        if 81 <= i <= 85:
            sources[RIDS[2]]["contradiction"] = True
        if 86 <= i <= 90:
            sources[RIDS[0]]["answer"] = None
        if 91 <= i <= 95:
            sources[RIDS[1]]["available"] = False
        if 96 <= i <= 100:
            sources[RIDS[3]]["answer"] = None
            row["ai_drafts"] = [{"requirement_id": RIDS[3], "suggested": "met",
                                 "accepted": False, "historical_fixture": True}]
        if i <= 10 or 41 <= i <= 47 or 66 <= i <= 75:
            row["review_binding"] = binding(row, PROFILE_V1)
        rows.append(row)
    return rows


def ordered(rows, profile):
    # Stable sorts compose UUID-asc, date-desc, then group priority. This is
    # a reference ordering only, not the SQL/client implementation.
    result = sorted(rows, key=lambda row: row["application_uuid"])
    result.sort(key=lambda row: row["applied_at"], reverse=True)
    result.sort(key=lambda row: PRIORITY[classify(row, profile)])
    return result


def counts(rows, profile):
    groups = {}
    for group in PRIORITY:
        scoped = [r for r in rows if classify(r, profile) == group]
        reviewed = sum(is_reviewed(r, profile) for r in scoped)
        groups[group] = {"received": len(scoped), "reviewed": reviewed,
                         "remaining": len(scoped) - reviewed}
    reviewed = sum(is_reviewed(r, profile) for r in rows)
    ids = [r["id"] for r in ordered(rows, profile)]
    return {"received": len(rows), "reviewed": reviewed,
            "remaining": len(rows) - reviewed, "groups": groups,
            "pages": [ids[i:i + 25] for i in range(0, len(ids), 25)]}


def expect(rows, profile, colors, reviewed):
    got = counts(rows, profile)
    assert [got["groups"][g]["received"] for g in ["green", "yellow", "gray"]] == colors
    assert got["reviewed"] == reviewed
    assert got["remaining"] == len(rows) - reviewed
    assert sum(g["received"] for g in got["groups"].values()) == len(rows)
    return got


def get(rows, i):
    return rows[i - 1]


def run():
    rows = base_rows()
    assert len(set(r["application_uuid"] for r in rows)) == 100
    report = {"status": "PROPOSED_ACCEPTANCE_ORACLE_NOT_PRODUCT_VERIFICATION",
              "fixture": "RI-P1-100-v1", "product_imports": False,
              "database_or_browser_tests": False, "facit_approved": False}
    report["base"] = expect(rows, PROFILE_V1, [40, 25, 35], 27)
    for row in rows:
        expected = "green" if row["number"] <= 40 else "yellow" if row["number"] <= 65 else "gray"
        assert classify(row, PROFILE_V1) == expected
    assert [len(p) for p in report["base"]["pages"]] == [25, 25, 25, 25]
    report["rows"] = [dict(id=r["id"], application_uuid=r["application_uuid"],
                           color=classify(r, PROFILE_V1), owner=r["owner"], stage=r["stage"],
                           reviewed=is_reviewed(r, PROFILE_V1),
                           states=[requirement_state(r, rid, PROFILE_V1) for rid in RIDS])
                      for r in rows]
    filters = {"green": lambda r: classify(r, PROFILE_V1) == "green",
               "yellow": lambda r: classify(r, PROFILE_V1) == "yellow",
               "gray": lambda r: classify(r, PROFILE_V1) == "gray",
               "unreviewed": lambda r: not is_reviewed(r, PROFILE_V1),
               "yellow_unreviewed": lambda r: classify(r, PROFILE_V1) == "yellow" and not is_reviewed(r, PROFILE_V1),
               "gray_unreviewed": lambda r: classify(r, PROFILE_V1) == "gray" and not is_reviewed(r, PROFILE_V1),
               "Alice": lambda r: r["owner"] == "Alice",
               "Bob": lambda r: r["owner"] == "Bob",
               "submitted": lambda r: r["stage"] == "submitted",
               "reviewing": lambda r: r["stage"] == "reviewing",
               "interview": lambda r: r["stage"] == "interview"}
    report["filters"] = {name: counts([r for r in rows if predicate(r)], PROFILE_V1)
                         for name, predicate in filters.items()}
    assert report["filters"]["unreviewed"]["received"] == 73
    assert [len(p) for p in report["filters"]["unreviewed"]["pages"]] == [25, 25, 23]
    assert report["filters"]["Alice"]["reviewed"] == 14
    assert report["filters"]["Bob"]["reviewed"] == 13

    scenarios = {}
    v2 = copy.deepcopy(rows)
    scenarios["K3_V2_recomputed"] = expect(v2, PROFILE_V2, [30, 35, 35], 0)
    for i in range(1, 11):
        confirm_review(get(v2, i), PROFILE_V2, 7, RIDS, True)
    scenarios["K5_V2_human_confirmed_10"] = expect(v2, PROFILE_V2, [30, 35, 35], 10)

    revoked = copy.deepcopy(rows)
    for i in range(1, 6):
        get(revoked, i)["sources"][RIDS[1]]["available"] = False
    scenarios["U1_revoked"] = expect(revoked, PROFILE_V1, [35, 25, 40], 22)
    for i in range(1, 6):
        s = get(revoked, i)["sources"][RIDS[1]]
        s.update(version=2, available=True, checked=False)
    scenarios["U2_new_source_not_checked"] = expect(revoked, PROFILE_V1, [35, 25, 40], 22)
    for i in range(1, 6):
        get(revoked, i)["sources"][RIDS[1]]["checked"] = True
    scenarios["U2_source_checked_not_review_confirmed"] = expect(revoked, PROFILE_V1, [40, 25, 35], 22)
    for i in range(1, 6):
        confirm_review(get(revoked, i), PROFILE_V1, 7, RIDS, True)
    scenarios["U2_review_confirmed"] = expect(revoked, PROFILE_V1, [40, 25, 35], 27)

    changed = copy.deepcopy(rows)
    s = get(changed, 6)["sources"][RIDS[1]]
    s.update(version=2, checked=False, valid_until="2026-10-15")
    scenarios["U3_changed_not_checked"] = expect(changed, PROFILE_V1, [39, 25, 36], 26)
    s["checked"] = True
    scenarios["U3_new_date_checked"] = expect(changed, PROFILE_V1, [39, 26, 35], 26)
    confirm_review(get(changed, 6), PROFILE_V1, 7, RIDS, True)
    scenarios["U3_review_confirmed"] = expect(changed, PROFILE_V1, [39, 26, 35], 27)

    correction = copy.deepcopy(rows)
    get(correction, 81)["sources"][RIDS[2]].update(version=2, contradiction=False)
    scenarios["U4_correction_accepted"] = expect(correction, PROFILE_V1, [41, 25, 34], 27)
    confirm_review(get(correction, 81), PROFILE_V1, 7, RIDS, True)
    scenarios["U4_review_confirmed"] = expect(correction, PROFILE_V1, [41, 25, 34], 28)

    expired = copy.deepcopy(rows)
    get(expired, 7)["sources"][RIDS[1]]["control_current"] = False
    scenarios["U5_control_expired"] = expect(expired, PROFILE_V1, [39, 25, 36], 26)

    concurrent = copy.deepcopy(rows)
    a76 = get(concurrent, 76)
    winner = confirm_review(a76, PROFILE_V1, 7, RIDS, True)
    assert winner == 8
    scenarios["CAS_Alice_winner_revision_8"] = expect(concurrent, PROFILE_V1, [40, 25, 35], 28)
    try:
        confirm_review(a76, PROFILE_V1, 7, RIDS, True)
        raise AssertionError("Stale CAS must be rejected")
    except StaleRevision:
        pass
    assert a76["revision"] == 8
    scenarios["CAS_Bob_stale_7_rejected"] = expect(concurrent, PROFILE_V1, [40, 25, 35], 28)
    try:
        assert_claim_supported(a76, RIDS[1], PROFILE_V1, "met")
        raise AssertionError("Unreadable document must not support met")
    except UnsupportedClaim:
        pass
    confirm_review(a76, PROFILE_V1, 8, RIDS, True)
    assert a76["revision"] == 9
    scenarios["CAS_reread_no_double_count"] = expect(concurrent, PROFILE_V1, [40, 25, 35], 28)
    for i in [77, 78]:
        confirm_review(get(concurrent, i), PROFILE_V1, 7, RIDS, True)
    scenarios["CAS_two_other_applications"] = expect(concurrent, PROFILE_V1, [40, 25, 35], 30)

    for proposed in ["met", "not_met"]:
        ai = copy.deepcopy(get(rows, 100))
        ai["ai_drafts"] = [{"requirement_id": RIDS[3], "suggested": proposed}]
        assert requirement_state(ai, RIDS[3], PROFILE_V1) == "clarify"
        assert classify(ai, PROFILE_V1) == "gray"
        assert not is_reviewed(ai, PROFILE_V1)
    report["AI_only_positive_and_negative"] = {"requirement_state": "clarify",
                                               "color": "gray", "reviewed": False,
                                               "model_calls": 0}

    merits = copy.deepcopy(rows)
    for r in merits:
        r["merits"] = {"M1": "not_met", "M2": "met"}
    scenarios["merits_do_not_compensate"] = expect(merits, PROFILE_V1, [40, 25, 35], 27)
    tied = copy.deepcopy(rows)
    get(tied, 10)["applied_at"] = get(tied, 9)["applied_at"]
    tied_ids = [r["id"] for r in ordered(tied, PROFILE_V1)]
    assert tied_ids.index("A009") < tied_ids.index("A010")
    scenarios["tied_dates_ID_ascending"] = expect(tied, PROFILE_V1, [40, 25, 35], 27)
    empty = dict(PROFILE_V1, must=[])
    empty_counts = counts(rows, empty)
    assert empty_counts["groups"]["green"]["received"] == 0
    assert empty_counts["groups"]["not_established"]["received"] == 100
    scenarios["empty_profile_never_green"] = empty_counts
    unconfirmed = counts(rows, dict(PROFILE_V1, confirmed=False))
    assert unconfirmed["groups"]["not_established"]["received"] == 100
    assert unconfirmed["groups"]["green"]["received"] == 0
    scenarios["unconfirmed_profile_never_green"] = unconfirmed

    lifecycle = copy.deepcopy(rows)
    get(lifecycle, 91)["stage"] = "withdrawn"
    get(lifecycle, 92)["archived"] = True
    get(lifecycle, 41)["stage"] = "rejected"
    non_archived = [r for r in lifecycle if not r["archived"]]
    open_rows = [r for r in non_archived if r["stage"] in ["submitted", "reviewing", "interview"]]
    scenarios["lifecycle_open_97"] = expect(open_rows, PROFILE_V1, [40, 24, 33], 26)
    assert len(non_archived) == 99
    assert sum(r["archived"] for r in lifecycle) == 1
    report["lifecycle_scope"] = {"received": 100, "all_non_archived": 99,
                                 "open_non_archived": 97, "archived": 1,
                                 "withdrawn": 1, "rejected": 1}
    report["scenarios"] = scenarios
    report["assertions"] = "PASS: synthetic oracle assertions only; not P1 API/platform verification"
    return report


if __name__ == "__main__":
    print(json.dumps(run(), indent=2, sort_keys=True))
