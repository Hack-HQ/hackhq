"""Credential-free drift gate between `supabase/migrations/` and `web/db/schema.ts`.

Run with:  python -m unittest discover -s .github/scripts -p 'test_*.py'

WHY THIS FILE EXISTS
--------------------
`supabase/migrations/` is the applied schema; `web/db/schema.ts` is only the set
of TypeScript types the app compiles against. Nothing enforced that the second
described the first, and the two had already diverged in a way that would have
corrupted data: the baseline declares `date_posted` / `date_updated` as `bigint`
(`20260722141955_baseline_hackathons.sql:18-19`, epoch milliseconds, which
overflow int4) while Drizzle declared them `integer()`. A generated migration
would have emitted a narrowing cast. Drizzle's schema also described 21 of the
26 live `hackathons` columns and did not mention `user_hackathons` at all.

The obvious check - introspect the live database and diff - is not available
here. CI holds no `DATABASE_URL`, this project has no Supabase CLI and no MCP
`apply_migration` (so no `db push`, `db dump`, or branch database), and schema
changes are hand-applied through the SQL Editor. So the only gate that can run
on every PR is a *textual* one: parse both files and compare the column sets.
That is what this does, with no third-party dependency and no network.

WHAT IT PINS DOWN
-----------------
    **Every column in `supabase/migrations/` is declared in `web/db/schema.ts`,
    and nothing else is.**

Consequences worth stating explicitly, because they are the failure modes:

* Adding a column in SQL without adding it to schema.ts fails here.
* Adding a column to schema.ts that no migration creates fails here - that is
  the dangerous direction, because it is what a `drizzle-kit generate` would
  then try to CREATE on a database that has a security model Drizzle cannot see.
* Editing an already-applied migration to delete a column that schema.ts still
  declares fails here too. It falls out of the set equality rather than being
  checked separately: the migration files are immutable history, and the applied
  database is what they describe, so a retroactive deletion shows up as a column
  present in schema.ts and absent from the migrations.
* The per-table counts are hardcoded on purpose. Set equality alone is satisfied
  by two sides that drift together - a future migration that adds a column and a
  schema.ts edit that adds it too would pass silently, and nobody would revisit
  the grants, policies and triggers that new column needs. The count forces this
  file to be edited, which forces the migration to be read.

`supabase/migrations/` always wins. It is the schema that is actually applied.

Deliberately text-parsed rather than executed: importing the Drizzle schema
needs a Node toolchain the `scripts` CI job does not install, and running the
SQL needs a database. Both parsers therefore assert they found something, and
assert that every fragment they saw was understood - a regex that quietly stops
matching must not be able to make this file pass vacuously.
"""

import os
import re
import unittest

_HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(_HERE, "..", ".."))
MIGRATIONS_DIR = os.path.join(REPO_ROOT, "supabase", "migrations")
SCHEMA_TS = os.path.join(REPO_ROOT, "web", "db", "schema.ts")

# Tables mirrored in schema.ts, with the column count each must have. See the
# module docstring: the number is a tripwire, not redundancy.
EXPECTED_COUNTS = {"hackathons": 26, "user_hackathons": 6}

# Which migration owns each table's columns, quoted in failure output so the
# reader is pointed at the authority instead of guessing.
OWNING_MIGRATIONS = {
    "hackathons": (
        "20260722141955_baseline_hackathons.sql (21 columns) "
        "+ 20260722144205_add_deck_columns.sql (5 more)"
    ),
    "user_hackathons": "20260725154500_user_hackathons.sql",
}

# Epoch milliseconds. int4 tops out at 2^31-1 ms ≈ 1970-01-25, so `integer` here
# is not a style question - it is a narrowing cast waiting to happen.
EPOCH_MS_COLUMNS = ("date_posted", "date_updated")

SQL_QUOTES = ("'", '"')
TS_QUOTES = ("'", '"', "`")


# --------------------------------------------------------------------------- #
# Lexing helpers. Both parsers need the same three primitives, and both need
# them to ignore anything inside a string literal or a comment - `--` appears in
# prose comments, and `,` and `{` appear inside `sql\`...\`` template literals.
# --------------------------------------------------------------------------- #


def _code_positions(text, quotes):
    """Yield `(index, char)` for every character outside a string literal.

    Callers use the indices to slice `text`, so the positions are absolute.
    A doubled SQL quote (`''`) reads as two adjacent literals rather than one
    escaped quote; the distinction cannot change any answer here, because either
    way no character inside the literal is yielded as code.
    """
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch in quotes:
            i += 1
            while i < n:
                c = text[i]
                i += 1
                if c == "\\":  # TS escape; SQL has none, and a lone \ is inert
                    i += 1
                elif c == ch:
                    break
            continue
        yield i, ch
        i += 1


