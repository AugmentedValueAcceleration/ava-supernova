/**
 * KIT, inside Blender and GIMP scripts: the brand kit for this project, so a
 * script uses its real colours and logos instead of typing guesses. Runs in both
 * runners, placed into each as Python.
 */
// prettier-ignore
export const KIT_PY = String.raw`
class _Kit:
    """The brand kit for this project. KIT.name, KIT.colour('primary'),
    KIT.rgba('primary') for Blender, KIT.font('heading'), KIT.logo('mark') for a real file path."""
    def __init__(self, data):
        self._data = data or None
        self.name = data['name'] if data else None
    def __bool__(self):
        return self._data is not None
    def _need(self):
        if not self._data:
            raise ValueError('There is no brand kit for this project. Ask them whether to link one or make one.')
        return self._data
    @property
    def style(self):
        return list(self._need().get('style') or [])
    def colour(self, role='primary'):
        palette = self._need()['palette']
        if role not in palette:
            raise ValueError(f'The kit has no colour "{role}". It has: {sorted(palette)}')
        return palette[role]
    def rgba(self, role='primary', alpha=1.0):
        h = self.colour(role).lstrip('#')
        def linear(s):
            return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4
        return tuple(linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (alpha,)
    def font(self, use='heading'):
        fonts = self._need().get('fonts') or {}
        if not fonts.get(use):
            raise ValueError(f'The kit has no "{use}" font yet. It has: {sorted(k for k, v in fonts.items() if v) or "none yet"}')
        return fonts[use]
    def logo(self, slot='primary'):
        logos = self._need().get('logos') or {}
        if slot not in logos:
            raise ValueError(f'The kit has no "{slot}" logo. It has: {sorted(logos) or "none yet"}')
        # The making record lists what was brought into the work: a kit logo is.
        if slot not in KIT_LOGOS_USED:
            KIT_LOGOS_USED.append(slot)
        return logos[slot]
KIT_LOGOS_USED = []
KIT = _Kit(JOB.get('kit'))
`;
