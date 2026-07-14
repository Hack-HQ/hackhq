"""Regression coverage for how the banner-regenerating workflows gate commits.

Issue #112: `generate_banner.py` stamps `assets/hackathons-banner.svg` with an
"as of {today}" date on every run, but the commit step was gated on
`git diff --quiet README.md`. On a day when no table row flips status the README
is unchanged, so the freshly regenerated banner was staged, skipped, and thrown
away — and the committed banner date went stale.

The rule these tests pin down: **any workflow that stages the banner must gate on
what is staged, not on the README alone.** That is `git add ...` followed by
`git diff --cached --quiet`, which commits a banner-only change and still commits
nothing when nothing changed.

Deliberately text-based rather than YAML-parsed: the gating lives inside a shell
`run:` block, so a YAML parse would hand us the same string to search anyway, and
this keeps the scripts' dependency list untouched.
"""

import os
import unittest

WORKFLOW_DIR = os.path.join(os.path.dirname(__file__), "..", "workflows")

BANNER = "assets/hackathons-banner.svg"
STAGED_GATE = "git diff --cached --quiet"
README_ONLY_GATE = "git diff --quiet README.md"

# Every workflow that regenerates and stages the banner today. Listed explicitly
# so that deleting or renaming one fails loudly here instead of quietly reducing
# what this test covers.
BANNER_WORKFLOWS = [
    "auto_extract.yml",
    "closing_soon.yml",
    "contribution_approved.yml",
    "update_readmes.yml",
]


def read(name):
    with open(os.path.join(WORKFLOW_DIR, name), encoding="utf-8") as f:
        return f.read()


class BannerWorkflowsExist(unittest.TestCase):
    def test_every_listed_workflow_is_present_and_stages_the_banner(self):
        for name in BANNER_WORKFLOWS:
            with self.subTest(workflow=name):
                self.assertIn(
                    BANNER,
                    read(name),
                    f"{name} no longer stages the banner - update BANNER_WORKFLOWS",
                )

    def test_no_banner_workflow_is_missing_from_the_list(self):
        # Guards the inverse: a new workflow that stages the banner must be added
        # to BANNER_WORKFLOWS so the gating rules below apply to it too.
        staging = [
            f
            for f in sorted(os.listdir(WORKFLOW_DIR))
            if f.endswith(".yml") and BANNER in read(f)
        ]
        self.assertEqual(sorted(BANNER_WORKFLOWS), staging)


class CommitGating(unittest.TestCase):
    def test_banner_workflows_gate_on_staged_changes(self):
        for name in BANNER_WORKFLOWS:
            with self.subTest(workflow=name):
                self.assertIn(
                    STAGED_GATE,
                    read(name),
                    f"{name} must gate its commit on `{STAGED_GATE}` so a "
                    f"banner-only change is still committed (#112)",
                )

    def test_no_workflow_gates_on_the_readme_alone(self):
        for name in BANNER_WORKFLOWS:
            with self.subTest(workflow=name):
                self.assertNotIn(
                    README_ONLY_GATE,
                    read(name),
                    f"{name} gates on the README alone. The banner is rewritten "
                    f"with today's date on every run, so on a quiet README day "
                    f"that gate discards it and the 'as of' date goes stale "
                    f"(#112). Gate on `{STAGED_GATE}` instead.",
                )


if __name__ == "__main__":
    unittest.main()