def _strip_comments(text, line_token, quotes):
    """Blank out `line_token ...` and `/* ... */`, preserving byte offsets.

    Comments become spaces and newlines are kept, so offsets and line numbers
    still line up with the file on disk after stripping.

    A comment is recognised *before* a string literal is opened, which is the
    only ordering that works on these files: the prose comments contain stray
    apostrophes ("the sync never re-owns a row a user submitted"), and treating
    one as an opening quote would swallow the rest of the file. The reverse
    ordering matters too and is preserved for free, because a literal is skipped
    whole: the `//` inside a `"https://..."` string is never seen as a comment.
    """
    out = list(text)
    i, n = 0, len(text)
    while i < n:
        if text.startswith(line_token, i):
            end = text.find("\n", i)
            end = n if end == -1 else end
            for k in range(i, end):
                out[k] = " "
            i = end
        elif text.startswith("/*", i):
            end = text.find("*/", i + 2)
            end = n if end == -1 else end + 2
            for k in range(i, end):
                if out[k] != "\n":
                    out[k] = " "
            i = end
        elif text[i] in quotes:
            quote = text[i]
            i += 1
            while i < n:
                ch = text[i]
                i += 1
                if ch == "\\":  # TS escape; a lone backslash in SQL is inert
                    i += 1
                elif ch == quote:
                    break
        else:
            i += 1
    return "".join(out)


def _resume(text, start, quotes):
    """`_code_positions` restarted at `start`, still yielding absolute indices."""
    for i, ch in _code_positions(text[start:], quotes):
        yield start + i, ch


def _balanced(text, open_index, quotes):
    """The body inside the bracket at `open_index`, excluding both brackets."""
    opener = text[open_index]
    closer = {"(": ")", "{": "}", "[": "]"}[opener]
    depth = 0
    for i, ch in _resume(text, open_index, quotes):
        if ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return text[open_index + 1 : i]
    raise ValueError(f"unbalanced {opener!r} at offset {open_index}")


def _split_top_level(body, quotes):
    """Split on commas that sit at bracket depth 0. Blank fragments dropped."""
    parts, depth, start = [], 0, 0
    for i, ch in _code_positions(body, quotes):
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        elif ch == "," and depth == 0:
            parts.append(body[start:i])
            start = i + 1
    parts.append(body[start:])
    return [p.strip() for p in parts if p.strip()]


def _unquote(name):
    """`"startDate"` -> `startDate`. Quoted identifiers are case-sensitive."""
    return name[1:-1] if len(name) > 1 and name[0] == '"' else name


# --------------------------------------------------------------------------- #
# SQL side
# --------------------------------------------------------------------------- #

_TABLE_STMT_RE = re.compile(r"\b(?:create|alter)\s+table\b", re.I)
_CREATE_TABLE_RE = re.compile(
    r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\"?\w+\"?)\s*\(", re.I
)
_ALTER_TABLE_RE = re.compile(
    r"alter\s+table\s+(?:only\s+)?(?:public\.)?(\"?\w+\"?)", re.I
)
# One `alter table` may carry several comma-separated clauses - the deck-columns
# migration adds five columns in a single statement - so these are findall'd
# across the whole statement rather than matched once at its head.
_ADD_COLUMN_RE = re.compile(
    r"\badd\s+column\s+(?:if\s+not\s+exists\s+)?(\"?\w+\"?)\s*([^,;]*)", re.I
)
_DROP_COLUMN_RE = re.compile(
    r"\bdrop\s+column\s+(?:if\s+exists\s+)?(\"?\w+\"?)", re.I
)
_SQL_COLUMN_RE = re.compile(r'^("?\w+"?)\s+(.*)$', re.S)

# Table-level constraint clauses live in the same comma-separated list as the
# columns and must not be mistaken for one. `user_hackathons` has both shapes:
# `primary key (user_id, hackathon_id)` and a named `constraint ... check (...)`.
_CONSTRAINT_KEYWORDS = (
    "primary",
    "unique",
    "constraint",
    "check",
    "foreign",
    "exclude",
    "like",
)


def _statement_end(sql, start):
    """Offset of the `;` that terminates the statement beginning at `start`."""
    depth = 0
    for i, ch in _resume(sql, start, SQL_QUOTES):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == ";" and depth == 0:
            return i
    return len(sql)


