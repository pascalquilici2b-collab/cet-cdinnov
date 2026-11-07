"""Exact, bounded rectangle search on the one-pixel-per-PDF-point mask.

Each row is an integer bitset. Window unions and consecutive free-pixel tests
therefore run in native integer operations rather than a Python loop per pixel.
No occupied pixel is removed, and no image-processing library is added.
"""
import math

PLACEMENT_VERSION = 'placement-20261107-1'
MAX_PLACEMENT_SEARCHES = 1024


def page_object_bounds(obj):
    """PDFium reports child bounds in their enclosing Form's coordinates."""
    import pypdfium2 as pdfium
    bounds = obj.get_bounds()
    transform = pdfium.PdfMatrix()
    parent = obj.container
    while parent is not None:
        transform = transform.multiply(parent.get_matrix())
        parent = parent.container
    return transform.on_rect(*bounds)


def free_rectangle(mask, width, height, margin=7, edge=5):
    if not all(math.isfinite(v) and v > 0 for v in (width, height)):
        return None
    box_width, box_height = math.ceil(width)+2*margin, math.ceil(height)+2*margin
    if box_width > mask.width-2*edge or box_height > mask.height-2*edge:
        return None
    # Preserve every nonzero source value, including anti-aliased thin rules.
    binary = mask.point(lambda value: 255 if value else 0, mode='1')
    try:
        packed = binary.tobytes()
    finally:
        binary.close()
    stride = (mask.width+7)//8
    padding = stride*8-mask.width
    rows = [int.from_bytes(packed[y*stride:(y+1)*stride], 'big') >> padding
            for y in range(mask.height)]
    # Block prefix/suffix unions answer each vertical window in constant time.
    prefix, suffix = rows.copy(), rows.copy()
    for y in range(1, mask.height):
        if y % box_height:
            prefix[y] |= prefix[y-1]
    for y in range(mask.height-2, -1, -1):
        if (y+1) % box_height:
            suffix[y] |= suffix[y+1]
    interior = ((1 << (mask.width-2*edge))-1) << edge
    for top in range(edge, mask.height-box_height-edge+1):
        occupied = suffix[top] | prefix[top+box_height-1]
        runs = ~occupied & interior
        # A surviving bit marks the right end of a fully empty horizontal run.
        length, shift = 1, 1
        while length < box_width and runs:
            step = min(shift, box_width-length)
            runs &= runs >> step
            length += step
            shift *= 2
        if runs:
            left = mask.width-runs.bit_length()-box_width+1
            return left+margin, top+margin
    return None
