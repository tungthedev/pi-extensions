import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

import type { Align } from "./types.ts";

export interface InlineSegment {
  align: Align;
  priority?: number;
  renderInline: (maxWidth: number) => string;
}

export class WidgetRowRegistry {
  private segments = new Map<string, InlineSegment>();
  private versionValue = 0;

  constructor(private readonly tui: { requestRender(): void }) {}

  get version(): number {
    return this.versionValue;
  }

  set(key: string, segment: InlineSegment): void {
    this.segments.set(key, segment);
    this.versionValue += 1;
    this.tui.requestRender();
  }

  remove(key: string): void {
    if (!this.segments.delete(key)) return;
    this.versionValue += 1;
    this.tui.requestRender();
  }

  clear(): void {
    if (this.segments.size === 0) return;
    this.segments.clear();
    this.versionValue += 1;
    this.tui.requestRender();
  }

  snapshot(): InlineSegment[] {
    return [...this.segments.values()];
  }
}

function sortByPriority(segments: InlineSegment[]): InlineSegment[] {
  return [...segments].sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0));
}

function joinGroup(segments: InlineSegment[], width: number, gap: string): string {
  if (segments.length === 0) return "";

  return sortByPriority(segments)
    .map((segment) => segment.renderInline(width))
    .filter((segment) => segment.length > 0)
    .join(gap);
}

function clampToWidth(text: string, width: number): string {
  if (width <= 0) return "";
  return truncateToWidth(text, width);
}

function layoutLine(segments: InlineSegment[], width: number, gap: string): string {
  if (width <= 0) return "";

  const grouped: Record<Align, InlineSegment[]> = {
    left: [],
    center: [],
    right: [],
  };

  for (const segment of segments) {
    grouped[segment.align].push(segment);
  }

  const renderGroup = (align: Align, budget: number): string =>
    joinGroup(grouped[align], budget, gap);

  let left = renderGroup("left", width);
  let center = renderGroup("center", width);
  let right = renderGroup("right", width);

  let leftWidth = visibleWidth(left);
  let centerWidth = visibleWidth(center);
  let rightWidth = visibleWidth(right);

  const shrinkCenter = () => {
    const budget = Math.max(0, width - leftWidth - rightWidth);
    if (centerWidth <= budget) return;
    center = renderGroup("center", budget);
    if (visibleWidth(center) > budget) {
      center = clampToWidth(center, budget);
    }
    centerWidth = visibleWidth(center);
  };

  shrinkCenter();

  if (leftWidth + rightWidth > width) {
    const rightBudget = Math.max(0, width - leftWidth);
    if (rightWidth > rightBudget) {
      right = renderGroup("right", rightBudget);
      if (visibleWidth(right) > rightBudget) {
        right = clampToWidth(right, rightBudget);
      }
      rightWidth = visibleWidth(right);
    }
  }

  if (leftWidth + rightWidth > width) {
    const leftBudget = Math.max(0, width - rightWidth);
    if (leftWidth > leftBudget) {
      left = renderGroup("left", leftBudget);
      if (visibleWidth(left) > leftBudget) {
        left = clampToWidth(left, leftBudget);
      }
      leftWidth = visibleWidth(left);
    }
  }

  if (leftWidth + rightWidth > width) {
    const rightBudget = Math.max(0, width - leftWidth);
    if (rightWidth > rightBudget) {
      right = renderGroup("right", rightBudget);
      if (visibleWidth(right) > rightBudget) {
        right = clampToWidth(right, rightBudget);
      }
      rightWidth = visibleWidth(right);
    }
  }

  const availableCenter = Math.max(0, width - leftWidth - rightWidth);
  if (centerWidth > availableCenter) {
    center = renderGroup("center", availableCenter);
    if (visibleWidth(center) > availableCenter) {
      center = clampToWidth(center, availableCenter);
    }
    centerWidth = visibleWidth(center);
  }

  const centerPadding = Math.max(0, availableCenter - centerWidth);
  const padLeft = Math.floor(centerPadding / 2);
  const padRight = centerPadding - padLeft;

  return truncateToWidth(left + " ".repeat(padLeft) + center + " ".repeat(padRight) + right, width);
}

export class HorizontalLineWidget {
  private cachedWidth?: number;
  private cachedLines?: string[];
  private cachedVersion?: number;

  constructor(
    private readonly getSegments: () => InlineSegment[],
    private readonly getVersion?: () => number,
    private readonly gap = " · ",
  ) {}

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
    this.cachedVersion = undefined;
  }

  render(width: number): string[] {
    const version = this.getVersion?.();
    if (
      this.cachedLines &&
      this.cachedWidth === width &&
      (!this.getVersion || (version != null && version === this.cachedVersion))
    ) {
      return this.cachedLines;
    }

    const segments = this.getSegments();
    const lines = segments.length === 0 ? [] : [layoutLine(segments, width, this.gap)];
    this.cachedWidth = width;
    this.cachedLines = lines;
    this.cachedVersion = version;
    return lines;
  }
}