def parse_migrations(directory=MIGRATIONS_DIR):
    """Replay every migration in filename order into `{table: {column: type}}`.

    Filename order is apply order (the timestamps are the version), so a later
    `add column` lands after the `create table` that precedes it. Returns the
    accumulated columns plus every fragment the parser did not understand.
    """
    columns = {}
    unparsed = []
    for filename in sorted(os.listdir(directory)):
        if not filename.endswith(".sql"):
            continue
        with open(os.path.join(directory, filename), encoding="utf-8") as f:
            sql = _strip_comments(f.read(), "--", SQL_QUOTES)

        for stmt in _TABLE_STMT_RE.finditer(sql):
            create = _CREATE_TABLE_RE.match(sql, stmt.start())
            if create:
                table = _unquote(create.group(1))
                cols = columns.setdefault(table, {})
                body = _balanced(sql, create.end() - 1, SQL_QUOTES)
                for fragment in _split_top_level(body, SQL_QUOTES):
                    first = fragment.split(None, 1)[0].lower()
                    if first in _CONSTRAINT_KEYWORDS:
                        continue
                    col = _SQL_COLUMN_RE.match(fragment)
                    if not col:
                        unparsed.append(f"{filename}: {fragment!r}")
                        continue
                    cols[_unquote(col.group(1))] = " ".join(col.group(2).split())
                continue

            alter = _ALTER_TABLE_RE.match(sql, stmt.start())
            if not alter:
                unparsed.append(f"{filename}: {sql[stmt.start():stmt.end()]!r}")
                continue
            table = _unquote(alter.group(1))
            statement = sql[alter.end() : _statement_end(sql, alter.end())]
            for added in _ADD_COLUMN_RE.finditer(statement):
                cols = columns.setdefault(table, {})
                cols[_unquote(added.group(1))] = " ".join(added.group(2).split())
            for dropped in _DROP_COLUMN_RE.finditer(statement):
                # No migration drops a column today. Handled anyway, so that the
                # day one does, this file reports real drift instead of a ghost.
                columns.get(table, {}).pop(_unquote(dropped.group(1)), None)

    return columns, unparsed


# --------------------------------------------------------------------------- #
# Drizzle side
# --------------------------------------------------------------------------- #

_PGTABLE_RE = re.compile(r'pgTable\(\s*"(\w+)"\s*,\s*\{')
# `datePosted: bigint("date_posted", { mode: "number" })` -> db name
# `date_posted`, drizzle type `bigint`. The DB name is what the database sees,
# so it - not the camelCase property - is what gets compared. Quoted camelCase
# DB names (`date("startDate")`) come through unchanged.
_TS_COLUMN_RE = re.compile(r'^(\w+)\s*:\s*([A-Za-z_$][\w$]*)\s*\(\s*"([^"]+)"')


def parse_schema_ts(path=SCHEMA_TS):
    """Parse `pgTable(...)` calls into `{table: {db_column: drizzle_type}}`.

    Only the second argument - the columns object - is read. The third (checks,
    indexes, primary keys) is skipped by construction, because `_balanced` stops
    at the closing brace of the columns object.
    """
    with open(path, encoding="utf-8") as f:
        source = _strip_comments(f.read(), "//", TS_QUOTES)

    columns = {}
    unparsed = []
    for match in _PGTABLE_RE.finditer(source):
        table = match.group(1)
        cols = columns.setdefault(table, {})
        body = _balanced(source, match.end() - 1, TS_QUOTES)
        for fragment in _split_top_level(body, TS_QUOTES):
            col = _TS_COLUMN_RE.match(fragment)
            if not col:
                # A declaration style the regex does not know. Reported rather
                # than skipped: a silently dropped column is invisible drift.
                unparsed.append(f"{os.path.basename(path)}: {fragment!r}")
                continue
            cols[col.group(3)] = col.group(2)
    return columns, unparsed


MIGRATION_COLUMNS, MIGRATION_UNPARSED = parse_migrations()
SCHEMA_COLUMNS, SCHEMA_UNPARSED = parse_schema_ts()


def _drift_message(table):
    """Symmetric difference, both directions, with the authority named."""
    sql_cols = set(MIGRATION_COLUMNS.get(table, {}))
    ts_cols = set(SCHEMA_COLUMNS.get(table, {}))
    return "\n".join(
        [
            f"web/db/schema.ts has drifted from supabase/migrations/ "
            f"for public.{table}.",
            f"  owned by: {OWNING_MIGRATIONS[table]}",
            f"  in the migrations but MISSING from schema.ts: "
            f"{sorted(sql_cols - ts_cols) or 'none'}",
            f"  in schema.ts but created by NO migration: "
            f"{sorted(ts_cols - sql_cols) or 'none'}",
            "  supabase/migrations/ wins - it is the schema that is applied. "
            "Fix web/db/schema.ts to match it, never the reverse, and never by "
            "editing an already-applied migration.",
        ]
    )


