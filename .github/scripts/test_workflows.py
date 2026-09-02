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
        for name in (
            "auto_extract.yml",
            "contribution_approved.yml",
            "gallery_approved.yml",
            "gallery.yml",
        ):
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


PUSHES_TO_MAIN = "git push origin main"


def workflow_name(text):
    """The top-level `name:` of a workflow file - what workflow_run addresses."""
    m = re.search(r"^name:\s*(.+?)\s*$", text, re.MULTILINE)
    return m.group(1).strip("'\"") if m else None


def workflow_run_names(text):
    """The workflow names listed under `on: workflow_run: workflows:`."""
    m = re.search(
        r"^\s*workflow_run:\s*\n\s*workflows:\s*\n((?:\s*-\s*.+\n)+)", text, re.MULTILINE
    )
    if m:
        return [
            line.strip().lstrip("-").strip().strip("'\"")
            for line in m.group(1).splitlines()
            if line.strip()
        ]
    m = re.search(r"^\s*workflow_run:\s*\n\s*workflows:\s*\[(.*?)\]", text, re.MULTILINE)
    if m:
        return [n.strip().strip("'\"") for n in m.group(1).split(",") if n.strip()]
    return []


class DeployChaining(unittest.TestCase):
    """Bot commits reach production through workflow_run, not the schedule.

    A push made with the default GITHUB_TOKEN starts no workflow run, and the
    scheduled sweep that used to cover for that fired every 4-6 hours in
    practice (2026-08-28..09-01). The completion of the bot workflow itself is
    an event GitHub does deliver, so deploy.yml lists every workflow that
    pushes to main under `on: workflow_run`. These tests keep that list true.
    """

    def pushers(self):
        return {
            workflow_name(read(f))
            for f in workflow_files()
            if PUSHES_TO_MAIN in read(f) and f != "deploy.yml"
        }

    def test_every_workflow_that_pushes_to_main_triggers_a_deploy(self):
        chained = set(workflow_run_names(read("deploy.yml")))
        self.assertTrue(chained, "deploy.yml no longer chains on workflow_run")
        missing = self.pushers() - chained
        self.assertEqual(
            set(),
            missing,
            "these workflows push to main but deploy.yml does not run when "
            f"they complete, so their commits wait for the throttled sweep: {sorted(missing)}",
        )

    def test_chained_names_are_real_workflows(self):
        names = {workflow_name(read(f)) for f in workflow_files()}
        for target in ("deploy.yml", "site_freshness.yml", "sync_supabase.yml"):
            for n in workflow_run_names(read(target)):
                with self.subTest(workflow=target, chained=n):
                    self.assertIn(
                        n,
                        names,
                        f"{target} chains on a workflow named {n!r}, which no file "
                        f"declares - a rename would silently break the chain",
                    )

    def test_deploy_keeps_its_backstops(self):
        text = read("deploy.yml")
        self.assertIn("schedule:", text)
        self.assertIn("workflow_dispatch:", text)

    def test_deploy_verifies_the_public_site_before_moving_the_tag(self):
        """The upload succeeding is not the commit being live.

        A second pipeline shipped a development build over this workflow's
        deploys for days (2026-08-27..09-01). The deploy must confirm the site
        serves its own sha, and only then record it as shipped.
        """
        text = read("deploy.yml")
        verify = text.find("site-data/build.json")
        tag = text.find("git tag -f production")
        self.assertNotEqual(verify, -1, "deploy.yml no longer checks /site-data/build.json")
        self.assertLess(verify, tag, "deploy.yml moves the production tag before verifying")

    def test_freshness_runs_after_every_deploy(self):
        self.assertIn("Deploy to Cloudflare", workflow_run_names(read("site_freshness.yml")))
        self.assertEqual("Deploy to Cloudflare", workflow_name(read("deploy.yml")))

    def test_freshness_does_not_race_the_deploy_it_shares_a_push_with(self):
        """The freshness push trigger must not fire on listing changes.

        A push that changes listings.json also starts deploy.yml. The check
        finishes in ~20s and the deploy takes a minute or more, so the check
        would read the pre-deploy site and report every listing in that push as
        missing - which is what happened on all three merges of 2026-09-02.
        The deploy-completion trigger covers those pushes properly.
        """
        text = read("site_freshness.yml")
        m = re.search(r"^on:\n(.*?)^permissions:", text, re.MULTILINE | re.DOTALL)
        self.assertIsNotNone(m, "could not find the `on:` block in site_freshness.yml")
        push_block = re.search(
            r"^  push:\n(?:.*\n)*?(?=^  \w)", m.group(1), re.MULTILINE
        )
        self.assertIsNotNone(push_block, "site_freshness.yml lost its push trigger")
        self.assertNotIn(
            "listings.json",
            push_block.group(0),
            "site_freshness.yml runs on pushes that change listings.json. That push "
            "also triggers the deploy, so the check races it and reports the "
            "pre-deploy site as stale on every merge.",
        )

    def test_the_build_refuses_to_run_under_another_ci_system(self):
        """Only one pipeline may deploy this Worker.

        Cloudflare Workers Builds promoted its own build over a verified deploy
        on 2026-09-02. Disconnecting it is a dashboard step; this is the half
        that lives in the repo, and it has to sit where any `next build` loads
        it rather than in an npm script the other pipeline does not run.
        """
        config = os.path.join(WORKFLOW_DIR, "..", "..", "web", "next.config.ts")
        with open(config, encoding="utf-8") as f:
            text = f.read()
        self.assertIn("foreignCiError", text)
        self.assertIn("throw new Error", text)

    def test_freshness_heals_a_development_build_by_redeploying(self):
        """A build from another pipeline on production is the one failure the
        check can fix itself: dispatch deploy.yml with force. That needs
        `actions: write`, and must be gated on the script's clerk_dev output
        rather than on any failure - a missing listing is not fixed by
        redeploying the same commit."""
        text = read("site_freshness.yml")
        self.assertIn("actions: write", text)
        self.assertIn("gh workflow run deploy.yml", text)
        self.assertIn("-f force=true", text)
        self.assertIn("steps.check.outputs.clerk_dev == 'true'", text)

    def test_deploy_waits_for_a_competing_deploy_before_moving_the_tag(self):
        """The 2026-09-02 race: this workflow's build passed verification and
        was replaced 55 seconds later. The verification must look again after
        a pause and compare the served build, before the tag moves."""
        text = read("deploy.yml")
        settle = text.find("settle=$HEAD_SHA")
        tag = text.find("git tag -f production")
        self.assertNotEqual(settle, -1, "deploy.yml no longer re-checks the live build after a pause")
        self.assertLess(settle, tag)
        self.assertIn("sleep 120", text)

    def test_supabase_sync_chains_on_the_listing_writers(self):
        """Only the workflows that can change listings.json; gallery commits
        never touch it, so syncing after them would be a wasted write."""
        chained = set(workflow_run_names(read("sync_supabase.yml")))
        listing_writers = {
            workflow_name(read(f))
            for f in workflow_files()
            if PUSHES_TO_MAIN in read(f) and "listings.json" in read(f) and f != "deploy.yml"
        }
        self.assertEqual(set(), listing_writers - chained)


if __name__ == "__main__":
    unittest.main()
