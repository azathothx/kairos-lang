# Kairos — English Documentation

English mirror of the Kairos documentation. The **Japanese originals are canonical**; every page
under `en/` is a translation that follows them (each chapter records its source revision as
`source_sha`, and an automated consistency check flags stale translations and diverging code blocks). `source_sha` is the first 12 hex digits of the SHA-256 of the Japanese file, e.g. `sha256sum spec/00-intro.md | cut -c1-12`.

- **[Language specification](spec/README.md)** — types, premise/body layers, grammar (EBNF), glossary.
- **[Descriptor reference](reference/README.md)** — one page per public word, with executable,
  doctest-verified examples.
- **[Standard library](stdlib/README.md)** — Gregorian, Fiscal, ISOWeek (Kyureki is documented in
  Japanese only; it is data-heavy and not bundled).
- **[Recipes](recipes/README.md)** — the schedules cron/Quartz/RRULE cannot express, one page per
  requirement with Playground links.
- **[Calendar](https://kairos-lang.org/en/calendar/)** — fill in an everyday schedule, see it month by
  month, print it or import it as .ics (new in 1.1).
- **[Authoring skill](skills/kairos-authoring/SKILL.md)** — how to write a definition from a requirement,
  for people and AI assistants.

[日本語版（正本）はこちら](../README.ja.md)
