#!/usr/bin/env python3
"""Prepare aligned head-only layers/photos without modifying the original data.

python3 -m pip install -r scripts/head-requirements.txt
python3 scripts/prepare-heads.py --help
"""

import argparse
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

try:
    import cv2
    import numpy as np
    from PIL import Image
except ImportError as error:
    sys.exit(f"{error}. Install dependencies: python3 -m pip install -r scripts/head-requirements.txt")

ROOT = Path(__file__).resolve().parent.parent
EXCLUDED = {"body", "necklace", "accessories", "unassigned"}
FEATURES = {"eyes", "eyebrows", "nose", "mouth", "eyewear"}
PHOTO_NAMES = ["source.png", "source.jpg", "source.jpeg", "source.webp"]
NO_BG_NAMES = ["source-no-bg.png", "source_no_bg.png", "background_removed.png"]


def subject_id(name):
    return name.lower().replace("_", "-")


def folders_by_id(root):
    result = {}
    if not root.is_dir():
        return result
    for folder in sorted(root.iterdir()):
        if folder.is_dir() and not folder.name.startswith("."):
            key = subject_id(folder.name)
            if key in result:
                raise ValueError(f"Duplicate subject folders: {result[key]} and {folder}")
            result[key] = folder
    return result


def find_file(folder, names):
    return next((folder / name for name in names if folder and (folder / name).is_file()), None)


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.is_file() else default


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def fingerprint(paths, settings):
    value = hashlib.sha256(json.dumps(settings, sort_keys=True).encode())
    for path in paths:
        value.update(str(path.resolve()).encode())
        with path.open("rb") as stream:
            value.update(hashlib.file_digest(stream, "sha256").digest())
    return value.hexdigest()


def ink(image):
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint16)
    # Match the existing game's meaningful ink threshold on a white background.
    darkness = (255 - rgba[:, :, :3].min(axis=2)) * rgba[:, :, 3] // 255
    return (darkness >= 32).astype(np.uint8)


def bounds(mask):
    points = cv2.findNonZero(mask)
    if points is None:
        raise ValueError("No visible head pixels")
    x, y, width, height = cv2.boundingRect(points)
    return x, y, x + width, y + height


def head_region(masks):
    """Reject distant segmentation debris while retaining disconnected features."""
    union = np.maximum.reduce(list(masks.values()))
    if not union.any():
        raise ValueError("No visible head pixels after clipping")
    core = [mask for name, mask in masks.items() if name in FEATURES and mask.any()]
    anchor = np.maximum.reduce(core) if core else union
    ys, xs = np.where(anchor)
    # Robust bounds keep isolated misclassified pixels from enlarging the head.
    ax0, ax1 = np.quantile(xs, [0.005, 0.995])
    ay0, ay1 = np.quantile(ys, [0.005, 0.995])
    span = max(ax1 - ax0, (ay1 - ay0) * 1.4, 20)
    cx = (ax0 + ax1) / 2
    nearby = np.zeros_like(union)
    nearby[max(0, int(ay0 - 2.2 * span)):min(union.shape[0], int(ay1 + 2.2 * span)),
           max(0, int(cx - 2 * span)):min(union.shape[1], int(cx + 2 * span))] = 1
    candidate = union * nearby
    # Analyze connected ink, rather than the full rectangular image canvas.
    radius = max(2, round(span * 0.035))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1))
    joined = cv2.dilate(candidate, kernel)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(joined)
    weights = np.bincount(labels[candidate > 0], minlength=count)
    weights[0] = 0
    primary = int(weights.argmax())
    px, py, pw, ph, _ = stats[primary]
    reach = span * 0.4
    kept = np.zeros_like(union)
    minimum = max(6, int(candidate.sum() * 0.002))
    for label in range(1, count):
        component = (labels == label) & (candidate > 0)
        x, y, w, h, _ = stats[label]
        near_head = x + w >= px - reach and x <= px + pw + reach and y + h >= py - reach and y <= py + ph + reach
        if component.sum() >= minimum and near_head:
            kept[component] = 1
    return kept


