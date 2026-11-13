"""Unit tests for data files and source lists: no API, no database."""

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
PLACES = ROOT / "frontend" / "src" / "api" / "places.json"
PHOTOS = ROOT / "frontend" / "public" / "places"
SEED = ROOT / "backend" / "src" / "db" / "seed.js"
MIGRATIONS = ROOT / "backend" / "src" / "db" / "migrations"
TERMS_JS = ROOT / "backend" / "src" / "services" / "name-filter-terms.js"
TERMS_MD = ROOT / "docs" / "banned-terms.md"
SLUGS = [
    "mensa",
    "library",
    "cas-cafe",
    "campus-garden",
    "carebox-shopbox",
    "building-b",
    "building-c",
    "sensoricum",
]
HEILBRONN = {"lat": (49.10, 49.20), "lng": (9.15, 9.30)}


def terms_in_source(array_name):
    """Words of one exported array in name-filter-terms.js."""
    source = TERMS_JS.read_text(encoding="utf-8")
    block = re.search(rf"export const {array_name} = \[(.*?)\];", source, re.S).group(1)
    return re.findall(r"'([a-z]+)'", block)


def terms_in_doc(heading):
    """Words of one list in docs/banned-terms.md."""
    text = TERMS_MD.read_text(encoding="utf-8")
    section = re.search(rf"## {heading} \(\d+\)\n\n(.*?)(?:\n\n## |\Z)", text, re.S).group(1)
    return [word.strip() for word in section.strip().split(",")]


@pytest.mark.parametrize("slug", SLUGS)
def test_every_place_has_credited_photos_that_exist(slug):
    places = json.loads(PLACES.read_text(encoding="utf-8"))
    assert places[slug], f"{slug} has no photos"
    for image in places[slug]:
        photo = PHOTOS / image["file"]
        assert photo.is_file(), f"{image['file']} is missing"
        assert photo.stat().st_size < 400_000, f"{image['file']} is larger than 400 KB"
        assert len(image["alt"]) >= 10, "alt text is too short to describe the photo"
        assert image["credit"].strip(), "every photo needs its credit line"


def test_the_banned_word_document_matches_the_source_lists():
    assert terms_in_doc("Blocked anywhere inside a word") == terms_in_source("SUBSTRING_TERMS")
    assert terms_in_doc("Blocked as a whole word") == terms_in_source("TOKEN_TERMS")


def test_harmless_names_are_not_on_the_lists():
    banned = set(terms_in_source("SUBSTRING_TERMS")) | set(terms_in_source("TOKEN_TERMS"))
    for name in ["cass", "classic", "assistant", "scunthorpe", "hancock", "dickens", "depp"]:
        assert name not in banned


def test_seed_has_eight_checkpoints_in_the_heilbronn_area():
    rows = re.findall(r"\['([^']+)', (\d+\.\d+), (\d+\.\d+), (\d+),", SEED.read_text("utf-8"))
    names = [row[0] for row in rows]
    assert len(names) == 8 and len(set(names)) == 8
    for name, lat, lng, radius in rows:
        assert HEILBRONN["lat"][0] < float(lat) < HEILBRONN["lat"][1], name
        assert HEILBRONN["lng"][0] < float(lng) < HEILBRONN["lng"][1], name
        assert 25 <= int(radius) <= 150, f"{name}: radius {radius} m is not sensible"


def test_migrations_are_numbered_without_gaps_or_duplicates():
    numbers = sorted(int(path.name[:3]) for path in MIGRATIONS.glob("*.sql"))
    assert numbers == list(range(1, len(numbers) + 1))


def test_no_migration_stores_coordinates_of_people():
    for path in MIGRATIONS.glob("*.sql"):
        sql = path.read_text(encoding="utf-8").lower()
        if "location_checks" in sql and "create table" in sql:
            assert "latitude" not in sql.split("location_checks", 1)[1].split(";", 1)[0]


QUESTION_BANK = ROOT / "backend" / "src" / "db" / "question-bank.js"
PUBLIC = ROOT / "frontend" / "public"


def jpeg_segments(data):
    """The marker bytes of the header segments of a JPEG file (stops at the image data)."""
    markers, index = [], 2
    while index + 4 <= len(data) and data[index] == 0xFF:
        marker = data[index + 1]
        if marker == 0xDA:  # start of scan: only image data follows
            break
        length = int.from_bytes(data[index + 2 : index + 4], "big")
        markers.append((marker, data[index + 4 : index + 10]))
        index += 2 + length
    return markers


def team_photos():
    """Every photo the team took: the place photos named *-photo-* and the question photos."""
    return sorted(PHOTOS.glob("*-photo-*.jpg")) + sorted((PUBLIC / "quests").rglob("*.jpg"))


def test_the_team_photos_carry_no_metadata_such_as_a_location():
    photos = team_photos()
    assert len(photos) >= 40
    for photo in photos:
        data = photo.read_bytes()
        assert data[:2] == b"\xff\xd8", f"{photo.name} is not a JPEG"
        for marker, start in jpeg_segments(data):
            # APP1 holds EXIF (GPS position, phone model, time) or XMP; neither may be published.
            assert marker != 0xE1, f"{photo.name} still has EXIF/XMP metadata ({start!r})"
        assert photo.stat().st_size < 400_000, f"{photo.name} is larger than 400 KB"


def test_every_question_photo_file_is_used_by_the_question_bank():
    """A file is named in question-bank.js either as it is or as a numbered series (`...-${n}.jpg`)."""
    source = QUESTION_BANK.read_text(encoding="utf-8")
    for photo in sorted((PUBLIC / "quests").rglob("*.jpg")):
        path = photo.relative_to(PUBLIC).as_posix()
        series = re.sub(r"-\d+\.jpg$", "-${n}.jpg", path)
        assert path in source or series in source, f"{path} is not used by any question"
