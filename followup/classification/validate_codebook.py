#!/usr/bin/env python3
"""Check draft coverage and provenance; do not infer classification validity."""

import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    book = json.loads((HERE / "v3-codebook.json").read_text())
    md = (HERE / "v3-codebook.md").read_text()
    audit = (HERE / "v1-boundary-audit.md").read_text()
    require(book["status"] == "unvalidated_proposal", "draft status changed")
    for key in ("evaluation_freeze_complete", "independent_test_performed",
                "human_independent_coding_performed", "psychological_effect_test_performed"):
        require(book[key] is False, f"unexpected execution claim: {key}")
    for source in book["source_documents"]:
        require(not Path(source["path"]).is_absolute(), "absolute source path")
        require(".." not in Path(source["path"]).parts, "source outside repository")
        data = (ROOT / source["path"]).read_bytes()
        require(hashlib.sha256(data).hexdigest() == source["sha256"],
                f"source changed: {source['path']}")

    expected = [f"{g}{i}" for g, n in zip("ABCDEF", (4, 4, 4, 5, 5, 4))
                for i in range(1, n + 1)]
    require([t["id"] for t in book["types"]] == expected, "26 type coverage/order")
    require(re.findall(r"^### ([A-F][1-5]) ", md, re.M) == expected, "Markdown coverage")
    shared = {c["id"] for c in book["common_required"]}
    require(shared == {"AE.G1", "AE.G2", *(f"F.G{i}" for i in range(1, 7))},
            "common requirements")
    for c in book["common_required"]:
        require(c["text"] in md, f"common condition missing from Markdown: {c['id']}")
    template = book["coding_record_template"]
    require("problem_state_records" in template and "world_model_records" in template,
            "separate A–E and F recording layers")
    f_fields = {"old_premise", "new_evidence", "evidence_scope", "actor_acceptance",
                "threat_recognition", "why_local_explanation_insufficient", "alternative_hypotheses"}
    require(f_fields <= template["world_model_records"][0].keys(), "F evidence template")
    contract = book["recording_contract"]
    require(contract["problem_state_ids"] == expected[:22] and
            contract["world_model_ids"] == expected[22:], "layer ID contract")

    scenes = {}
    totals = {"assigned_entries": 0, "verified": 0, "partial": 0, "unverified": 0}
    for path in sorted((ROOT / "groups").glob("*/data/mappings.json")):
        data = json.loads(path.read_text())
        totals["assigned_entries"] += len(data["works"])
        for w in data["works"]:
            totals[w["body_status"]] += 1
            for s in w["scenes"]:
                require(s["scene_id"] not in scenes, "duplicate scene ID")
                scenes[s["scene_id"]] = (s, w, path.relative_to(ROOT).as_posix())
    sources = {}
    for path in sorted((ROOT / "groups").glob("*/sources/ledger.csv")):
        for source in csv.DictReader(path.open()):
            require(source["source_id"] not in sources, "duplicate source ID")
            sources[source["source_id"]] = source

    historical = book["historical_counts"]
    for key in ("assigned_entries", "verified", "unverified"):
        require(historical[key] == totals[key], f"historical {key}")
    require(historical["partial_body"] == totals["partial"] == 14, "body partial count")
    require(historical["scene_rows"] == len(scenes) == 258, "scene count")
    fits = {}
    for s, _, _ in scenes.values():
        fits[s["fit"]] = fits.get(s["fit"], 0) + 1
    require(fits == {"適合": 75, "部分適合": 141, "不適合": 17, "本文不足": 25},
            "historical scene-level fit distribution")
    require((historical["scene_fit"], historical["scene_partial_fit"],
             historical["scene_not_fit"], historical["body_insufficient_rows"],
             historical["judged_scene_rows"]) == (75, 141, 17, 25, 233),
            "codebook historical scene counts")
    require(historical["independent_works_exact_total"] is None, "independent count")
    summary = json.loads((ROOT / "integration/data/summary.json").read_text())
    require(summary["counts"]["independent_works_exact_total"] is None, "summary independence")

    for t in book["types"]:
        require(t["layer"] == ("world_model" if t["id"].startswith("F") else "problem_state"),
                f"layer: {t['id']}")
        require(t["auxiliary_conditions"] is None and t["auxiliary_status"] == "unfixed"
                and t["partial_allowed"] is False, f"partial gate: {t['id']}")
        require(t["v3_positive_count"] is None, f"fabricated positive count: {t['id']}")
        require(set(t["common_required_ids"]) <= shared, f"common reference: {t['id']}")
        require(len(t["required_conditions"]) >= 2, f"conditions: {t['id']}")
        require([c["id"] for c in t["required_conditions"]] ==
                [f"{t['id']}.R{i}" for i in range(1, len(t["required_conditions"]) + 1)],
                f"condition IDs: {t['id']}")
        for c in t["required_conditions"]:
            require(c["text"] in md, f"Markdown condition: {c['id']}")
        for field in ("exclusion_rules", "descriptive_fields_only", "unresolved"):
            require(t[field], f"empty {field}: {t['id']}")
            for text in t[field]:
                require(text in md, f"Markdown {field}: {t['id']}")
        require(t["closure_proposal_from_v3"] in md, f"Markdown closure: {t['id']}")
        require(t["minimal_negative_case"]["kind"] == "synthetic_boundary_example",
                f"negative provenance: {t['id']}")
        require(t["minimal_negative_case"]["description"] in md, f"negative example: {t['id']}")
        require(len(t["development_examples"]) >= 2, f"insufficient references: {t['id']}")
        for e in t["development_examples"]:
            s, w, path = scenes[e["scene_id"]]
            require(e["source_path"] == path, f"source path: {e['scene_id']}")
            for key in ("work_id", "title", "body_status", "episode_scope"):
                require(e[key] == w[key], f"source work field: {e['scene_id']}/{key}")
            require(e["historical_scene_fit"] == s["fit"] and
                    e["historical_type_ids"] == s["type_ids"], f"historical record: {e['scene_id']}")
            require(e["source_ids"] == s["source_ids"], f"scene sources: {e['scene_id']}")
            require(e["v3_decision"] is None, f"new decision: {e['scene_id']}")
            require(e["role"] in {"development_candidate", "contrast", "historical_negative"},
                    f"example role: {e['scene_id']}")
            if e["role"] == "historical_negative":
                require(s["fit"] == "不適合", f"negative role: {e['scene_id']}")
            require(e["scene_id"] in md and e["review_question"] in md,
                    f"Markdown reference: {e['scene_id']}")
            for sid in e["source_ids"]:
                require(sid in sources and sources[sid]["work_id"] == w["work_id"]
                        and sources[sid]["url"], f"source ownership/URL: {sid}")

    inventory = book["historical_audit"]
    negative_ids = sorted(sid for sid, (s, _, _) in scenes.items() if s["fit"] == "不適合")
    require(inventory["not_fit_scene_ids"] == negative_ids and len(negative_ids) == 17,
            "17 negative rows")
    section = audit.split("## 17不適合行の全件索引")[1].split("## 8未採用候補")[0]
    require(sorted(re.findall(r"^\| \[(G\d\d-W\d\d-SC?\d\d)\]", section, re.M)) == negative_ids,
            "Markdown negative row coverage")
    for label, key in (("D2", "d2_label_scene_ids"), ("F", "f_label_scene_ids")):
        actual = sorted(sid for sid, (s, _, _) in scenes.items()
                        if any(x == label if label == "D2" else x.startswith(label)
                               for x in s["type_ids"]))
        require(inventory[key] == actual, f"label inventory: {label}")
    expected_candidates = ["G01-N01", "G01-N02", "G02-N01", "G02-N02",
                           "G03-N01", "G03-N02", "G04-N01", "G04-N02"]
    require([c["candidate_id"] for c in inventory["candidates"]] == expected_candidates,
            "eight candidates")
    require(historical["new_candidates"] == 8 and historical["candidates_adopted"] == 0,
            "candidate counts")
    for c in inventory["candidates"]:
        require(c["status"] == "not_adopted" and c["candidate_id"] in audit,
                f"candidate status: {c['candidate_id']}")
        require(c["evidence_scene_ids"] and all(sid in scenes for sid in c["evidence_scene_ids"]),
                f"candidate references: {c['candidate_id']}")

    for doc in (md, audit):
        for target in re.findall(r"\]\(([^)]+)\)", doc):
            require((HERE / target.split("#")[0]).is_file(), f"broken document link: {target}")
    print("OK: 26 types; partial disabled; 17 historical no-fit rows; 8 unadopted candidates; "
          "source hashes, references and Markdown consistent. Research remains unvalidated.")


if __name__ == "__main__":
    main()