def photo_mask(head_ink, masks):
    """Fill the head's outline, keeping concave gaps below hair and the chin.

    This uses the existing segmentation, not an independent photo crop/detector.
    A small feathered expansion allows for photo/drawing outline differences.
    """
    x0, y0, x1, y1 = bounds(head_ink)
    span = max(x1 - x0, y1 - y0)
    radius = max(2, round(span * 0.025))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1,) * 2)
    connected = cv2.morphologyEx(head_ink, cv2.MORPH_CLOSE, kernel)
    connected = cv2.dilate(connected, kernel)
    contours, _ = cv2.findContours(connected, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(head_ink)
    cv2.drawContours(filled, contours, -1, 255, thickness=cv2.FILLED)
    # Open drawing strokes must not create white stripes across the photo's
    # forehead, cheeks, or hair. Fill their envelope down to the estimated chin,
    # while retaining the large concave gap between long hair below the chin.
    mouth_y = np.where(masks.get("mouth", head_ink))[0]
    eye_y = np.where(masks.get("eyes", masks.get("eyewear", head_ink)))[0]
    chin = int(np.median(mouth_y) + 0.8 * max(1, np.median(mouth_y) - np.median(eye_y))) if len(mouth_y) and len(eye_y) else y1
    hull = cv2.convexHull(cv2.findNonZero(head_ink))
    envelope = np.zeros_like(head_ink)
    cv2.fillConvexPoly(envelope, hull, 255)
    envelope = cv2.dilate(envelope, kernel)
    filled[:chin] = np.maximum(filled[:chin], envelope[:chin])
    return Image.fromarray(cv2.GaussianBlur(filled, (3, 3), 0.6))


def square_crop(head_bounds, analysis_size, original_size, margin):
    sx, sy = original_size[0] / analysis_size[0], original_size[1] / analysis_size[1]
    x0, y0, x1, y1 = head_bounds
    x0, x1, y0, y1 = x0 * sx, x1 * sx, y0 * sy, y1 * sy
    side = math.ceil(max(x1 - x0, y1 - y0) * (1 + 2 * margin))
    left, top = math.floor((x0 + x1 - side) / 2), math.floor((y0 + y1 - side) / 2)
    return [left, top, left + side, top + side]


def frame(image, crop, size, background=None):
    image = image.convert("RGBA").crop(tuple(crop)).resize((size, size), Image.Resampling.LANCZOS)
    if background is not None:
        canvas = Image.new("RGBA", image.size, background)
        canvas.alpha_composite(image)
        return canvas.convert("RGB")
    return image


def align_photo(image, transform):
    """Apply one recorded uniform scale/translation to both photo variants."""
    if not transform:
        return image.convert("RGBA")
    scale = transform["scale"]
    dx, dy = transform["translate"]
    width, height = image.size
    return image.convert("RGBA").transform(image.size, Image.Transform.AFFINE,
        (1 / scale, 0, -dx * width / scale, 0, 1 / scale, -dy * height / scale),
        Image.Resampling.BICUBIC, fillcolor=(255, 255, 255, 0))


def prepare_subject(folder, source, no_bg, output, groups, settings, override, force):
    config_ids = {name for group in groups for name in group["layers"]} - EXCLUDED
    report = read_json(folder / "report.json", {})
    inputs = sorted((folder / "transparent").glob("*.png"))
    selected = [path for path in inputs if path.stem in config_ids
                and report.get("class_pixels", {}).get(path.stem, settings["minimum_pixels"]) >= settings["minimum_pixels"]]
    if not selected:
        raise ValueError(f"{folder.name}: no eligible head layers")
    metadata_inputs = [p for p in [folder / "report.json", folder / "labels.json", source, no_bg] if p and p.is_file()]
    signature = fingerprint([Path(__file__), *inputs, *metadata_inputs], {**settings, "groups": groups, "override": override})
    target = output / "line-art" / folder.name
    photo_target = output / "sources" / folder.name
    previous = read_json(target / "generation.json", {})
    expected = previous.get("outputs", [])
    if not force and previous.get("fingerprint") == signature and expected and all((output / name).is_file() for name in expected):
        return previous, True

    with Image.open(selected[0]) as first:
        original_size = first.size
    ratio = min(1, 1024 / max(original_size))
    analysis_size = tuple(round(v * ratio) for v in original_size)
    masks = {}
    for path in selected:
        with Image.open(path) as image:
            if image.size != original_size:
                raise ValueError(f"{path}: layer canvas {image.size} differs from {original_size}")
            masks[path.stem] = ink(image.resize(analysis_size, Image.Resampling.LANCZOS))
    clip_box = override.get("clip_box", [0, 0, 1, 1])
    clip_rect = [round(value * analysis_size[index % 2]) for index, value in enumerate(clip_box)]
    clip_mask = np.zeros((analysis_size[1], analysis_size[0]), dtype=np.uint8)
    clip_mask[clip_rect[1]:clip_rect[3], clip_rect[0]:clip_rect[2]] = 1
    masks = {name: mask * clip_mask for name, mask in masks.items()}
    for path in [source, no_bg]:
        if path:
            with Image.open(path) as image:
                if image.size != original_size:
                    raise ValueError(f"{path}: photo canvas {image.size} differs from layers {original_size}; align the input before converting")

    region = head_region(masks)
    crop = override.get("crop_box") or square_crop(bounds(region), analysis_size, original_size, settings["margin"])
    if len(crop) != 4 or crop[2] <= crop[0] or crop[3] <= crop[1]:
        raise ValueError(f"{folder.name}: invalid crop_box")
    # This rectangle removes faraway mislabeled pixels from every layer equally.
    x0, y0, x1, y1 = bounds(region)
    padding = max(2, round(max(x1 - x0, y1 - y0) * 0.015))
    region_box = [max(0, x0 - padding), max(0, y0 - padding), min(analysis_size[0], x1 + padding), min(analysis_size[1], y1 + padding)]
    clipping = Image.new("L", analysis_size, 0)
    clipping.paste(255, tuple(region_box))
    clipping = Image.fromarray(np.asarray(clipping) * clip_mask)
    clipping = clipping.resize(original_size, Image.Resampling.NEAREST)
    size = settings["size"]
    target.mkdir(parents=True, exist_ok=True)
    photo_target.mkdir(parents=True, exist_ok=True)
    for kind in ["transparent", "white"]:
        (target / kind).mkdir(exist_ok=True)
    outputs = []

    def save(image, path):
        image.save(path, compress_level=6)
        outputs.append(str(path.relative_to(output)))

    merged = Image.new("RGBA", (size, size), "white")
    counts, original_counts = {}, {}
    excluded = {path.stem: "not a retained head layer" if path.stem not in config_ids else "below minimum input pixel count" for path in inputs if path not in selected}
    retained = []
    for path in selected:
        with Image.open(path) as image:
            rgba = np.array(image.convert("RGBA"))
            rgba[:, :, 3] = np.minimum(rgba[:, :, 3], np.asarray(clipping))
            image = frame(Image.fromarray(rgba), crop, size)
        count = int(ink(image).sum())
        if count < settings["minimum_pixels"]:
            excluded[path.stem] = "below minimum output pixel count"
            continue
        counts[path.stem] = count
        original_counts[path.stem] = report.get("class_pixels", {}).get(path.stem)
        retained.append(path.stem)
        save(image, target / "transparent" / path.name)
        save(Image.alpha_composite(Image.new("RGBA", image.size, "white"), image).convert("RGB"), target / "white" / path.name)
        merged.alpha_composite(image)
    if not retained:
        raise ValueError(f"{folder.name}: crop removed all layers")
    save(merged.convert("RGB"), target / "merged-white.png")
    # Delete stale generated layers, never anything in the original data folders.
    for kind in ["transparent", "white"]:
        for path in (target / kind).glob("*.png"):
            if path.stem not in retained:
                path.unlink()

    mask = photo_mask(region, masks).resize(original_size, Image.Resampling.LANCZOS)
    if override.get("photo_polygon"):
        from PIL import ImageDraw
        mask = Image.new("L", original_size, 0)
        ImageDraw.Draw(mask).polygon([(round(x * original_size[0]), round(y * original_size[1])) for x, y in override["photo_polygon"]], fill=255)
    if source:
        with Image.open(source) as image:
            save(frame(align_photo(image, override.get("photo_transform")), crop, size, "white"), photo_target / "source.png")
    elif (photo_target / "source.png").exists():
        (photo_target / "source.png").unlink()
    cutout_input = source if override.get("use_source_for_cutout") else no_bg
    if cutout_input:
        with Image.open(cutout_input) as image:
            photo = align_photo(image, override.get("photo_transform"))
            alpha = np.minimum(np.asarray(photo.getchannel("A")), np.asarray(mask))
            photo.putalpha(Image.fromarray(alpha))
            save(frame(photo, crop, size, "white"), photo_target / "source-no-bg.png")
    elif (photo_target / "source-no-bg.png").exists():
        (photo_target / "source-no-bg.png").unlink()

    labels = folder / "labels.json"
    if labels.is_file():
        shutil.copyfile(labels, target / "labels.json")
        outputs.append(str((target / "labels.json").relative_to(output)))
    output_report = {"subject": subject_id(folder.name), "size": [size, size], "class_pixels": counts,
                     "original_class_pixels": original_counts, "framing": {"width": size, "height": size, "viewBox": [0, 0, size, size]}}
    write_json(target / "report.json", output_report)
    outputs.append(str((target / "report.json").relative_to(output)))
    metadata = {"subject": subject_id(folder.name), "fingerprint": signature, "input_size": list(original_size),
                "canvas_size": [size, size], "crop_box": crop, "layers": retained, "excluded": excluded,
                "groups": [{**group, "layers": [name for name in group["layers"] if name in retained]} for group in groups],
                "source": str(source) if source else None, "source_no_bg": str(no_bg) if no_bg else None,
                "cutout_input": str(cutout_input) if cutout_input else None, "overrides": override,
                "outputs": outputs, "framing_policy": f"Shared head crop with {settings['margin']:.0%} margin; photo cutout follows the head-layer silhouette"}
    write_json(target / "generation.json", metadata)
    return metadata, False


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--layers", type=Path, default=ROOT / "data/line-art")
    parser.add_argument("--sources", type=Path, default=ROOT / "data/sources")
    parser.add_argument("--output", type=Path, default=ROOT / "data-head")
    parser.add_argument("--no-bg-root", type=Path, action="append", help="Subject folders containing existing source-no-bg.png or background_removed.png; repeatable")
    parser.add_argument("--config", type=Path, default=ROOT / "src/config/layer-order.json")
    parser.add_argument("--overrides", type=Path, default=ROOT / "src/config/head-framing.json")
    parser.add_argument("--subject", action="append", help="Convert only this subject; repeatable; accepts underscores or hyphens")
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--margin", type=float, default=0.06)
    parser.add_argument("--minimum-pixels", type=int, default=200)
    parser.add_argument("--force", action="store_true", help="Regenerate even when inputs match the previous run")
    parser.add_argument("--check", action="store_true", help="List missing sources without generating assets")
    args = parser.parse_args()
    if args.size < 64 or not 0 <= args.margin <= 0.5 or args.minimum_pixels < 1:
        parser.error("Use size >= 64, margin between 0 and 0.5, and minimum-pixels >= 1")
    for source_root in [args.layers, args.sources]:
        if not source_root.is_dir():
            parser.error(f"Input directory does not exist: {source_root}")
        if args.output.resolve() == source_root.resolve() or source_root.resolve() in args.output.resolve().parents or args.output.resolve() in source_root.resolve().parents:
            parser.error("Output must be separate from the original input directories")
    roots = args.no_bg_root if args.no_bg_root is not None else [
        ROOT.parent / "abstraction/data/sources-no-bg", ROOT.parent / "abstraction/data/line_art_4",
    ]
    source_folders = folders_by_id(args.sources)
    no_bg_folders = [source_folders, *(folders_by_id(root) for root in roots)]
    subjects = folders_by_id(args.layers)
    requested = {subject_id(name) for name in args.subject or []}
    if requested - subjects.keys():
        parser.error(f"Unknown subjects: {', '.join(sorted(requested - subjects.keys()))}")
    groups = read_json(args.config)["groups"]
    overrides = read_json(args.overrides, {})
    settings = {"size": args.size, "margin": args.margin, "minimum_pixels": args.minimum_pixels}
    summary = {"subjects": [], "missing_sources": [], "missing_source_no_bg": [],
               "sources_without_layers": sorted(source_folders.keys() - subjects.keys()), "errors": []}
    for key, folder in subjects.items():
        if requested and key not in requested:
            continue
        source = find_file(source_folders.get(key), PHOTO_NAMES)
        no_bg = next((found for index in no_bg_folders if (found := find_file(index.get(key), NO_BG_NAMES))), None)
        if source is None:
            summary["missing_sources"].append(key)
        if no_bg is None:
            summary["missing_source_no_bg"].append(key)
        if args.check:
            summary["subjects"].append(key)
            continue
        try:
            metadata, cached = prepare_subject(folder, source, no_bg, args.output, groups, settings, overrides.get(key, {}), args.force)
            summary["subjects"].append(key)
            print(f"{'Unchanged' if cached else 'Prepared'} {key}: {len(metadata['layers'])} head layers", flush=True)
        except (ValueError, OSError) as error:
            summary["errors"].append({"subject": key, "error": str(error)})
            print(f"ERROR {key}: {error}", file=sys.stderr, flush=True)
    if not args.check:
        args.output.mkdir(parents=True, exist_ok=True)
        suffix = "-selected" if requested else ""
        write_json(args.output / f"preparation-report{suffix}.json", summary)
    print(f"\nSubjects: {len(summary['subjects'])}; errors: {len(summary['errors'])}")
    for field, label in [("missing_sources", "Missing sources"), ("missing_source_no_bg", "Missing background-removed sources")]:
        print(f"{label} ({len(summary[field])}): {', '.join(summary[field]) or 'none'}")
    if summary["sources_without_layers"]:
        print(f"Not converted (no matching drawing layers): {', '.join(summary['sources_without_layers'])}")
    return 1 if summary["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
