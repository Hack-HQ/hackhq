"""Regression coverage for how the automation workflows gate their commits.

Issue #112: `generate_banner.py` stamps `assets/hackathons-banner.svg` with an
"as of {today}" date on every run, but the commit was gated on
`git diff --quiet README.md`. On a day when no table row flips status the README
is unchanged, so the freshly regenerated banner was staged, skipped, and thrown
away — and the committed banner date went stale.

The rule these tests pin down:

    **A workflow must gate its commit on what it has staged.**
    That is `git add <paths>` and then `git diff --cached --quiet`,
    *in that order, in the same shell block.*

The ordering is not a detail — it is the whole fix. `git diff --cached --quiet`
against an empty index is always true, so a workflow that gates on `--cached`
*before* it runs `git add` reports "nothing changed" on every run, forever, and
silently stops committing anything at all. That is strictly worse than the bug
this file exists to prevent, and pushing `git add` back down into the commit step
is the most tempting future tidy-up. So it is tested.

Deliberately text-based rather than YAML-parsed: the gating lives inside a shell
`run:` block, so a YAML parse would hand back the same string to search anyway,
and this keeps the scripts' dependency list untouched.
"""

import os
import re
import unittest

WORKFLOW_DIR = os.path.join(os.path.dirname(__file__), "..", "workflows")

BANNER = "assets/hackathons-banner.svg"
STAGED_GATE = "git diff --cached --quiet"
# The gate that caused #112: it asks about the working tree, and about a single
# path, while the commit stages several files.
PATH_GATE = re.compile(r"git diff --quiet (?!--cached)\S")

# Workflows that stage the banner. Listed explicitly so renaming or deleting one
# fails loudly here rather than quietly shrinking what is covered.
BANNER_WORKFLOWS = [
    "auto_extract.yml",
    "closing_soon.yml",
    "contribution_approved.yml",
    "update_readmes.yml",
]


def workflow_files():
    """Every workflow file. GitHub accepts `.yaml` as readily as `.yml`."""
    return sorted(
        f
        for f in os.listdir(WORKFLOW_DIR)
        if f.endswith((".yml", ".yaml"))
        and os.path.isfile(os.path.join(WORKFLOW_DIR, f))
    )


def read(name):
    with open(os.path.join(WORKFLOW_DIR, name), encoding="utf-8") as f:
        return f.read()


def run_blocks(text):
    """The body of every `run:` block, as a list of strings.

    A block is every line indented further than its `run:` key. Two blocks are
    two different shells — but they share one git index, which is exactly the
    trap: staging in one block and gating in another still "works", right up
    until someone moves the `git add`. The tests below therefore reason per
    block, not per file.
    """
    blocks = []
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r"^(\s*)run:\s*[|>]", line)
        if not m:
            continue
        indent = len(m.group(1))
        body = []
        for follow in lines[i + 1 :]:
            if follow.strip() and (len(follow) - len(follow.lstrip())) <= indent:
                break
            body.append(follow)
        blocks.append("\n".join(body))
    return blocks


class Coverage(unittest.TestCase):
    def test_the_banner_workflow_list_is_accurate(self):
        staging = [f for f in workflow_files() if BANNER in read(f)]
        self.assertEqual(
            sorted(BANNER_WORKFLOWS),
            staging,
            "a workflow started or stopped staging the banner - update "
            "BANNER_WORKFLOWS so the gating rules still apply to it",
        )


class CommitGating(unittest.TestCase):
    def test_staging_happens_before_the_staged_gate(self):
        for name in workflow_files():
            for block in run_blocks(read(name)):
                if STAGED_GATE not in block:
                    continue
                with self.subTest(workflow=name):
                    add = block.find("git add")
                    gate = block.find(STAGED_GATE)
                    self.assertNotEqual(
                        add,
                        -1,
                        f"{name} gates on `{STAGED_GATE}` but stages nothing in "
                        f"that same block. An empty index always reports 'no "
                        f"changes', so the workflow would stop committing "
                        f"entirely (#112).",
                    )
                    self.assertLess(
                        add,
                        gate,
                        f"{name} runs `{STAGED_GATE}` before `git add`. The gate "
                        f"sees an empty index and reports 'no changes' on every "
                        f"run (#112).",
                    )

    def test_no_workflow_gates_on_a_working_tree_path(self):
        """Nobody may gate a commit on `git diff --quiet <path>`.

        It asks about the working tree, and about one path, while the commit
        stages several — which is what discarded the regenerated banner in #112.

        Applied to *every* workflow, not only today's banner workflows: the rule
        should already be in place on the day a script starts regenerating the
        banner, rather than being one import away from a silent regression.
        """
        for name in workflow_files():
            with self.subTest(workflow=name):
                self.assertIsNone(
                    PATH_GATE.search(read(name)),
                    f"{name} gates a commit on a working-tree path. Stage the "
                    f"files and gate on `{STAGED_GATE}`, so the gate always "
                    f"covers everything the commit will include (#112).",
                )

    def test_banner_workflows_use_the_staged_gate(self):
        for name in BANNER_WORKFLOWS:
            with self.subTest(workflow=name):
                self.assertIn(
                    STAGED_GATE,
                    read(name),
                    f"{name} regenerates the banner on every run, so it must "
                    f"gate on the staged index or it will discard it (#112)",
                )


class SupabaseSyncTriggers(unittest.TestCase):
    """The Supabase sync's push trigger cannot be relied on, so the cron must stay.

    Every automated edit to listings.json is pushed to main with the default
    GITHUB_TOKEN, and GitHub starts no workflow run for such a push. So the
    `on: push` path filter in sync_supabase.yml fires for human commits only,
    and deleting the schedule would leave the table updating on nothing but a
    manual dispatch.
    """

    def test_bot_pushes_cannot_trigger_a_run(self):
        # The premise of the above: no workflow checks out with a PAT, so every
        # push these workflows make carries the default token.
        for name in ("auto_extract.yml", "contribution_approved.yml"):
            with self.subTest(workflow=name):
                text = read(name)
                self.assertIn("git push origin main", text)
                self.assertNotIn(
                    "token:",
                    text,
                    f"{name} now checks out with an explicit token. If that is a "
                    f"PAT, its pushes do start workflow runs and the note in "
                    f"sync_supabase.yml about the push trigger is out of date.",
                )

    def test_sync_keeps_the_schedule_that_actually_runs_it(self):
        text = read("sync_supabase.yml")
        self.assertIn("schedule:", text)
        self.assertIn("cron:", text)
        self.assertIn("workflow_dispatch:", text)


if __name__ == "__main__":
    unittest.main()
