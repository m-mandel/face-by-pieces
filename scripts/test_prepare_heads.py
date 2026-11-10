"""Synthetic end-to-end checks for the conversion script; no real data is modified."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location("prepare_heads", Path(__file__).with_name("prepare-heads.py"))
heads = importlib.util.module_from_spec(spec)
spec.loader.exec_module(heads)


class HeadPreparationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.folder = self.root / 'input' / 'example_person'
        self.transparent = self.folder / 'transparent'
        self.transparent.mkdir(parents=True)
        self.out = self.root / 'output'
        self.groups = [{"order": "ordered", "layers": ["face-outline", "eyes"]}]
        self.settings = {"size": 256, "margin": 0.06, "minimum_pixels": 200}
        merged = Image.new('RGBA', (300, 400), 'white')
        for name in ['face-outline', 'eyes', 'body']:
            image = Image.new('RGBA', (300, 400), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            if name == 'face-outline':
                draw.ellipse((80, 40, 220, 220), outline='black', width=4)
            elif name == 'eyes':
                for x in [115, 175]:
                    draw.ellipse((x - 8, 115, x + 8, 127), fill='black')
            else:
                draw.rectangle((30, 260, 270, 399), fill='black')
            image.save(self.transparent / f'{name}.png')
            if name != 'body':
                merged.alpha_composite(image)
        self.source = self.root / 'source.png'
        self.no_bg = self.root / 'background_removed.png'
        merged.convert('RGB').save(self.source)
        merged.convert('RGB').save(self.no_bg)

    def prepare(self, no_bg=True, override=None):
        return heads.prepare_subject(self.folder, self.source, self.no_bg if no_bg else None,
                                     self.out, self.groups, self.settings, override or {}, False)

    def test_shared_transform_excludes_body_and_preserves_photo_alignment(self):
        original_bytes = self.source.read_bytes()
        metadata, cached = self.prepare()
        self.assertFalse(cached)
        self.assertEqual(metadata['layers'], ['eyes', 'face-outline'])
        self.assertLess(metadata['crop_box'][3], 260)
        layer_root = self.out / 'line-art/example_person'
        photo_root = self.out / 'sources/example_person'
        self.assertFalse((layer_root / 'transparent/body.png').exists())
        drawing = heads.ink(Image.open(layer_root / 'merged-white.png'))
        for filename in ['source.png', 'source-no-bg.png']:
            photo = heads.ink(Image.open(photo_root / filename))
            self.assertLess(np.mean(drawing != photo), 0.005, filename)
        self.assertEqual(original_bytes, self.source.read_bytes())
        self.assertTrue(self.prepare()[1], 'unchanged inputs use the cache')
        self.assertFalse(self.prepare(override={'crop_box': [20, 10, 280, 270]})[1], 'framing changes invalidate the cache')

    def test_mismatched_photo_canvases_fail_before_writing(self):
        Image.new('RGB', (100, 100), 'white').save(self.no_bg)
        with self.assertRaisesRegex(ValueError, 'photo canvas'):
            self.prepare()
        self.assertFalse(self.out.exists())

    def test_recorded_photo_alignment_applies_to_both_photo_variants(self):
        for path in [self.source, self.no_bg]:
            with Image.open(path) as image:
                shifted = Image.new('RGB', image.size, 'white')
                shifted.paste(image, (12, 24))
                shifted.save(path)
        self.prepare(override={'photo_transform': {'scale': 1, 'translate': [-0.04, -0.06]}})
        drawing = heads.ink(Image.open(self.out / 'line-art/example_person/merged-white.png'))
        for filename in ['source.png', 'source-no-bg.png']:
            photo = heads.ink(Image.open(self.out / 'sources/example_person' / filename))
            self.assertLess(np.mean(drawing != photo), 0.005, filename)

    def test_detached_mislabeled_strokes_do_not_shrink_the_head(self):
        path = self.transparent / 'face-outline.png'
        with Image.open(path) as image:
            ImageDraw.Draw(image).line((145, 340, 150, 375), fill='black', width=5)
            image.save(path)
        metadata, _ = self.prepare()
        self.assertLess(metadata['crop_box'][3], 260)

    def test_missing_cutout_never_creates_a_fake_background_removed_photo(self):
        metadata, _ = self.prepare(no_bg=False)
        self.assertIsNone(metadata['source_no_bg'])
        self.assertTrue((self.out / 'sources/example_person/source.png').exists())
        self.assertFalse((self.out / 'sources/example_person/source-no-bg.png').exists())

    def test_aliases_match_underscore_and_hyphen_folder_names(self):
        self.assertEqual(heads.subject_id('Albert_Einstein'), 'albert-einstein')


if __name__ == '__main__':
    unittest.main()
