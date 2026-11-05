#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "pymupdf4llm>=0.2",
#     "pydantic>=2.7",
# ]
# ///
"""Convert PDF files to Markdown files using pymupdf4llm's layout analysis.

What it does:
  Takes PDF files and directories (searched for *.pdf, non-recursively) and writes
  one <PDF name>.md per PDF to --out-dir, keeping headings and tables. Page headers
  and footers stay in the text. Images go to <out-dir>/images and are linked from
  the Markdown. Existing outputs are skipped with a WARN unless --force is given, so
  hand edits are not overwritten. A PDF that fails to convert is logged as ERROR and
  the rest still run. OCR is off, so results do not depend on a local Tesseract, and
  nearly empty output is logged as WARN because it usually means a scanned PDF.

Output:
  stdout  The path of each Markdown file written, one per line. Nothing with --dry-run.
  stderr  Log lines: "YYYY-MM-DD HH:MM LEVEL message key=value ...".
          Levels: DEBUG (only with -v), INFO, WARN, ERROR, FAIL.

Exit codes:
  0  success, including when every output already existed and was skipped
  1  failure: no PDFs found, or at least one PDF failed (a FAIL line on stderr says why)
  2  invalid command line (printed by argparse)

Side effects:
  Creates --out-dir and writes .md and image files in it. Only reads the input PDFs.
  With --dry-run, writes nothing.

Examples:
  ./scripts/pdf_to_markdown.py ~/Downloads/papers --dry-run
  ./scripts/pdf_to_markdown.py ~/Downloads/papers
  ./scripts/pdf_to_markdown.py report.pdf --out-dir notes --force

--help output:
[BEGIN HELP]
  $ pdf_to_markdown.py --help
  usage: pdf_to_markdown.py [-h] [-v] [--out-dir DIR] [--force] [--dry-run]
                            INPUT [INPUT ...]

  Convert PDF files to Markdown files using pymupdf4llm's layout analysis.

  positional arguments:
    INPUT          PDF files or directories containing PDFs

  options:
    -h, --help     show this help message and exit
    -v, --verbose  log DEBUG lines too (default: False)
    --out-dir DIR  directory to write Markdown files to (default: research)
    --force        overwrite existing Markdown files (default: False)
    --dry-run      log what would be converted without writing anything (default: False)
[END HELP]
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from collections.abc import Callable, Iterable
from pathlib import Path

import pymupdf4llm  # type: ignore[import-untyped]  # the package ships no type information
from pydantic import BaseModel, ConfigDict

log = logging.getLogger("pdf_to_markdown")

# Fewer characters than this from a whole PDF suggests there was no text layer.
NEARLY_EMPTY_CHARS = 200
# Images smaller than this are layout fragments rather than figures.
MIN_IMAGE_BYTES = 2048


# --------------------------------------------------------------------------- logging

# Rename the stdlib levels to the four-letter house style.
logging.addLevelName(logging.WARNING, "WARN")
logging.addLevelName(logging.CRITICAL, "FAIL")

_RESET = "\033[0m"
_KEY_STYLE = "\033[1;97m"  # bold bright white
_TIME_STYLE = "\033[2m"  # dim
_LEVEL_STYLES = {
    logging.DEBUG: "\033[36m",  # cyan
    logging.INFO: "\033[32m",  # green
    logging.WARNING: "\033[33m",  # yellow
    logging.ERROR: "\033[31m",  # red
    logging.CRITICAL: "\033[1;97;41m",  # bold white on red
}
# A `key=` token: start of message or after whitespace/punctuation that cannot be part of a key.
_KEY_RE = re.compile(r"(?<![\w.\-/=])([A-Za-z_][\w.\-]*)=")


class LogFormatter(logging.Formatter):
    """Formats `2021-01-12 15:56 INFO message key=value`, colored when writing to a TTY."""

    def __init__(self, color: bool) -> None:
        super().__init__(datefmt="%Y-%m-%d %H:%M")
        self.color = color

    def format(self, record: logging.LogRecord) -> str:
        stamp = self.formatTime(record, self.datefmt)
        level = record.levelname
        message = record.getMessage()
        if self.color:
            stamp = f"{_TIME_STYLE}{stamp}{_RESET}"
            level = f"{_LEVEL_STYLES.get(record.levelno, '')}{level}{_RESET}"
            message = _KEY_RE.sub(rf"{_KEY_STYLE}\1{_RESET}=", message)
        line = f"{stamp} {level} {message}"
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


def setup_logging(verbose: bool) -> None:
    handler = logging.StreamHandler(sys.stderr)
    color = sys.stderr.isatty() and "NO_COLOR" not in os.environ
    handler.setFormatter(LogFormatter(color))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.DEBUG if verbose else logging.INFO)


def kv(**fields: object) -> str:
    """Render fields as `key=value` pairs; strings with spaces or quotes are JSON-quoted."""
    return " ".join(f"{key}={_fmt_value(value)}" for key, value in fields.items())


def _fmt_value(value: object) -> str:
    if isinstance(value, Path):
        value = str(value)
    if isinstance(value, str):
        needs_quotes = value == "" or any(c.isspace() or c in "\"'=" for c in value)
        return json.dumps(value, ensure_ascii=False) if needs_quotes else value
    if isinstance(value, float):
        return f"{value:.3f}".rstrip("0").rstrip(".")
    if isinstance(value, (list, tuple, set, frozenset)):
        return "[" + ",".join(_fmt_value(v) for v in value) + "]"
    if isinstance(value, BaseModel):
        return value.model_dump_json()
    return str(value)


class ScriptFailure(Exception):
    """Raised for an expected, explainable failure. main() logs it as FAIL and exits 1."""


# --------------------------------------------------------------------------- models


class ConversionPlan(BaseModel):
    model_config = ConfigDict(frozen=True)

    source: Path
    output: Path
    skip: bool


class ConversionResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    written: list[Path]
    failed: list[Path]


# --------------------------------------------------------------------------- pure core


def plan_conversions(
    pdfs: Iterable[Path],
    out_dir: Path,
    force: bool,
    exists: Callable[[Path], bool],
) -> list[ConversionPlan]:
    """Map each PDF to its output path, deciding which existing outputs to leave alone."""
    plans: list[ConversionPlan] = []
    for pdf in pdfs:
        output = out_dir / f"{pdf.stem}.md"
        skip = exists(output) and not force
        if skip:
            log.warning("output exists, skipping; use --force to overwrite %s", kv(output=output))
        plans.append(ConversionPlan(source=pdf, output=output, skip=skip))
    return plans


def convert_all(
    plans: Iterable[ConversionPlan],
    convert: Callable[[Path], str],
    write: Callable[[Path, str], None],
) -> ConversionResult:
    """Run every non-skipped plan. One PDF failing does not stop the others."""
    written: list[Path] = []
    failed: list[Path] = []
    for plan in plans:
        if plan.skip:
            continue
        started = time.monotonic()
        try:
            markdown = convert(plan.source)
            write(plan.output, markdown)
        # The PDF parser raises many unrelated exception types on bad input.
        except Exception as e:
            log.error("conversion failed %s", kv(source=plan.source, error=type(e).__name__, detail=str(e)))
            failed.append(plan.source)
            continue
        chars = len(markdown.strip())
        if chars < NEARLY_EMPTY_CHARS:
            log.warning("nearly empty output; the PDF may have no text layer %s", kv(source=plan.source, chars=chars))
        log.info("converted %s", kv(source=plan.source, output=plan.output, chars=chars,
                                    elapsed_s=time.monotonic() - started))
        written.append(plan.output)
    return ConversionResult(written=written, failed=failed)


# --------------------------------------------------------------------------- io edge


def find_pdfs(inputs: list[Path]) -> list[Path]:
    found: list[Path] = []
    for p in inputs:
        if p.is_dir():
            matched = sorted(f for f in p.iterdir() if f.is_file() and f.suffix.lower() == ".pdf")
            log.debug("searched directory %s", kv(dir=p, matched=len(matched)))
            found.extend(matched)
        elif not p.exists():
            log.warning("path does not exist, ignoring %s", kv(path=p, cwd=Path.cwd()))
        elif p.suffix.lower() == ".pdf":
            found.append(p)
        else:
            log.warning("not a PDF, ignoring %s", kv(path=p))
    return found


def pymupdf_convert(path: Path, image_dir: Path) -> str:
    image_dir.mkdir(parents=True, exist_ok=True)
    # Header and footer removal stays off: it deleted real text when a page's last line sat low down.
    markdown: str = pymupdf4llm.to_markdown(
        str(path),
        write_images=True,
        image_path=str(image_dir),
        image_format="png",
        dpi=150,
        use_ocr=False,
    )
    # The library writes links using image_path; the Markdown sits next to the image folder.
    return drop_tiny_images(markdown, image_dir).replace(f"]({image_dir}/", f"]({image_dir.name}/")


def drop_tiny_images(markdown: str, image_dir: Path) -> str:
    """Delete images too small to be figures, such as a cropped bullet point, and their links."""

    def replace(match: re.Match[str]) -> str:
        image = image_dir / match.group(1)
        size_bytes = image.stat().st_size
        if size_bytes >= MIN_IMAGE_BYTES:
            return match.group(0)
        log.debug("dropping tiny image %s", kv(image=image, size_bytes=size_bytes))
        image.unlink()
        return ""

    return re.sub(rf"!\[[^\]]*\]\({re.escape(str(image_dir))}/([^)]+)\)", replace, markdown)


def write_text_file(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


# --------------------------------------------------------------------------- cli


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(__doc__ or "").splitlines()[0],
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("inputs", nargs="+", type=Path, metavar="INPUT", help="PDF files or directories containing PDFs")
    parser.add_argument("-v", "--verbose", action="store_true", help="log DEBUG lines too")
    parser.add_argument("--out-dir", type=Path, default=Path("research"), metavar="DIR", help="directory to write Markdown files to")
    parser.add_argument("--force", action="store_true", help="overwrite existing Markdown files")
    parser.add_argument("--dry-run", action="store_true", help="log what would be converted without writing anything")
    return parser.parse_args(argv)


def run(args: argparse.Namespace) -> ConversionResult:
    pdfs = find_pdfs(args.inputs)
    log.info("found PDFs %s", kv(count=len(pdfs)))
    if not pdfs:
        raise ScriptFailure(f"no PDFs found {kv(inputs=[str(p) for p in args.inputs])}; check the paths")

    plans = plan_conversions(pdfs, args.out_dir, args.force, exists=Path.exists)
    if args.dry_run:
        for plan in plans:
            if not plan.skip:
                log.info("would convert %s", kv(source=plan.source, output=plan.output))
        return ConversionResult(written=[], failed=[])

    image_dir = args.out_dir / "images"
    result = convert_all(plans, convert=lambda pdf: pymupdf_convert(pdf, image_dir), write=write_text_file)
    if result.failed:
        for path in result.written:
            print(path)
        raise ScriptFailure(f"some PDFs failed {kv(failed=[str(p) for p in result.failed], written=len(result.written))}")
    return result


def main() -> int:
    args = parse_args()
    setup_logging(args.verbose)
    started = time.monotonic()
    log.info("starting %s", kv(inputs=[str(p) for p in args.inputs], out_dir=args.out_dir,
                               force=args.force, dry_run=args.dry_run))
    try:
        result = run(args)
    except ScriptFailure as e:
        log.critical("%s", e)
        return 1

    # Plain stdout output: the script's product, deliberately not a log line.
    for path in result.written:
        print(path)

    log.info("done %s", kv(written=len(result.written), elapsed_s=time.monotonic() - started))
    return 0


if __name__ == "__main__":
    sys.exit(main())