class ParserSanity(unittest.TestCase):
    """The parsers must be provably alive.

    Every other assertion in this file compares two sets. Two empty sets are
    equal, so a regex that stops matching would turn the whole gate green while
    covering nothing. These tests are what make the rest trustworthy.
    """

    def test_migrations_parser_found_columns(self):
        self.assertTrue(
            MIGRATION_COLUMNS,
            f"parsed no tables at all out of {MIGRATIONS_DIR} - the SQL parser "
            "is broken, not the schema",
        )
        for table in EXPECTED_COUNTS:
            self.assertTrue(
                MIGRATION_COLUMNS.get(table),
                f"parsed no columns for public.{table} from "
                f"{OWNING_MIGRATIONS[table]}",
            )

    def test_schema_ts_parser_found_columns(self):
        self.assertTrue(
            SCHEMA_COLUMNS, f"parsed no pgTable() calls out of {SCHEMA_TS}"
        )
        for table in EXPECTED_COUNTS:
            self.assertTrue(
                SCHEMA_COLUMNS.get(table),
                f"parsed no columns for pgTable(\"{table}\") in {SCHEMA_TS}",
            )

    def test_every_fragment_was_understood(self):
        self.assertEqual(
            [],
            MIGRATION_UNPARSED,
            "SQL fragments the column parser did not recognise; a column may be "
            "silently missing from the comparison",
        )
        self.assertEqual(
            [],
            SCHEMA_UNPARSED,
            "schema.ts declarations the parser did not recognise; a column may "
            "be silently missing from the comparison",
        )

    def test_both_tables_are_mirrored(self):
        """schema.ts must not stop describing a table that exists."""
        for table in EXPECTED_COUNTS:
            self.assertIn(table, SCHEMA_COLUMNS, f"pgTable(\"{table}\") is gone")


class ColumnSetsMatch(unittest.TestCase):
    def test_hackathons(self):
        self.assertEqual(
            set(MIGRATION_COLUMNS["hackathons"]),
            set(SCHEMA_COLUMNS["hackathons"]),
            _drift_message("hackathons"),
        )

    def test_user_hackathons(self):
        self.assertEqual(
            set(MIGRATION_COLUMNS["user_hackathons"]),
            set(SCHEMA_COLUMNS["user_hackathons"]),
            _drift_message("user_hackathons"),
        )

    def test_counts_are_exactly_as_documented(self):
        for table, expected in EXPECTED_COUNTS.items():
            with self.subTest(table=table):
                self.assertEqual(
                    expected,
                    len(MIGRATION_COLUMNS[table]),
                    f"public.{table} now has "
                    f"{len(MIGRATION_COLUMNS[table])} columns in "
                    f"supabase/migrations/, not {expected}. A migration added or "
                    "removed a column: update web/db/schema.ts, EXPECTED_COUNTS "
                    "here, and the header comment in web/db/schema.ts - and "
                    "check the new column's GRANTs and policies while you are "
                    "there, because Drizzle cannot see them.",
                )
                self.assertEqual(
                    expected,
                    len(SCHEMA_COLUMNS[table]),
                    f"pgTable(\"{table}\") declares "
                    f"{len(SCHEMA_COLUMNS[table])} columns, not {expected}",
                )


class ColumnTypesMatch(unittest.TestCase):
    """Only the types where a mismatch loses or corrupts data are checked.

    Set equality says nothing about types, and this is the one that bit: the SQL
    said `bigint`, Drizzle said `integer()`, and a generated migration would
    have narrowed an epoch-millisecond column to int4.
    """

    def test_epoch_millisecond_columns_are_bigint_in_sql(self):
        for column in EPOCH_MS_COLUMNS:
            with self.subTest(column=column):
                # Guarded so a missing column fails with a message instead of a
                # KeyError. ColumnSetsMatch owns the real drift report.
                self.assertIn(column, MIGRATION_COLUMNS["hackathons"])
                declared = MIGRATION_COLUMNS["hackathons"][column]
                self.assertTrue(
                    declared.lower().startswith("bigint"),
                    f"hackathons.{column} is `{declared}` in "
                    "20260722141955_baseline_hackathons.sql:18-19. It holds "
                    "epoch milliseconds and must stay bigint.",
                )

    def test_epoch_millisecond_columns_are_bigint_in_schema_ts(self):
        for column in EPOCH_MS_COLUMNS:
            with self.subTest(column=column):
                self.assertIn(column, SCHEMA_COLUMNS["hackathons"])
                declared = SCHEMA_COLUMNS["hackathons"][column]
                self.assertEqual(
                    "bigint",
                    declared,
                    f"web/db/schema.ts declares hackathons.{column} as "
                    f"`{declared}()`, but the database has bigint "
                    "(20260722141955_baseline_hackathons.sql:18-19). Epoch "
                    "milliseconds overflow int4, so `integer()` here is a "
                    "narrowing cast in any migration generated from this file.",
                )


if __name__ == "__main__":
    unittest.main()
